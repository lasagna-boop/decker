import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Device = {
  ip: string;
  name: string;
  url: string;
};

export type FavoriteDevice = Device & {
  lastUsedAt: number;
};

export type DiscoveryState =
  | { phase: 'scanning' }
  | { phase: 'found'; devices: Device[] }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }
  | { phase: 'manual'; url: string };

const PORT = 4242;
const PROBE_TIMEOUT_MS = 800;
const PROBE_CONCURRENCY = 24;
const FAVORITES_KEY = 'decker.favoriteDevices';
const MAX_FAVORITES = 8;

async function probeHost(ip: string): Promise<Device | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}:${PORT}/health`, { signal: controller.signal });
    if (res.ok) {
      const body = await res.json();
      if (body?.status === 'ok') {
        return { ip, name: body.name ?? ip, url: `ws://${ip}:${PORT}` };
      }
    }
  } catch {
    // unreachable — expected for most IPs
  } finally {
    clearTimeout(timer);
  }
  return null;
}

function subnetIPs(localIP: string): string[] {
  const parts = localIP.split('.');
  if (parts.length !== 4) return [];
  const prefix = parts.slice(0, 3).join('.');
  return Array.from({ length: 253 }, (_, i) => `${prefix}.${i + 1}`).filter(
    (ip) => ip !== localIP
  );
}

async function probeAll(ips: string[]): Promise<Device[]> {
  const found: Device[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ips.length) {
      const idx = cursor++;
      const device = await probeHost(ips[idx]);
      if (device) found.push(device);
    }
  }

  const workers = Array.from(
    { length: Math.min(PROBE_CONCURRENCY, ips.length) },
    () => worker()
  );
  await Promise.all(workers);
  return found;
}

async function loadFavorites(): Promise<FavoriteDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteDevice[];
    return parsed
      .filter((d) => typeof d?.ip === 'string' && typeof d?.url === 'string')
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    return [];
  }
}

async function saveFavorites(next: FavoriteDevice[]) {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next.slice(0, MAX_FAVORITES)));
  } catch {
    // best effort
  }
}

export function useDiscovery() {
  const [state, setState] = useState<DiscoveryState>({ phase: 'scanning' });
  const [favorites, setFavorites] = useState<FavoriteDevice[]>([]);

  useEffect(() => {
    loadFavorites().then(setFavorites);
  }, []);

  const rememberDevice = useCallback(async (device: Device) => {
    const nextEntry: FavoriteDevice = {
      ...device,
      name: device.name || device.ip,
      lastUsedAt: Date.now(),
    };
    const next = [nextEntry, ...favorites.filter((d) => d.ip !== device.ip)].slice(0, MAX_FAVORITES);
    setFavorites(next);
    await saveFavorites(next);
  }, [favorites]);

  const runScan = useCallback(async () => {
    setState({ phase: 'scanning' });

    let localIP: string | null = null;
    try {
      localIP = await Network.getIpAddressAsync();
    } catch {
      setState({ phase: 'error', message: 'Could not read device IP. Are you on Wi-Fi?' });
      return;
    }

    if (!localIP || localIP === '0.0.0.0' || localIP.startsWith('127.')) {
      setState({ phase: 'error', message: 'No Wi-Fi connection detected.' });
      return;
    }

    const ips = subnetIPs(localIP);

    // Probe in capped batches so iOS doesn't choke on 250+ parallel sockets
    const devices = await probeAll(ips);

    if (devices.length > 0) {
      setState({ phase: 'found', devices });
    } else {
      setState({ phase: 'empty' });
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  function connectManual(ip: string) {
    void rememberDevice({ ip, name: ip, url: `ws://${ip}:${PORT}` });
    setState({ phase: 'manual', url: `ws://${ip}:${PORT}` });
  }

  function retry() {
    runScan();
  }

  return { state, favorites, connectManual, retry, rememberDevice };
}
