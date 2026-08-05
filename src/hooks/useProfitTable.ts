// src/hooks/useProfitTable.ts

'use client';

import { useState, useCallback } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';

export const useProfitTable = () => {
  const { sendRequest } = useWebSocket();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfitTable = useCallback(async (options: any = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sendRequest({ profit_table: 1, ...options });
      if (response.error) throw new Error(response.error.message);
      setTransactions(response.profit_table?.transactions || []);
      setTotalCount(response.profit_table?.count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sendRequest]);

  return { transactions, totalCount, loading, error, fetchProfitTable };
};
