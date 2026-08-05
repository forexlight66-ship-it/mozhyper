// src/hooks/useMarketData.ts

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '@/context/WebSocketContext';

export const useMarketData = (symbol: string = 'R_100', autoFetchProposal: boolean = true) => {
  const { sendRequest, subscribe, unsubscribe, forget, registerSubscription, unregisterSubscription } = useWebSocket();
  const [currentTick, setCurrentTick] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const subIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const stableKey = `ticks:${symbol}`;

  const fetchProposal = useCallback(async (params?: any) => {
    const { contractType = 'CALL', amount = 10, duration = 60, basis = 'stake' } = params || {};
    try {
      setLoadingProposal(true);
      loadingRef.current = true;
      const response = await sendRequest({
        proposal: 1,
        amount,
        basis,
        contract_type: contractType,
        currency: 'USD',
        duration,
        duration_unit: 's',
        symbol,
      });
      if (response.proposal) setProposal(response.proposal);
    } catch (err) {
      console.error('Proposal error:', err);
    } finally {
      setLoadingProposal(false);
      loadingRef.current = false;
    }
  }, [sendRequest, symbol]);

  useEffect(() => {
    const handleTick = (data: any) => {
      if (data.msg_type === 'tick') {
        setCurrentTick(data.tick);
        if (autoFetchProposal && !loadingRef.current) {
          fetchProposal();
        }
      }
      if (data.subscription?.id && !subIdRef.current) {
        subIdRef.current = data.subscription.id;
      }
    };

    const tickRequest = { ticks: symbol, subscribe: 1 };
    registerSubscription(stableKey, tickRequest, handleTick);

    sendRequest(tickRequest)
      .then((res) => {
        if (res.subscription?.id) subIdRef.current = res.subscription.id;
      })
      .catch(console.error);

    if (autoFetchProposal) fetchProposal();

    return () => {
      if (subIdRef.current) {
        forget(subIdRef.current).catch(console.error);
        subIdRef.current = null;
      }
      unregisterSubscription(stableKey);
      unsubscribe('tick', handleTick);
    };
  }, [symbol, autoFetchProposal, sendRequest, forget, fetchProposal, registerSubscription, unregisterSubscription, subscribe, unsubscribe, stableKey]);

  return { currentTick, proposal, loadingProposal, fetchProposal };
};
