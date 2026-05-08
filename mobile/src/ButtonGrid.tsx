import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useWebSocket, WSMessage } from './useWebSocket';

const CYAN = '#00e5ff';
const GREEN = '#00e676';
const RED = '#ff3d00';

const { width } = Dimensions.get('window');
const COLS = 3;
const PAD = 16;
const GAP = 10;
const BTN_SIZE = (width - PAD * 2 - GAP * (COLS - 1)) / COLS;

type ButtonDef = {
  emoji: string;
  label: string;
  action: string;
  payload?: Record<string, unknown>;
};

const DECK: ButtonDef[] = [
  { emoji: '',   label: 'Safari',      action: 'launch-app', payload: { appName: 'Safari' } },
  { emoji: '',   label: 'Chrome',      action: 'launch-app', payload: { appName: 'Google Chrome' } },
  { emoji: '',   label: 'Spotify',     action: 'launch-app', payload: { appName: 'Spotify' } },
  { emoji: '',   label: 'VS Code',     action: 'launch-app', payload: { appName: 'Visual Studio Code' } },
  { emoji: '',   label: 'Terminal',    action: 'launch-app', payload: { appName: 'Terminal' } },
  { emoji: '',   label: 'Finder',      action: 'launch-app', payload: { appName: 'Finder' } },
  { emoji: '⏯',  label: 'Play/Pause', action: 'media-play-pause' },
  { emoji: '⏭',  label: 'Next',       action: 'media-next' },
  { emoji: '⏮',  label: 'Prev',       action: 'media-prev' },
  { emoji: '🔊', label: 'Vol +',       action: 'volume-up' },
  { emoji: '🔉', label: 'Vol −',       action: 'volume-down' },
  { emoji: '🔇', label: 'Mute',        action: 'mute' },
];

const APP_NAMES = DECK
  .filter((b) => b.action === 'launch-app')
  .map((b) => b.payload!.appName as string);

type BtnState = 'ok' | 'error';

type Props = {
  url: string;
  onDisconnect: () => void;
};

