import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { DiscoveryState, Device, FavoriteDevice } from './useDiscovery';

const CYAN = '#00e5ff';

type Props = {
  state: DiscoveryState;
  favorites: FavoriteDevice[];
  onConnect: (device: Device) => void;
  onManual: (ip: string) => void;
  onRetry: () => void;
};

export function DiscoveryScreen({ state, favorites, onConnect, onManual, onRetry }: Props) {
  const [ipInput, setIpInput] = useState('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>DECKER</Text>
      <Text style={styles.subtitle}>Latency Tester</Text>

      {favorites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FAVORITES</Text>
          <FlatList
            data={favorites}
            keyExtractor={(d) => `favorite-${d.ip}`}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceRow} onPress={() => onConnect(item)} activeOpacity={0.7}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceIp}>{item.ip}:{4242}</Text>
                </View>
                <View style={styles.connectBtn}>
                  <Text style={styles.connectBtnText}>Connect</Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}

      {state.phase === 'scanning' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={CYAN} />
          <Text style={styles.body}>Scanning local network…</Text>
          <Text style={styles.hint}>Make sure the agent is running on your Mac.</Text>
        </View>
      )}

      {state.phase === 'found' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DEVICES FOUND</Text>
          <FlatList
            data={state.devices}
            keyExtractor={(d) => d.ip}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceRow} onPress={() => onConnect(item)} activeOpacity={0.7}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceIp}>{item.ip}:{4242}</Text>
                </View>
                <View style={styles.connectBtn}>
                  <Text style={styles.connectBtnText}>Connect</Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
          <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>Scan again</Text>
          </TouchableOpacity>
        </View>
      )}

      {(state.phase === 'empty' || state.phase === 'error') && (
        <View style={styles.center}>
          <Text style={styles.warn}>
            {state.phase === 'error' ? state.message : 'No Decker agents found'}
          </Text>
          <Text style={styles.hint}>
            Enter your Mac's local IP manually{'\n'}(shown in the agent terminal):
          </Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="192.168.1.x"
              placeholderTextColor="#444"
              value={ipInput}
              onChangeText={setIpInput}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={() => ipInput.trim() && onManual(ipInput.trim())}
            />
            <TouchableOpacity
              style={[styles.btn, !ipInput.trim() && styles.btnDisabled]}
              onPress={() => ipInput.trim() && onManual(ipInput.trim())}
              disabled={!ipInput.trim()}
            >
              <Text style={styles.btnText}>Connect</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>Scan again</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: CYAN,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 8,
    marginBottom: 4,
  },
  subtitle: {
    color: '#555',
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: 48,
  },
  center: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  section: {
    width: '100%',
    gap: 12,
  },
  sectionLabel: {
    color: '#444',
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 4,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  deviceInfo: {
    flex: 1,
    gap: 3,
  },
  deviceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  deviceIp: {
    color: '#555',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  connectBtn: {
    backgroundColor: CYAN,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  connectBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  separator: {
    height: 8,
  },
  body: {
    color: '#ccc',
    fontSize: 16,
    marginTop: 16,
  },
  hint: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  warn: {
    color: '#ff3d00',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  btn: {
    backgroundColor: CYAN,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  btnDisabled: {
    backgroundColor: '#1a1a1a',
  },
  btnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  retryBtn: {
    marginTop: 4,
    padding: 8,
  },
  retryText: {
    color: '#555',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
