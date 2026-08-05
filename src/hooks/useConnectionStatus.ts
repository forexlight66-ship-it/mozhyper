// src/hooks/useConnectionStatus.ts

'use client';

import { useWebSocket } from '@/context/WebSocketContext';

export const useConnectionStatus = () => {
  const { status, isConnected, isAuthorized } = useWebSocket();
  return { status, isConnected, isAuthorized };
};