export function ButtonGrid({ url, onDisconnect }: Props) {
  const [connected, setConnected] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // deck state
  const [btnStates, setBtnStates] = useState<Record<number, BtnState>>({});
  const [icons, setIcons] = useState<Record<string, string>>({});

  // open apps state
  const [openApps, setOpenApps] = useState<string[]>([]);
  const [openAppIcons, setOpenAppIcons] = useState<Record<string, string>>({});
  const openAppIconsRef = useRef<Record<string, string>>({});
  const [openBtnStates, setOpenBtnStates] = useState<Record<string, BtnState>>({});

  // background animation
  const bgAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgAnim, { toValue: 1, duration: 10000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bgAnim, { toValue: 0, duration: 10000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [bgAnim]);

  const bgScale = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.18] });
  const bgX = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const bgY = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  const onMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'ack') {
      if (typeof msg.reqId === 'number') {
        const idx = msg.reqId;
        const state: BtnState = msg.ok ? 'ok' : 'error';
        setBtnStates((s) => ({ ...s, [idx]: state }));
        setTimeout(() => setBtnStates((s) => { const n = { ...s }; delete n[idx]; return n; }), 700);
      } else if (typeof msg.reqId === 'string') {
        const appName = msg.reqId;
        const state: BtnState = msg.ok ? 'ok' : 'error';
        setOpenBtnStates((s) => ({ ...s, [appName]: state }));
        setTimeout(() => setOpenBtnStates((s) => { const n = { ...s }; delete n[appName]; return n; }), 700);
      }
    } else if (msg.type === 'icons') {
      if (msg.tag === 'open') {
        const merged = { ...openAppIconsRef.current, ...(msg.icons as Record<string, string>) };
        openAppIconsRef.current = merged;
        setOpenAppIcons(merged);
      } else {
        setIcons(msg.icons as Record<string, string>);
      }
    } else if (msg.type === 'open_apps') {
      const apps = (msg.apps as string[]) ?? [];
      setOpenApps(apps);
      const newApps = apps.filter((a) => !openAppIconsRef.current[a]);
      if (newApps.length > 0) {
        send({ type: 'get_icons', apps: newApps, tag: 'open' });
      }
    }
  }, []);

  const { send } = useWebSocket(url, {
    onMessage,
    onOpen: () => {
      setConnected(true);
      send({ type: 'get_icons', apps: APP_NAMES, tag: 'deck' });
    },
    onClose: () => { setConnected(false); onDisconnect(); },
    onError: () => { setConnected(false); onDisconnect(); },
  });

  function handleDeckPress(idx: number) {
    const btn = DECK[idx];
    send({ type: 'action', id: btn.action, payload: btn.payload ?? {}, reqId: idx });
  }

  function handleOpenAppPress(appName: string) {
    send({ type: 'action', id: 'launch-app', payload: { appName }, reqId: appName });
  }

  function handleQuitApp(appName: string) {
    send({ type: 'action', id: 'quit-app', payload: { appName }, reqId: `quit:${appName}` });
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentPage(page);
  }

  return (
    <View style={styles.root}>
      <Animated.Image
        source={require('../assets/bg.jpg')}
        style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }, { translateX: bgX }, { translateY: bgY }] }]}
        resizeMode="cover"
      />
      <View style={styles.overlay} pointerEvents="none" />

      <SafeAreaView style={styles.safe}>
        {/* header */}
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <View style={styles.headerCenter}>
            <Text style={styles.title}>DECKER</Text>
            <View style={[styles.connDot, connected ? styles.connDotOn : styles.connDotOff]} />
          </View>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={onDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* paged content */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.pager}
        >
          {/* Page 1 — Deck */}
          <View style={styles.page}>
            <View style={styles.grid}>
              {DECK.map((btn, idx) => {
                const state = btnStates[idx];
                const appName = btn.action === 'launch-app' ? btn.payload!.appName as string : undefined;
                const iconUri = appName ? icons[appName] : undefined;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.btn, state === 'ok' && styles.btnOk, state === 'error' && styles.btnError, !connected && styles.btnDisabled]}
                    onPress={() => handleDeckPress(idx)}
                    disabled={!connected}
                    activeOpacity={0.5}
                  >
                    {iconUri ? (
                      <Image source={{ uri: iconUri }} style={styles.appIcon} />
                    ) : btn.emoji ? (
                      <Text style={styles.emoji}>{btn.emoji}</Text>
                    ) : null}
                    <Text style={[styles.label, !connected && styles.labelDim]} numberOfLines={1}>{btn.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Page 2 — Open Apps */}
          <View style={styles.page}>
            <Text style={styles.pageHint}>tap to open · hold to quit</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
              {openApps.map((appName) => {
                const state = openBtnStates[appName];
                const iconUri = openAppIcons[appName];
                return (
                  <TouchableOpacity
                    key={appName}
                    style={[styles.btn, state === 'ok' && styles.btnOk, state === 'error' && styles.btnError, !connected && styles.btnDisabled]}
                    onPress={() => handleOpenAppPress(appName)}
                    onLongPress={() => handleQuitApp(appName)}
                    delayLongPress={500}
                    disabled={!connected}
                    activeOpacity={0.5}
                  >
                    {iconUri ? (
                      <Image source={{ uri: iconUri }} style={styles.appIcon} />
                    ) : null}
                    <Text style={[styles.label, !connected && styles.labelDim]} numberOfLines={1}>{appName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>

        {/* page indicator dots */}
        <View style={styles.pageIndicator}>
          <View style={[styles.pageDot, currentPage === 0 && styles.pageDotActive]} />
          <View style={[styles.pageDot, currentPage === 1 && styles.pageDotActive]} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050a1a',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: PAD,
  },
  headerSide: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: CYAN,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connDotOn: { backgroundColor: GREEN },
  connDotOff: { backgroundColor: '#555' },
  disconnectBtn: {
    padding: 8,
  },
  disconnectText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '300',
  },
  pager: {
    flex: 1,
  },
  page: {
    width,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: PAD,
    gap: GAP,
  },
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    backgroundColor: 'rgba(20,20,40,0.72)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
    paddingHorizontal: 6,
  },
  btnOk: {
    borderColor: GREEN,
    backgroundColor: 'rgba(0,40,25,0.8)',
  },
  btnError: {
    borderColor: RED,
    backgroundColor: 'rgba(50,10,5,0.8)',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
  },
  emoji: {
    fontSize: 32,
  },
  label: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  labelDim: {
    color: '#555',
  },
  pageHint: {
    color: '#444',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  pageDotActive: {
    backgroundColor: CYAN,
  },
});
