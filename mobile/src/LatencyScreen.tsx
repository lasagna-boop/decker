import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useWebSocket, WSMessage } from './useWebSocket';
import { usePing } from './usePing';
import { LatencyChart } from './LatencyChart';

const CYAN = '#00e5ff';
const YELLOW = '#ffd600';
const RED = '#ff3d00';
const GREEN = CYAN;

const AUTO_INTERVALS = [100, 200, 500, 1000, 2000];

function rttColor(rtt: number | null) {
  if (rtt === null) return '#444';
  if (rtt < 20) return GREEN;
  if (rtt < 60) return YELLOW;
  return RED;
}

function formatTs(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

type Props = {
  url: string;
  onDisconnect: () => void;
};

export function LatencyScreen({ url, onDisconnect }: Props) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(0);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intervalMs, setIntervalMs] = useState(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { width } = useWindowDimensions();

  const sendRef = useRef<(msg: object) => void>(() => {});
  const { ping, handlePong, records, currentRtt, stats, reset } = usePing(
    (msg) => sendRef.current(msg)
  );

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type === 'pong') {
        handlePong(msg.id as number);
      } else if (msg.type === 'peers') {
        setPeers(msg.count as number);
      }
    },
    [handlePong]
  );

  const { send } = useWebSocket(url, {
    onMessage: handleMessage,
    onOpen: () => setConnected(true),
    onClose: () => { setConnected(false); },
    onError: () => setConnected(false),
  });

  sendRef.current = send;

  // Auto-ping
  useEffect(() => {
    if (autoEnabled && connected) {
      intervalRef.current = setInterval(ping, intervalMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoEnabled, connected, intervalMs, ping]);

  const chartWidth = width - 32;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>DECKER</Text>
        <View style={styles.headerRight}>
          <View style={[styles.dot, { backgroundColor: connected ? CYAN : '#444' }]} />
          <Text style={styles.status}>{connected ? 'Connected' : 'Disconnected'}</Text>
          {peers > 0 && <Text style={styles.peers}>{peers} peer{peers !== 1 ? 's' : ''}</Text>}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Big RTT */}
        <View style={styles.rttBlock}>
          <Text style={[styles.rttValue, { color: rttColor(currentRtt) }]}>
            {currentRtt !== null ? currentRtt : '—'}
          </Text>
          <Text style={styles.rttUnit}>ms RTT</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {(['min', 'avg', 'max'] as const).map((key) => (
            <View key={key} style={styles.statCell}>
              <Text style={styles.statLabel}>{key.toUpperCase()}</Text>
              <Text style={styles.statValue}>
                {stats ? stats[key] : '—'}
                {stats ? <Text style={styles.statMs}> ms</Text> : null}
              </Text>
            </View>
          ))}
        </View>

        {/* Chart */}
        <View style={styles.chartWrapper}>
          <LatencyChart records={records} width={chartWidth} height={110} />
        </View>

        {/* Tap to ping */}
        <TouchableOpacity
          style={[styles.pingBtn, !connected && styles.pingBtnDisabled]}
          onPress={ping}
          disabled={!connected}
          activeOpacity={0.7}
        >
          <Text style={styles.pingBtnText}>TAP TO PING</Text>
        </TouchableOpacity>

        {/* Auto-ping controls */}
        <View style={styles.autoRow}>
          <Text style={styles.autoLabel}>Auto-ping</Text>
          <Switch
            value={autoEnabled}
            onValueChange={setAutoEnabled}
            trackColor={{ false: '#222', true: CYAN + '60' }}
            thumbColor={autoEnabled ? CYAN : '#555'}
          />
        </View>

        {autoEnabled && (
          <View style={styles.intervalRow}>
            {AUTO_INTERVALS.map((ms) => (
              <TouchableOpacity
                key={ms}
                style={[styles.intervalBtn, intervalMs === ms && styles.intervalBtnActive]}
                onPress={() => setIntervalMs(ms)}
              >
                <Text style={[styles.intervalText, intervalMs === ms && styles.intervalTextActive]}>
                  {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Event log */}
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Event Log</Text>
          <TouchableOpacity onPress={reset}>
            <Text style={styles.clearBtn}>Clear</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.log}>
          {records.length === 0 ? (
            <Text style={styles.logEmpty}>No pings yet</Text>
          ) : (
            [...records].reverse().map((r) => (
              <View key={r.id} style={styles.logRow}>
                <Text style={styles.logTs}>{formatTs(r.ts)}</Text>
                <Text style={styles.logId}>#{r.id}</Text>
                <Text style={[styles.logRtt, { color: rttColor(r.rtt) }]}>{r.rtt} ms</Text>
              </View>
            ))
          )}
        </View>

        {/* Disconnect */}
        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  appName: {
    color: CYAN,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  status: {
    color: '#888',
    fontSize: 12,
  },
  peers: {
    color: '#444',
    fontSize: 11,
    marginLeft: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  rttBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  rttValue: {
    fontSize: 96,
    fontWeight: '200',
    lineHeight: 108,
    letterSpacing: -4,
  },
  rttUnit: {
    color: '#444',
    fontSize: 13,
    letterSpacing: 3,
    marginTop: -4,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
  },
  statLabel: {
    color: '#444',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  statValue: {
    color: '#ccc',
    fontSize: 20,
    fontWeight: '300',
  },
  statMs: {
    color: '#555',
    fontSize: 12,
  },
  chartWrapper: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 12,
  },
  pingBtn: {
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
  },
  pingBtnDisabled: {
    backgroundColor: '#1a1a1a',
  },
  pingBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  autoLabel: {
    color: '#ccc',
    fontSize: 15,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  intervalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  intervalBtnActive: {
    backgroundColor: CYAN + '15',
    borderColor: CYAN,
  },
  intervalText: {
    color: '#666',
    fontSize: 13,
  },
  intervalTextActive: {
    color: CYAN,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logTitle: {
    color: '#555',
    fontSize: 11,
    letterSpacing: 2,
  },
  clearBtn: {
    color: '#444',
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  log: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    minHeight: 80,
  },
  logEmpty: {
    color: '#333',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'baseline',
  },
  logTs: {
    color: '#444',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  logId: {
    color: '#333',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 36,
    textAlign: 'right',
  },
  logRtt: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 56,
    textAlign: 'right',
  },
  disconnectBtn: {
    padding: 12,
    alignItems: 'center',
  },
  disconnectText: {
    color: '#333',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
