import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TouchPad } from './TouchPad';

const AMBER = '#d4a24c';
const AMBER_DIM = 'rgba(212, 162, 76, 0.14)';
const GREEN = '#00e676';
const RED = '#ff3d00';

type BtnState = 'ok' | 'error';

type Props = {
  connected: boolean;
  activeAppName: string | null;
  btnStates: Record<string, BtnState>;
  onAction: (id: string, payload?: Record<string, unknown>) => void;
  onPointerMove: (dx: number, dy: number) => void;
};

const MEDIA_CONTROLS = [
  { id: 'video-seek-back', label: '−5s', hint: 'rewind' },
  { id: 'video-play-pause', label: '⏯', hint: 'play / pause', primary: true },
  { id: 'video-seek-forward', label: '+5s', hint: 'forward' },
] as const;

const POINTER_CONTROLS = [
  { id: 'pointer-click-left', label: 'Click', hint: 'left' },
  { id: 'pointer-click-right', label: 'Right', hint: 'click' },
  { id: 'pointer-scroll', label: '▲', hint: 'scroll up', payload: { dy: -4 }, key: 'scroll-up' },
  { id: 'pointer-scroll', label: '▼', hint: 'scroll down', payload: { dy: 4 }, key: 'scroll-down' },
] as const;

const VOLUME_CONTROLS = [
  { id: 'volume-down', label: 'Vol −', hint: 'quieter' },
  { id: 'mute', label: 'Mute', hint: 'toggle' },
  { id: 'volume-up', label: 'Vol +', hint: 'louder' },
] as const;

export function VideoPlayScreen({
  connected,
  activeAppName,
  btnStates,
  onAction,
  onPointerMove,
}: Props) {
  const [draft, setDraft] = useState('');

  function sendText() {
    if (!draft || !connected) return;
    onAction('type-text', { text: draft });
    setDraft('');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={72}
    >
      <View style={styles.root}>
        <View style={styles.hero}>
          {activeAppName ? (
            <View style={styles.nowPlaying}>
              <View style={styles.nowPlayingDot} />
              <Text style={styles.nowPlayingText} numberOfLines={1}>
                {activeAppName}
              </Text>
            </View>
          ) : (
            <Text style={styles.idleHint}>Focus your player on the Mac</Text>
          )}
        </View>

        <TouchPad
          enabled={connected}
          onMove={onPointerMove}
          onTap={() => onAction('pointer-click-left')}
        />

        <View style={styles.pointerRow}>
          {POINTER_CONTROLS.map((control) => {
            const stateKey =
              'key' in control && control.key ? control.key : control.id;
            const state = btnStates[stateKey] ?? btnStates[control.id];
            return (
              <TouchableOpacity
                key={'key' in control && control.key ? control.key : control.id}
                style={[
                  styles.pointerBtn,
                  state === 'ok' && styles.keyOk,
                  state === 'error' && styles.keyError,
                  !connected && styles.keyDisabled,
                ]}
                onPress={() => onAction(control.id, control.payload)}
                disabled={!connected}
                activeOpacity={0.72}
              >
                <Text style={styles.pointerBtnLabel}>{control.label}</Text>
                <Text style={styles.pointerBtnHint}>{control.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.remote}>
          {MEDIA_CONTROLS.map((control) => {
            const state = btnStates[control.id];
            const isPrimary = 'primary' in control && control.primary;
            return (
              <TouchableOpacity
                key={control.id}
                style={[
                  styles.key,
                  isPrimary && styles.keyPrimary,
                  state === 'ok' && styles.keyOk,
                  state === 'error' && styles.keyError,
                  !connected && styles.keyDisabled,
                ]}
                onPress={() => onAction(control.id)}
                disabled={!connected}
                activeOpacity={0.72}
              >
                <Text style={[styles.keyLabel, isPrimary && styles.keyLabelPrimary]}>
                  {control.label}
                </Text>
                <Text style={styles.keyHint}>{control.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.volumeRow}>
          {VOLUME_CONTROLS.map((control) => {
            const state = btnStates[control.id];
            return (
              <TouchableOpacity
                key={control.id}
                style={[
                  styles.volumeBtn,
                  state === 'ok' && styles.keyOk,
                  state === 'error' && styles.keyError,
                  !connected && styles.keyDisabled,
                ]}
                onPress={() => onAction(control.id)}
                disabled={!connected}
                activeOpacity={0.72}
              >
                <Text style={styles.volumeBtnLabel}>{control.label}</Text>
                <Text style={styles.volumeBtnHint}>{control.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.typeRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type on Mac…"
            placeholderTextColor="rgba(160,148,128,0.55)"
            style={styles.typeInput}
            editable={connected}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={sendText}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!connected || !draft) && styles.sendBtnDisabled]}
            onPress={sendText}
            disabled={!connected || !draft}
            activeOpacity={0.75}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.typeKeysRow}>
          <TouchableOpacity
            style={[styles.typeKeyBtn, !connected && styles.keyDisabled]}
            onPress={() => onAction('type-key', { key: 'backspace' })}
            disabled={!connected}
            activeOpacity={0.72}
          >
            <Text style={styles.typeKeyLabel}>⌫</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeKeyBtn, !connected && styles.keyDisabled]}
            onPress={() => onAction('type-key', { key: 'enter' })}
            disabled={!connected}
            activeOpacity={0.72}
          >
            <Text style={styles.typeKeyLabel}>↵</Text>
          </TouchableOpacity>
        </View>

        {!connected ? <Text style={styles.offline}>Not connected to Mac</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 4,
    gap: 10,
  },
  hero: {
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.22)',
  },
  nowPlayingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  nowPlayingText: {
    color: 'rgba(244, 228, 198, 0.92)',
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  idleHint: {
    color: 'rgba(160, 148, 128, 0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  pointerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pointerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.2)',
    backgroundColor: 'rgba(18, 14, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pointerBtnLabel: {
    color: 'rgba(244, 228, 198, 0.92)',
    fontSize: 14,
    fontWeight: '600',
  },
  pointerBtnHint: {
    color: 'rgba(160, 148, 128, 0.6)',
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  remote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  key: {
    flex: 1,
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.2)',
    backgroundColor: 'rgba(18, 14, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  keyPrimary: {
    flex: 1.12,
    borderColor: 'rgba(212, 162, 76, 0.42)',
    backgroundColor: 'rgba(212, 162, 76, 0.1)',
  },
  keyLabel: {
    color: 'rgba(244, 228, 198, 0.95)',
    fontSize: 20,
    fontWeight: '600',
  },
  keyLabelPrimary: {
    fontSize: 28,
    fontWeight: '500',
  },
  keyHint: {
    color: 'rgba(160, 148, 128, 0.65)',
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  volumeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  volumeBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.2)',
    backgroundColor: 'rgba(18, 14, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  volumeBtnLabel: {
    color: 'rgba(244, 228, 198, 0.92)',
    fontSize: 14,
    fontWeight: '600',
  },
  volumeBtnHint: {
    color: 'rgba(160, 148, 128, 0.6)',
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  typeInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.22)',
    backgroundColor: 'rgba(18, 14, 10, 0.82)',
    color: 'rgba(244, 228, 198, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.42)',
    backgroundColor: 'rgba(212, 162, 76, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  sendBtnText: {
    color: 'rgba(244, 228, 198, 0.95)',
    fontSize: 14,
    fontWeight: '700',
  },
  typeKeysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeKeyBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.18)',
    backgroundColor: 'rgba(18, 14, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeKeyLabel: {
    color: 'rgba(244, 228, 198, 0.9)',
    fontSize: 18,
    fontWeight: '500',
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
  offline: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
