import React, { useState } from 'react';
import { useDiscovery, Device } from './useDiscovery';
import { DiscoveryScreen } from './DiscoveryScreen';
import { ButtonGrid } from './ButtonGrid';

export default function App() {
  const { state, favorites, connectManual, retry, rememberDevice } = useDiscovery();
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);

  const handleDisconnect = () => {
    setConnectedUrl(null);
    retry();
  };

  if (connectedUrl) {
    return <ButtonGrid url={connectedUrl} onDisconnect={handleDisconnect} />;
  }

  if (state.phase === 'manual') {
    return <ButtonGrid url={state.url} onDisconnect={retry} />;
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
