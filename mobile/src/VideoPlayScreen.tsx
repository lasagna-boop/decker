import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  Keyboard,
} from 'react-native';
import { TouchPad } from './TouchPad';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AMBER = '#d4a24c';
const AMBER_SOFT = 'rgba(212, 162, 76, 0.16)';
const AMBER_LINE = 'rgba(212, 162, 76, 0.28)';
const INK = 'rgba(18, 14, 10, 0.88)';
const CREAM = 'rgba(244, 228, 198, 0.94)';
const CREAM_DIM = 'rgba(180, 160, 130, 0.72)';
const GREEN = '#00e676';
const RED = '#ff3d00';

type BtnState = 'ok' | 'error';
type ToolId = 'none' | 'trackpad' | 'type';

type Props = {
  connected: boolean;
  btnStates: Record<string, BtnState>;
  onAction: (id: string, payload?: Record<string, unknown>) => void;
  onPointerMove: (dx: number, dy: number) => void;
};

const POINTER_CONTROLS = [
  { id: 'pointer-click-left', label: 'Click', key: 'pointer-click-left' },
  { id: 'pointer-click-right', label: 'Right', key: 'pointer-click-right' },
  { id: 'pointer-scroll', label: '▲', payload: { dy: 4 }, key: 'scroll-up' },
  { id: 'pointer-scroll', label: '▼', payload: { dy: -4 }, key: 'scroll-down' },
] as const;

function stateStyle(state?: BtnState) {
  if (state === 'ok') return styles.keyOk;
  if (state === 'error') return styles.keyError;
  return null;
}

