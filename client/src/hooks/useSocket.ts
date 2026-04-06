import { useEffect } from 'react';
import { useSocketStore } from '../store/socketStore';

export function useSocket() {
  const { connect, disconnect, connected } = useSocketStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  return { connected };
}
