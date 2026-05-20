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
  Modal,
  TextInput,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWebSocket, WSMessage } from './useWebSocket';

const CYAN = '#00e5ff';
const GREEN = '#00e676';
const RED = '#ff3d00';

const { width } = Dimensions.get('window');
const COLS = 3;
const PAD = 16;
const GAP = 10;
const BTN_SIZE = (width - PAD * 2 - GAP * (COLS - 1)) / COLS;
const SLOT_COUNT = 9;
const LAUNCHER_SLOTS_KEY = 'decker.launcherSlots.v1';

const FIRST_PAGE_SLOTS = Array.from({ length: SLOT_COUNT }, (_, idx) => idx);
const EMPTY_SLOTS = Array.from({ length: SLOT_COUNT }, () => null as string | null);

type BtnState = 'ok' | 'error';
type PresetAction = { id: string; label: string };

const APP_PRESETS: Array<{ match: RegExp; actions: PresetAction[] }> = [
  {
    match: /spotify/i,
    actions: [
      { id: 'media-prev', label: 'Prev track' },
      { id: 'media-play-pause', label: 'Play / Pause' },
      { id: 'media-next', label: 'Next track' },
    ],
  },
  {
    match: /(google chrome|chrome)/i,
    actions: [
      { id: 'chrome-tab-left', label: 'Tab left' },
      { id: 'chrome-reload', label: 'Reload page' },
      { id: 'chrome-tab-right', label: 'Tab right' },
    ],
  },
  {
    match: /(microsoft word|word)/i,
    actions: [
      { id: 'word-save', label: 'Save' },
      { id: 'word-copy-file', label: 'Copy file to clipboard' },
      { id: 'word-print', label: 'Print' },
    ],
  },
];

function getPresetActions(appName: string): PresetAction[] {
  for (const preset of APP_PRESETS) {
    if (preset.match.test(appName)) return preset.actions;
  }
  return [];
}

function sameAppName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type Props = {
  url: string;
  onDisconnect: () => void;
};