export function VideoPlayScreen({
  connected,
  btnStates,
  onAction,
  onPointerMove,
}: Props) {
  const [tool, setTool] = useState<ToolId>('none');
  const [draft, setDraft] = useState('');
  const syncedRef = useRef('');
  const inputRef = useRef<TextInput>(null);

  function dismissKeyboard() {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }

  function toggleTool(next: ToolId) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTool((current) => {
      const closing = current === next;
      if (closing || next !== 'type') dismissKeyboard();
      return closing ? 'none' : next;
    });
  }

  function handleDraftChange(next: string) {
    setDraft(next);
    if (!connected) {
      syncedRef.current = next;
      return;
    }

    const prev = syncedRef.current;
    let i = 0;
    const max = Math.min(prev.length, next.length);
    while (i < max && prev.charAt(i) === next.charAt(i)) i += 1;

    const deletions = prev.length - i;
    const insert = next.slice(i);

    if (deletions > 0) onAction('type-key', { key: 'backspace', count: deletions });
    if (insert) onAction('type-text', { text: insert });
    syncedRef.current = next;
  }

  function pressEnter() {
    if (connected) onAction('type-key', { key: 'enter' });
    dismissKeyboard();
  }

  return (
    <View style={styles.root}>
      {tool === 'trackpad' ? (
        <View style={styles.trackpadPanel}>
          <TouchPad
            enabled={connected}
            onMove={onPointerMove}
            onTap={() => onAction('pointer-click-left')}
            style={styles.touchPad}
          />
          <View style={styles.pointerRow}>
            {POINTER_CONTROLS.map((control) => {
              const state = btnStates[control.key] ?? btnStates[control.id];
              return (
                <Pressable
                  key={control.key}
                  style={({ pressed }) => [
                    styles.sideKey,
                    stateStyle(state),
                    !connected && styles.keyDisabled,
                    pressed && styles.keyPressed,
                  ]}
                  onPress={() => onAction(control.id, control.payload)}
                  disabled={!connected}
                >
                  <Text style={styles.sideKeyLabel}>{control.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {tool === 'type' ? (
        <View style={styles.typeRow}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={handleDraftChange}
            placeholder="Type on Mac…"
            placeholderTextColor={CREAM_DIM}
            style={styles.typeInput}
            editable={connected}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={pressEnter}
          />
          <Pressable
            style={({ pressed }) => [
              styles.enterKey,
              !connected && styles.keyDisabled,
              pressed && styles.keyPressed,
            ]}
            onPress={pressEnter}
            disabled={!connected}
          >
            <Text style={styles.enterKeyLabel}>↵</Text>
          </Pressable>
        </View>
      ) : null}

      {tool !== 'trackpad' ? (
        <Pressable style={styles.flexGrow} onPress={dismissKeyboard} accessible={false} />
      ) : null}

      <View style={styles.transport}>
        <Pressable
          style={({ pressed }) => [
            styles.seekKey,
            stateStyle(btnStates['video-seek-back']),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('video-seek-back');
          }}
          disabled={!connected}
        >
          <Text style={styles.seekLabel}>−5</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.playKey,
            stateStyle(btnStates['video-play-pause']),
            !connected && styles.keyDisabled,
            pressed && styles.playKeyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('video-play-pause');
          }}
          disabled={!connected}
        >
          <Text style={styles.playLabel}>⏯</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.seekKey,
            stateStyle(btnStates['video-seek-forward']),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('video-seek-forward');
          }}
          disabled={!connected}
        >
          <Text style={styles.seekLabel}>+5</Text>
        </Pressable>
      </View>

      <View style={styles.volumeRow}>
        <Pressable
          style={({ pressed }) => [
            styles.volKey,
            stateStyle(btnStates['volume-down']),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('volume-down');
          }}
          disabled={!connected}
        >
          <Text style={styles.volLabel}>−</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.volKey,
            styles.volKeyMid,
            stateStyle(btnStates.mute),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('mute');
          }}
          disabled={!connected}
        >
          <Text style={styles.volLabelMid}>Mute</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.volKey,
            stateStyle(btnStates['volume-up']),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('volume-up');
          }}
          disabled={!connected}
        >
          <Text style={styles.volLabel}>+</Text>
        </Pressable>
      </View>

      <View style={styles.toolRow}>
        <Pressable
          style={({ pressed }) => [
            styles.toolChip,
            tool === 'trackpad' && styles.toolChipOn,
            pressed && styles.keyPressed,
          ]}
          onPress={() => toggleTool('trackpad')}
        >
          <Text style={[styles.toolChipText, tool === 'trackpad' && styles.toolChipTextOn]}>
            Trackpad
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.toolChip,
            tool === 'type' && styles.toolChipOn,
            pressed && styles.keyPressed,
          ]}
          onPress={() => toggleTool('type')}
        >
          <Text style={[styles.toolChipText, tool === 'type' && styles.toolChipTextOn]}>
            Type
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.toolChip,
            stateStyle(btnStates['window-to-main']),
            !connected && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          onPress={() => {
            dismissKeyboard();
            onAction('window-to-main', { appName: 'Arc' });
          }}
          disabled={!connected}
        >
          <Text style={styles.toolChipText}>Fix win</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flexGrow: { flex: 1, minHeight: 8 },
  root: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 10,
    paddingTop: 2,
    gap: 12,
  },
  trackpadPanel: {
    flex: 1,
    gap: 10,
    minHeight: 280,
  },
  touchPad: {
    flex: 1,
    minHeight: 260,
  },
  pointerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sideKey: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideKeyLabel: {
    color: CREAM,
    fontSize: 15,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  typeInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    backgroundColor: INK,
    color: CREAM,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  enterKey: {
    width: 56,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.45)',
    backgroundColor: AMBER_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterKeyLabel: {
    color: CREAM,
    fontSize: 22,
    fontWeight: '500',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  seekKey: {
    flex: 1,
    minHeight: 88,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekLabel: {
    color: CREAM,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  playKey: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 162, 76, 0.55)',
    backgroundColor: 'rgba(212, 162, 76, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playKeyPressed: {
    backgroundColor: 'rgba(212, 162, 76, 0.34)',
    transform: [{ scale: 0.97 }],
  },
  playLabel: {
    color: CREAM,
    fontSize: 40,
    fontWeight: '400',
    marginTop: -2,
  },
  volumeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  volKey: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volKeyMid: {
    flex: 1.15,
  },
  volLabel: {
    color: CREAM,
    fontSize: 28,
    fontWeight: '500',
  },
  volLabelMid: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  toolRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  toolChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.2)',
    backgroundColor: 'rgba(18, 14, 10, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolChipOn: {
    borderColor: 'rgba(212, 162, 76, 0.5)',
    backgroundColor: AMBER_SOFT,
  },
  toolChipText: {
    color: CREAM_DIM,
    fontSize: 14,
    fontWeight: '600',
  },
  toolChipTextOn: {
    color: CREAM,
  },
  keyPressed: {
    opacity: 0.82,
  },
  keyOk: {
    borderColor: GREEN,
    backgroundColor: 'rgba(0, 40, 25, 0.75)',
  },
  keyError: {
    borderColor: RED,
    backgroundColor: 'rgba(50, 10, 5, 0.75)',
  },
  keyDisabled: {
    opacity: 0.35,
  },
});
