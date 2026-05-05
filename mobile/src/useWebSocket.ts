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

export function useWebSocket(url: string | null, opts: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => optsRef.current.onOpen?.();
    ws.onclose = () => optsRef.current.onClose?.();
    ws.onerror = () => optsRef.current.onError?.();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        optsRef.current.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    };
  }, [url]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
