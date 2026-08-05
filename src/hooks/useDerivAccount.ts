// src/hooks/useDerivAccount.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';

export const useDerivAccount = () => {
  const { sendRequest, subscribe, unsubscribe, authorize, isAuthorized, isConnected } = useWebSocket();
  const [balance, setBalance] = useState<any>(null);
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [currency, setCurrency] = useState<string>('USD');

  useEffect(() => {
    if (!isConnected || !isAuthorized) return;

    const handleBalance = (data: any) => {
      if (data.msg_type === 'balance') {
        setBalance(data.balance);
        if (data.balance?.currency) setCurrency(data.balance.currency);
      }
    };

    subscribe('balance', handleBalance);
    sendRequest({ balance: 1, subscribe: 1 }).catch(console.error);

    return () => {
      unsubscribe('balance', handleBalance);
    };
  }, [isConnected, isAuthorized, subscribe, sendRequest, unsubscribe]);

  const fetchAccountInfo = useCallback(async () => {
    if (!isConnected || !isAuthorized) return;
    try {
      const response = await sendRequest({ account_info: 1 });
      if (response.account_info) setAccountInfo(response.account_info);
    } catch (err) {
      console.error('Account info error:', err);
    }
  }, [isConnected, isAuthorized, sendRequest]);

  const login = useCallback(async (token: string) => {
    try {
      await authorize(token);
      await fetchAccountInfo();
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, [authorize, fetchAccountInfo]);

  const logout = useCallback(() => {
    setBalance(null);
    setAccountInfo(null);
  }, []);

  return {
    balance,
    accountInfo,
    currency,
    isAuthorized,
    isConnected,
    login,
    logout,
    fetchAccountInfo,
  };
};
