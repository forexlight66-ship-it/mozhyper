// src/lib/websocket.ts

type MessageHandler = (data: any) => void;
type StatusCallback = (status: 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting') => void;

type SubscriptionRequest =
  | { ticks: string; subscribe: 1 }
  | { balance: 1; subscribe: 1 }
  | { proposal_open_contracts: 1; subscribe: 1 }
  | { active_symbols: 'brief' | 'full'; subscribe: 1 }
  | { ticks_history: string; subscribe: 1; end?: string; start?: string; granularity?: number };

interface Subscription {
  request: SubscriptionRequest;
  handler: MessageHandler;
  msgType: string;
}

const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_DERIV_WS_URL ||
  `wss://ws.derivws.com/websockets/v3?app_id=${process.env.NEXT_PUBLIC_DERIV_APP_ID || ''}`;

const REQUEST_TIMEOUT = 30000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private requestId: number = 0;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private isReady: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private authToken: string | null = null;
  private isAuthenticated: boolean = false;
  private statusCallbacks: Set<StatusCallback> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalClose: boolean = false;
  private authorizing: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageTime: number = Date.now();
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(baseUrl: string = DEFAULT_WS_URL) {
    this.url = baseUrl;
    this.connect();
  }

  private setStatus(status: 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting') {
    for (const callback of this.statusCallbacks) {
      callback(status);
    }
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    if (this.ws) {
      callback(this.ws.readyState === WebSocket.OPEN ? 'open' : 'connecting');
    } else {
      callback('connecting');
    }
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  private connect() {
    if (this.intentionalClose) return;
    this.setStatus('connecting');
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      console.log('[WebSocket] Connected');
      this.isReady = true;
      this.reconnectAttempts = 0;
      this.setStatus('open');
      this.startHeartbeat();
      this.restoreSession().catch(console.error);
    };
    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    this.ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      this.isReady = false;
      this.isAuthenticated = false;
      this.setStatus('closed');
      this.stopHeartbeat();
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('WebSocket disconnected'));
      }
      this.pendingRequests.clear();
      if (!this.intentionalClose) {
        this.attemptReconnect();
      }
    };
    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };
  }

  private attemptReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached.');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * 2 ** (this.reconnectAttempts - 1), 30000);
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.setStatus('reconnecting');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(data: any) {
    const msgType = data.msg_type;
    if (msgType && this.handlers.has(msgType)) {
      for (const fn of this.handlers.get(msgType)!) {
        fn(data);
      }
    }
    if (data.req_id !== undefined && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(data.req_id);
      if (data.error) {
        pending.reject(data.error);
      } else {
        pending.resolve(data);
      }
    }
    if (data.msg_type === 'authorize') {
      this.isAuthenticated = !!data.authorize;
      if (this.isAuthenticated) console.log('[WebSocket] Authorized');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastMessageTime = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageTime > HEARTBEAT_TIMEOUT) {
        console.warn('[WebSocket] Heartbeat timeout – forcing reconnect');
        this.ws?.close();
        return;
      }
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ ping: 1 }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async restoreSession() {
    if (this.authToken) {
      await this.authorize(this.authToken);
    }
    this.replaySubscriptions();
  }

  private replaySubscriptions() {
    for (const [key, sub] of this.subscriptions) {
      console.log(`[WebSocket] Replaying subscription: ${key}`);
      this.sendRequest(sub.request).catch(console.error);
    }
  }

  public sendRequest<T = any>(payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }
      const reqId = ++this.requestId;
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error(`Request ${reqId} timed out after ${REQUEST_TIMEOUT}ms`));
        }
      }, REQUEST_TIMEOUT);
      const message = { ...payload, req_id: reqId };
      this.pendingRequests.set(reqId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  public subscribe(msgType: string, handler: MessageHandler) {
    if (!this.handlers.has(msgType)) {
      this.handlers.set(msgType, new Set());
    }
    this.handlers.get(msgType)!.add(handler);
  }

  public unsubscribe(msgType: string, handler: MessageHandler) {
    if (this.handlers.has(msgType)) {
      this.handlers.get(msgType)!.delete(handler);
      if (this.handlers.get(msgType)!.size === 0) {
        this.handlers.delete(msgType);
      }
    }
  }

  public async authorize(token: string) {
    this.authToken = token;
    if (!this.isReady) return;
    try {
      const response = await this.sendRequest({ authorize: token });
      return response;
    } catch (error) {
      console.error('[WebSocket] Authorize error:', error);
      throw error;
    }
  }

  public registerSubscription(key: string, request: SubscriptionRequest, handler: MessageHandler) {
    let expectedMsgType: string;
    if ('ticks' in request) expectedMsgType = 'tick';
    else if ('balance' in request) expectedMsgType = 'balance';
    else if ('proposal_open_contracts' in request) expectedMsgType = 'proposal_open_contracts';
    else if ('active_symbols' in request) expectedMsgType = 'active_symbols';
    else if ('ticks_history' in request) expectedMsgType = 'history';
    else expectedMsgType = 'unknown';

    this.subscriptions.set(key, { request, handler, msgType: expectedMsgType });
    this.subscribe(expectedMsgType, handler);
  }

  public unregisterSubscription(key: string) {
    const sub = this.subscriptions.get(key);
    if (sub) {
      this.unsubscribe(sub.msgType, sub.handler);
      this.subscriptions.delete(key);
    }
  }

  public forget(subscriptionId: string): Promise<any> {
    return this.sendRequest({ forget: subscriptionId });
  }

  public switchUrl(newUrl: string) {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.intentionalClose = true;
      const oldWs = this.ws;
      oldWs.onclose = () => {
        this.ws = null;
        this.isReady = false;
        this.intentionalClose = false;
        this.url = newUrl;
        this.connect();
      };
      oldWs.close();
    } else {
      this.url = newUrl;
      this.connect();
    }
  }

  public close() {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; this.isReady = false; }
  }

  public getConnectionStatus(): 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' {
    if (!this.ws) return 'closed';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'closed';
    }
  }

  public isConnected(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }

  public isAuthorized(): boolean {
    return this.isAuthenticated;
  }
}

let wsInstance: WebSocketManager | null = null;

export const getWebSocket = (url?: string) => {
  if (!wsInstance) wsInstance = new WebSocketManager(url);
  return wsInstance;
};

export const resetWebSocket = () => {
  if (wsInstance) { wsInstance.close(); wsInstance = null; }
};

export const switchWebSocketUrl = (newUrl: string) => {
  if (wsInstance) wsInstance.switchUrl(newUrl);
  else wsInstance = new WebSocketManager(newUrl);
  return wsInstance;
};
