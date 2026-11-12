import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Pressable,
} from 'react-native';
import {
  TRACKPAD_SENSITIVITY_DEFAULT,
  TRACKPAD_SENSITIVITY_MAX,
  TRACKPAD_SENSITIVITY_MIN,
  clampTrackpadSensitivity,
} from './settings';

const CYAN = '#00e5ff';
const CREAM = 'rgba(236, 242, 255, 0.92)';
const DIM = 'rgba(138, 147, 168, 0.9)';

type Props = {
  trackpadSensitivity: number;
  onTrackpadSensitivityChange: (value: number) => void;
};

export function SettingsScreen({
  trackpadSensitivity,
  onTrackpadSensitivityChange,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onTrackpadSensitivityChange);
  trackWidthRef.current = trackWidth;
  onChangeRef.current = onTrackpadSensitivityChange;

  const ratio =
    (clampTrackpadSensitivity(trackpadSensitivity) - TRACKPAD_SENSITIVITY_MIN) /
    (TRACKPAD_SENSITIVITY_MAX - TRACKPAD_SENSITIVITY_MIN);

  const defaultRatio =
    (TRACKPAD_SENSITIVITY_DEFAULT - TRACKPAD_SENSITIVITY_MIN) /
    (TRACKPAD_SENSITIVITY_MAX - TRACKPAD_SENSITIVITY_MIN);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          updateFromX(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (evt) => {
          updateFromX(evt.nativeEvent.locationX);
        },
      }),
    []
  );

  function updateFromX(x: number) {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    const t = Math.min(1, Math.max(0, x / width));
    const next =
      TRACKPAD_SENSITIVITY_MIN +
      t * (TRACKPAD_SENSITIVITY_MAX - TRACKPAD_SENSITIVITY_MIN);
    onChangeRef.current(clampTrackpadSensitivity(next));
  }

  function onTrackLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  const label =
    Math.abs(trackpadSensitivity - TRACKPAD_SENSITIVITY_DEFAULT) < 0.03
      ? 'Default'
      : trackpadSensitivity < TRACKPAD_SENSITIVITY_DEFAULT
        ? 'Slower'
        : 'Faster';

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Quiet controls for bed use</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Trackpad sensitivity</Text>
          <Text style={styles.value}>
            {trackpadSensitivity.toFixed(2)} · {label}
          </Text>
        </View>
        <Text style={styles.hint}>Swipe left/right on the bar</Text>

        <View
          style={styles.track}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.trackFill} />
          <View
            style={[styles.defaultMark, { left: `${defaultRatio * 100}%` }]}
            pointerEvents="none"
          />
          <View
            style={[styles.thumb, { left: `${ratio * 100}%` }]}
            pointerEvents="none"
          />
        </View>

        <View style={styles.scaleRow}>
          <Text style={styles.scaleLabel}>Slow</Text>
          <Text style={styles.scaleLabel}>Default</Text>
          <Text style={styles.scaleLabel}>Fast</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.resetBtn, pressed && styles.resetPressed]}
          onPress={() => onTrackpadSensitivityChange(TRACKPAD_SENSITIVITY_DEFAULT)}
        >
          <Text style={styles.resetText}>Reset to default</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 10,
  },
  title: {
    color: CREAM,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: DIM,
    fontSize: 14,
    marginBottom: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(10, 14, 24, 0.72)',
    padding: 18,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  cardTitle: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  value: {
    color: CYAN,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    color: DIM,
    fontSize: 13,
  },
  track: {
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.18)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  defaultMark: {
    position: 'absolute',
    width: 2,
    height: 18,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    borderRadius: 14,
    backgroundColor: CYAN,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleLabel: {
    color: DIM,
    fontSize: 12,
  },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  resetPressed: {
    opacity: 0.7,
  },
  resetText: {
    color: DIM,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
