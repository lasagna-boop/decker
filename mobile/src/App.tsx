import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDiscovery, Device } from './useDiscovery';
import { DiscoveryScreen } from './DiscoveryScreen';
import { ButtonGrid } from './ButtonGrid';

const CYAN = '#00e5ff';

function AppRoot() {
  const insets = useSafeAreaInsets();
  const { state, favorites, connectManual, retry, connectDevice, leaveDeck, tryAutoConnectOnly } =
    useDiscovery();

  if (state.phase === 'manual') {
    return (
      <ButtonGrid
        url={state.url}
        onDisconnect={leaveDeck}
        onConnectionLost={tryAutoConnectOnly}
      />
    );
  }

  if (state.phase === 'connecting') {
    return (
      <View style={[styles.connecting, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.title}>DECKER</Text>
        <ActivityIndicator size="large" color={CYAN} style={styles.spinner} />
        <Text style={styles.body}>Connecting to your Mac…</Text>
      </View>
    );
  }

  return (
    <DiscoveryScreen
      state={state}
      favorites={favorites}
      onConnect={(device: Device) => {
        void connectDevice(device);
      }}
      onManual={connectManual}
      onRetry={retry}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  connecting: {
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
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 16,
  },
  body: {
    color: '#8a93a8',
    fontSize: 14,
    letterSpacing: 0.4,
  },
});
