import { useEffect, useRef, useCallback } from 'react';

export type WSMessage = {
  type: string;
  [key: string]: unknown;
};

type Options = {
  onMessage: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

const RECONNECT_MS = 1500;

export function useWebSocket(url: string | null, opts: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    function connect() {
      if (cancelled) return;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => optsRef.current.onOpen?.();
      ws.onclose = () => {
        optsRef.current.onClose?.();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
      ws.onerror = () => optsRef.current.onError?.();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WSMessage;
          optsRef.current.onMessage(msg);
        } catch {
          // ignore malformed frames
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
};
