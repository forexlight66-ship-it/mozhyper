// src/context/WebSocketContext.tsx

'use client';

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { getWebSocket, switchWebSocketUrl } from '@/lib/websocket';

type ConnectionStatus = 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting';

interface WebSocketContextValue {
  sendRequest: (payload: any) => Promise<any>;
  subscribe: (msgType: string, handler: (data: any) => void) => void;
  unsubscribe: (msgType: string, handler: (data: any) => void) => void;
  forget: (subscriptionId: string) => Promise<any>;
  authorize: (token: string) => Promise<any>;
  switchToUrl: (url: string) => void;
  status: ConnectionStatus;
  isConnected: boolean;
  isAuthorized: boolean;
  registerSubscription: (key: string, request: any, handler: (data: any) => void) => void;
  unregisterSubscription: (key: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const wsManager = useRef(getWebSocket());
  const [status, setStatus] = useState<ConnectionStatus>(wsManager.current.getConnectionStatus());
  const [isConnected, setIsConnected] = useState(wsManager.current.isConnected());
  const [isAuthorized, setIsAuthorized] = useState(wsManager.current.isAuthorized());

  useEffect(() => {
    const handler = (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      setIsConnected(newStatus === 'open');
      setIsAuthorized(wsManager.current.isAuthorized());
    };
    const unsubscribe = wsManager.current.onStatusChange(handler);
    return unsubscribe;
  }, []);

  const sendRequest = (payload: any) => wsManager.current.sendRequest(payload);
  const subscribe = (msgType: string, handler: (data: any) => void) =>
    wsManager.current.subscribe(msgType, handler);
  const unsubscribe = (msgType: string, handler: (data: any) => void) =>
    wsManager.current.unsubscribe(msgType, handler);
  const forget = (subscriptionId: string) => wsManager.current.forget(subscriptionId);
  const authorize = (token: string) => wsManager.current.authorize(token);
  const switchToUrl = (url: string) => {
    switchWebSocketUrl(url);
    setStatus('connecting');
  };
  const registerSubscription = (key: string, request: any, handler: (data: any) => void) =>
    wsManager.current.registerSubscription(key, request, handler);
  const unregisterSubscription = (key: string) =>
    wsManager.current.unregisterSubscription(key);

  const value: WebSocketContextValue = {
    sendRequest,
    subscribe,
    unsubscribe,
    forget,
    authorize,
    switchToUrl,
    status,
    isConnected,
    isAuthorized,
    registerSubscription,
    unregisterSubscription,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWebSocket must be used within a WebSocketProvider');
  return context;
};