export function ButtonGrid({ url, onDisconnect }: Props) {
  const [connected, setConnected] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [launcherSlots, setLauncherSlots] = useState<Array<string | null>>(EMPTY_SLOTS);
  const [launcherIcons, setLauncherIcons] = useState<Record<string, string>>({});
  const launcherIconsRef = useRef<Record<string, string>>({});
  const [slotBtnStates, setSlotBtnStates] = useState<Record<number, BtnState>>({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSlotIdx, setPickerSlotIdx] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [installedApps, setInstalledApps] = useState<string[]>([]);
  const [activePresetSlotIdx, setActivePresetSlotIdx] = useState<number | null>(null);
  const [activePresetAppName, setActivePresetAppName] = useState('');
  const [activeAppName, setActiveAppName] = useState<string | null>(null);

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

  useEffect(() => {
    AsyncStorage.getItem(LAUNCHER_SLOTS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const normalized = EMPTY_SLOTS.map((_, idx) => {
          const value = parsed[idx];
          return typeof value === 'string' && value.trim().length > 0 ? value : null;
        });
        setLauncherSlots(normalized);
      })
      .catch(() => {
        // best effort
      });
  }, []);

  useEffect(() => {
    const apps = launcherSlots.filter((app): app is string => Boolean(app));
    if (!connected || apps.length === 0) return;
    const missing = apps.filter((appName) => !launcherIconsRef.current[appName]);
    if (missing.length > 0) {
      send({ type: 'get_icons', apps: missing, tag: 'launcher' });
    }
  }, [connected, launcherSlots]);

  const onMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'ack') {
      if (typeof msg.reqId === 'string') {
        const state: BtnState = msg.ok ? 'ok' : 'error';
        if (msg.reqId.startsWith('slot:')) {
          const idx = Number(msg.reqId.replace('slot:', ''));
          if (!Number.isNaN(idx)) {
            setSlotBtnStates((s) => ({ ...s, [idx]: state }));
            setTimeout(
              () =>
                setSlotBtnStates((s) => {
                  const n = { ...s };
                  delete n[idx];
                  return n;
                }),
              700
            );
          }
        } else {
          const appName = msg.reqId;
          setOpenBtnStates((s) => ({ ...s, [appName]: state }));
          setTimeout(() => setOpenBtnStates((s) => { const n = { ...s }; delete n[appName]; return n; }), 700);
        }
      }
    } else if (msg.type === 'icons') {
      if (msg.tag === 'open') {
        const merged = { ...openAppIconsRef.current, ...(msg.icons as Record<string, string>) };
        openAppIconsRef.current = merged;
        setOpenAppIcons(merged);
      } else if (msg.tag === 'launcher') {
        const merged = { ...launcherIconsRef.current, ...(msg.icons as Record<string, string>) };
        launcherIconsRef.current = merged;
        setLauncherIcons(merged);
      }
    } else if (msg.type === 'installed_apps') {
      const apps = Array.isArray(msg.apps) ? (msg.apps as string[]) : [];
      setInstalledApps(apps);
    } else if (msg.type === 'active_app') {
      setActiveAppName(typeof msg.appName === 'string' ? msg.appName : null);
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
      send({ type: 'list_installed_apps' });
    },
    onClose: () => { setConnected(false); onDisconnect(); },
    onError: () => { setConnected(false); onDisconnect(); },
  });

  function persistLauncherSlots(next: Array<string | null>) {
    setLauncherSlots(next);
    void AsyncStorage.setItem(LAUNCHER_SLOTS_KEY, JSON.stringify(next)).catch(() => {
      // best effort
    });
  }

  function handleOpenAppPress(appName: string) {
    send({ type: 'action', id: 'launch-app', payload: { appName }, reqId: appName });
  }

  function handleQuitApp(appName: string) {
    send({ type: 'action', id: 'quit-app', payload: { appName }, reqId: `quit:${appName}` });
  }

  function handleSlotPress(slotIndex: number) {
    const appName = launcherSlots[slotIndex];
    if (appName) {
      send({ type: 'action', id: 'launch-app', payload: { appName }, reqId: `slot:${slotIndex}` });
      setActiveAppName(appName);
      const presetActions = getPresetActions(appName);
      if (presetActions.length > 0) {
        setActivePresetSlotIdx(slotIndex);
        setActivePresetAppName(appName);
      } else {
        setActivePresetSlotIdx(null);
        setActivePresetAppName('');
      }
      return;
    }
    setPickerSlotIdx(slotIndex);
    setPickerQuery('');
    setPickerVisible(true);
  }

  function handleSelectApp(appName: string) {
    if (pickerSlotIdx === null) return;
    const next = [...launcherSlots];
    next[pickerSlotIdx] = appName;
    persistLauncherSlots(next);
    if (connected && !launcherIconsRef.current[appName]) {
      send({ type: 'get_icons', apps: [appName], tag: 'launcher' });
    }
    setPickerVisible(false);
    setPickerSlotIdx(null);
  }

  function handlePresetActionPress(actionId: string) {
    if (activePresetSlotIdx === null) return;
    send({
      type: 'action',
      id: actionId,
      reqId: `slot:${activePresetSlotIdx}`,
      payload: { appName: activePresetAppName },
    });
  }

  const pickerSource = installedApps.length > 0 ? installedApps : openApps;
  const q = pickerQuery.trim().toLowerCase();
  const filteredApps = pickerSource
    .filter((app) => (q ? app.toLowerCase().includes(q) : true))
    .slice(0, 120);

  function closePicker() {
    setPickerVisible(false);
    setPickerSlotIdx(null);
  }

  const activePresetActions = activePresetAppName ? getPresetActions(activePresetAppName) : [];

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
            <View style={styles.launcherPage}>
              <Text style={styles.launcherHint}>tap app to open · actions appear below</Text>
              <View style={styles.grid}>
                {FIRST_PAGE_SLOTS.map((slotIdx) => {
                  const appName = launcherSlots[slotIdx];
                  const iconUri = appName ? launcherIcons[appName] : null;
                  const state = slotBtnStates[slotIdx];
                  const isActive = sameAppName(appName, activeAppName);
                  return (
                    <TouchableOpacity
                      key={slotIdx}
                      style={[
                        styles.glassSlot,
                        isActive && styles.btnActive,
                        state === 'ok' && styles.btnOk,
                        state === 'error' && styles.btnError,
                      ]}
                      onPress={() => handleSlotPress(slotIdx)}
                      activeOpacity={0.7}
                    >
                      {appName ? (
                        <>
                          {iconUri ? (
                            <Image source={{ uri: iconUri }} style={styles.appIcon} />
                          ) : (
                            <View style={styles.plusWrap}>
                              <Text style={styles.plusText}>•</Text>
                            </View>
                          )}
                          <Text style={styles.slotLabel} numberOfLines={1}>
                            {appName}
                          </Text>
                        </>
                      ) : (
                        <>
                          <View style={styles.plusWrap}>
                            <Text style={styles.plusText}>＋</Text>
                          </View>
                          <Text style={[styles.slotLabel, !connected && styles.labelDim]}>Add app</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {activePresetActions.length > 0 ? (
                <View style={styles.presetPanel}>
                  <Text style={styles.presetTitle}>{activePresetAppName}</Text>
                  <View style={styles.presetActionsRow}>
                    {activePresetActions.map((action) => (
                      <TouchableOpacity
                        key={action.id}
                        style={styles.presetActionBtn}
                        onPress={() => handlePresetActionPress(action.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.presetActionText}>{action.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Page 2 — Open Apps */}
          <View style={styles.page}>
            <Text style={styles.pageHint}>tap to open · hold to quit</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
              {openApps.map((appName) => {
                const state = openBtnStates[appName];
                const iconUri = openAppIcons[appName];
                const isActive = sameAppName(appName, activeAppName);
                return (
                  <TouchableOpacity
                    key={appName}
                    style={[
                      styles.btn,
                      isActive && styles.btnActive,
                      state === 'ok' && styles.btnOk,
                      state === 'error' && styles.btnError,
                      !connected && styles.btnDisabled,
                    ]}
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

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select app</Text>
            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search app..."
              placeholderTextColor="#788299"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.appList} showsVerticalScrollIndicator={false}>
              {filteredApps.map((appName) => (
                <TouchableOpacity
                  key={appName}
                  style={styles.appRow}
                  onPress={() => handleSelectApp(appName)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.appRowText}>{appName}</Text>
                </TouchableOpacity>
              ))}
              {filteredApps.length === 0 ? (
                <Text style={styles.emptyListText}>No apps found</Text>
              ) : null}
            </ScrollView>
            <TouchableOpacity onPress={closePicker} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  launcherPage: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 12,
    paddingTop: 8,
  },
  launcherHint: {
    color: '#6c748a',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
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
  glassSlot: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#8adfff',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    paddingHorizontal: 8,
    gap: 10,
  },
  plusWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  plusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 24,
    fontWeight: '300',
    marginTop: -2,
  },
  slotLabel: {
    color: '#97a2b9',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  btnActive: {
    borderColor: CYAN,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
  },
  presetPanel: {
    marginTop: 14,
    marginHorizontal: PAD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(11,18,31,0.55)',
    padding: 10,
  },
  presetTitle: {
    color: '#a9bbdd',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  presetActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    backgroundColor: 'rgba(0,229,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  presetActionText: {
    color: '#d9f9ff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(13,18,33,0.95)',
    padding: 14,
    maxHeight: '72%',
  },
  modalTitle: {
    color: '#e6ecff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    color: '#dbe5ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  appList: {
    maxHeight: 350,
  },
  appRow: {
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  appRowText: {
    color: '#cdd6ed',
    fontSize: 14,
  },
  emptyListText: {
    color: '#7d87a0',
    textAlign: 'center',
    paddingVertical: 20,
  },
  cancelBtn: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#d7dded',
    fontSize: 14,
    fontWeight: '600',
  },
});
