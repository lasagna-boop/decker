import { useState, useRef, useCallback } from 'react';

export type PingRecord = {
  id: number;
  ts: number;
  rtt: number;
};

const MAX_HISTORY = 40;

export function usePing(send: (msg: object) => void) {
  const [records, setRecords] = useState<PingRecord[]>([]);
  const [currentRtt, setCurrentRtt] = useState<number | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef<Map<number, number>>(new Map());

  const ping = useCallback(() => {
    const id = ++idRef.current;
    const ts = Date.now();
    pendingRef.current.set(id, ts);
    send({ type: 'ping', id, ts });
  }, [send]);

  const handlePong = useCallback((id: number) => {
    const sentTs = pendingRef.current.get(id);
    if (sentTs === undefined) return;
    pendingRef.current.delete(id);
    const rtt = Date.now() - sentTs;
    const record: PingRecord = { id, ts: Date.now(), rtt };
    setCurrentRtt(rtt);
    setRecords((prev) => {
      const next = [...prev, record];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, []);

  const stats = (() => {
    if (records.length === 0) return null;
    const rtts = records.map((r) => r.rtt);
    return {
      min: Math.min(...rtts),
      max: Math.max(...rtts),
      avg: Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length),
    };
  })();

  function reset() {
    setRecords([]);
    setCurrentRtt(null);
    idRef.current = 0;
    pendingRef.current.clear();
  }

  return { ping, handlePong, records, currentRtt, stats, reset };
}
