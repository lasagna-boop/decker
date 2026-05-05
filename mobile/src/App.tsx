import React, { useState } from 'react';
import { useDiscovery, Device } from './useDiscovery';
import { DiscoveryScreen } from './DiscoveryScreen';
import { LatencyScreen } from './LatencyScreen';

export default function App() {
  const { state, favorites, connectManual, retry, rememberDevice } = useDiscovery();
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);

  if (connectedUrl) {
    return <LatencyScreen url={connectedUrl} onDisconnect={() => { setConnectedUrl(null); retry(); }} />;
  }

  if (state.phase === 'manual') {
    return <LatencyScreen url={state.url} onDisconnect={() => { retry(); }} />;
  }

  return (
    <DiscoveryScreen
      state={state}
      favorites={favorites}
      onConnect={(device: Device) => {
        void rememberDevice(device);
        setConnectedUrl(device.url);
      }}
      onManual={connectManual}
      onRetry={retry}
    />
  );
}
