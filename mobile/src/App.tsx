import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDiscovery, Device } from './useDiscovery';
import { DiscoveryScreen } from './DiscoveryScreen';
import { ButtonGrid } from './ButtonGrid';

const CYAN = '#00e5ff';

function AppRoot() {
  const insets = useSafeAreaInsets();
  const {
    state,
    favorites,
    primaryMac,
    connectManual,
    retry,
    connectDevice,
    leaveDeck,
    changeMac,
    rememberDevice,
    tryAutoConnectOnly,
  } = useDiscovery();

  if (state.phase === 'manual') {
    return (
      <ButtonGrid
        url={state.url}
        onDisconnect={leaveDeck}
        onChangeMac={() => {
          void changeMac();
        }}
        onConnectionLost={tryAutoConnectOnly}
        onMacName={(name) => {
          const ip = state.url.replace(/^ws:\/\//, '').split(':')[0];
          void rememberDevice({ ip, name, url: state.url });
        }}
      />
    );
  }

  if (state.phase === 'connecting') {
    const macLabel = state.name || primaryMac?.name;
    return (
      <View style={[styles.connecting, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.title}>DECKER</Text>
        <ActivityIndicator size="large" color={CYAN} style={styles.spinner} />
        <Text style={styles.body}>Connecting</Text>
        {macLabel ? <Text style={styles.macName}>{macLabel}</Text> : null}
      </View>
    );
  }

  return (
    <DiscoveryScreen
      state={state}
      favorites={favorites}
      primaryMac={primaryMac}
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
    fontSize: 15,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  macName: {
    color: '#f0f4ff',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    maxWidth: '86%',
  },
});
