import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
  | { phase: 'connecting' }
  | { phase: 'scanning' }
  | { phase: 'found'; devices: Device[] }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }
  | { phase: 'manual'; url: string };

const PORT = 4242;
const PROBE_TIMEOUT_MS = 800;
const PROBE_FAST_TIMEOUT_MS = 450;
const PROBE_CONCURRENCY = 24;
const FAVORITES_KEY = 'decker.favoriteDevices';
const PRIMARY_MAC_KEY = 'decker.primaryMac.v1';
const MAX_FAVORITES = 8;

async function probeHost(ip: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<Device | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

function sameSubnet(ip: string, localIP: string): boolean {
  if (!localIP || !ip.includes('.')) return false;
  const prefix = localIP.split('.').slice(0, 3).join('.');
  return ip.startsWith(`${prefix}.`);
}

/** One Mac can answer on multiple IPs — keep the address on the phone's subnet. */
function dedupeDevicesByName(devices: Device[], localIP: string): Device[] {
  const byName = new Map<string, Device>();
  for (const device of devices) {
    const existing = byName.get(device.name);
    if (!existing) {
      byName.set(device.name, device);
      continue;
    }
    const preferDevice =
      sameSubnet(device.ip, localIP) && !sameSubnet(existing.ip, localIP);
    if (preferDevice) byName.set(device.name, device);
  }
  return Array.from(byName.values());
}

function dedupeFavoritesByName(
  favorites: FavoriteDevice[],
  localIP: string
): FavoriteDevice[] {
  const byName = new Map<string, FavoriteDevice>();
  for (const fav of favorites) {
    const existing = byName.get(fav.name);
    if (!existing) {
      byName.set(fav.name, fav);
      continue;
    }
    const preferFav =
      (sameSubnet(fav.ip, localIP) && !sameSubnet(existing.ip, localIP)) ||
      (sameSubnet(fav.ip, localIP) === sameSubnet(existing.ip, localIP) &&
        fav.lastUsedAt > existing.lastUsedAt);
    if (preferFav) byName.set(fav.name, fav);
  }
  return Array.from(byName.values()).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function pickBestDevice(devices: Device[], localIP: string | null): Device | null {
  if (devices.length === 0) return null;
  if (!localIP) return devices[0];
  return dedupeDevicesByName(devices, localIP)[0] ?? devices[0];
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

async function loadPrimaryMac(): Promise<Device | null> {
  try {
    const raw = await AsyncStorage.getItem(PRIMARY_MAC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Device;
    if (typeof parsed?.ip !== 'string' || typeof parsed?.url !== 'string') return null;
    return {
      ip: parsed.ip,
      name: parsed.name || parsed.ip,
      url: parsed.url,
    };
  } catch {
    return null;
  }
}

async function savePrimaryMac(device: Device) {
  try {
    await AsyncStorage.setItem(PRIMARY_MAC_KEY, JSON.stringify(device));
  } catch {
    // best effort
  }
}

async function persistDevice(device: Device): Promise<FavoriteDevice[]> {
  const favs = await loadFavorites();
  const nextEntry: FavoriteDevice = {
    ...device,
    name: device.name || device.ip,
    lastUsedAt: Date.now(),
  };
  const next = [
    nextEntry,
    ...favs.filter((d) => d.ip !== device.ip && d.name !== nextEntry.name),
  ].slice(0, MAX_FAVORITES);
  await saveFavorites(next);
  await savePrimaryMac(device);
  return next;
}

async function refreshFavorites(localIP: string): Promise<FavoriteDevice[]> {
  const favs = await loadFavorites();
  const checks = await Promise.all(
    favs.map(async (fav) => {
      const live = await probeHost(fav.ip, PROBE_FAST_TIMEOUT_MS);
      if (!live) return null;
      return { ...fav, ...live };
    })
  );
  const alive = checks.filter((f): f is FavoriteDevice => f !== null);
  const deduped = dedupeFavoritesByName(alive, localIP);
  if (deduped.length !== favs.length) {
    await saveFavorites(deduped);
  }
  return deduped;
}

function uniqueCandidates(primary: Device | null, favorites: FavoriteDevice[]): Device[] {
  const seen = new Set<string>();
  const out: Device[] = [];
  const add = (device: Device | null) => {
    if (!device || seen.has(device.ip)) return;
    seen.add(device.ip);
    out.push(device);
  };
  add(primary);
  for (const fav of favorites) add(fav);
  return out;
}

export function useDiscovery() {
  const [state, setState] = useState<DiscoveryState>({ phase: 'connecting' });
  const [favorites, setFavorites] = useState<FavoriteDevice[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const runAutoConnect = useCallback(async (): Promise<Device | null> => {
    const [primary, favs, localIP] = await Promise.all([
      loadPrimaryMac(),
      loadFavorites(),
      Network.getIpAddressAsync().catch(() => null),
    ]);
    const candidates = uniqueCandidates(primary, favs);
    if (candidates.length === 0) return null;

    const results = await Promise.all(
      candidates.map((candidate) => probeHost(candidate.ip, PROBE_FAST_TIMEOUT_MS))
    );
    const alive = results.filter((device): device is Device => device !== null);
    return pickBestDevice(alive, localIP);
  }, []);

  const connectDevice = useCallback(async (device: Device) => {
    setState({ phase: 'connecting' });

    const localIP = await Network.getIpAddressAsync().catch(() => '');
    const verified = await probeHost(device.ip, PROBE_TIMEOUT_MS);
    if (!verified) {
      const pruned = (await loadFavorites()).filter((f) => f.ip !== device.ip);
      await saveFavorites(pruned);
      setFavorites(pruned);
      setState({
        phase: 'error',
        message: `${device.ip} is unreachable. Your Mac may have a new IP — tap Scan again.`,
      });
      return;
    }

    const toConnect = verified;

    const next = await persistDevice(toConnect);
    setFavorites(dedupeFavoritesByName(next, localIP));
    setState({ phase: 'manual', url: toConnect.url });
  }, []);

  const rememberDevice = useCallback(async (device: Device) => {
    const next = await persistDevice(device);
    setFavorites(next);
  }, []);

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
    const devices = dedupeDevicesByName(await probeAll(ips), localIP);

    if (devices.length > 0) {
      setState({ phase: 'found', devices });
    } else {
      setState({ phase: 'empty' });
    }
  }, []);

  const tryAutoConnectOnly = useCallback(async (): Promise<boolean> => {
    setState({ phase: 'connecting' });
    const device = await runAutoConnect();
    if (device) {
      await connectDevice(device);
      return true;
    }
    setState({ phase: 'empty' });
    return false;
  }, [connectDevice, runAutoConnect]);

  const tryConnectOrScan = useCallback(async () => {
    setState({ phase: 'connecting' });
    const device = await runAutoConnect();
    if (device) {
      await connectDevice(device);
      return;
    }
    await runScan();
  }, [connectDevice, runAutoConnect, runScan]);

  const leaveDeck = useCallback(() => {
    setState({ phase: 'empty' });
  }, []);

  useEffect(() => {
    void (async () => {
      const localIP = (await Network.getIpAddressAsync().catch(() => '')) ?? '';
      const favs = localIP ? await refreshFavorites(localIP) : await loadFavorites();
      setFavorites(favs);
      void tryAutoConnectOnly();
    })();
  }, [tryAutoConnectOnly]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (stateRef.current.phase !== 'manual') return;
      void (async () => {
        const device = await runAutoConnect();
        if (!device) return;
        const current = stateRef.current;
        if (current.phase !== 'manual') return;
        const currentIp = current.url.replace(/^ws:\/\//, '').split(':')[0];
        if (device.ip === currentIp) return;
        await connectDevice(device);
      })();
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [connectDevice, runAutoConnect]);

  function connectManual(ip: string) {
    const cleanIp = ip.trim();
    void connectDevice({ ip: cleanIp, name: cleanIp, url: `ws://${cleanIp}:${PORT}` });
  }

  function retry() {
    void tryConnectOrScan();
  }

  return {
    state,
    favorites,
    connectManual,
    retry,
    rememberDevice,
    connectDevice,
    leaveDeck,
    tryAutoConnectOnly,
    tryConnectOrScan,
  };
}
