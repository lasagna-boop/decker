import React, { useRef, useMemo } from 'react';
import { View, Text, PanResponder, StyleSheet, ViewStyle, StyleProp } from 'react-native';

const SENSITIVITY = 1.65;

type Props = {
  enabled: boolean;
  onMove: (dx: number, dy: number) => void;
  onTap: () => void;
  style?: StyleProp<ViewStyle>;
};

export function TouchPad({ enabled, onMove, onTap, style }: Props) {
  const enabledRef = useRef(enabled);
  const onMoveRef = useRef(onMove);
  const onTapRef = useRef(onTap);
  const lastPoint = useRef({ x: 0, y: 0 });
  const remainder = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  enabledRef.current = enabled;
  onMoveRef.current = onMove;
  onTapRef.current = onTap;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          moved.current = false;
          remainder.current = { x: 0, y: 0 };
          lastPoint.current = {
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY,
          };
        },
        onPanResponderMove: (evt) => {
          if (!enabledRef.current) return;

          const { locationX, locationY } = evt.nativeEvent;
          remainder.current.x += (locationX - lastPoint.current.x) * SENSITIVITY;
          remainder.current.y += (locationY - lastPoint.current.y) * SENSITIVITY;
          lastPoint.current = { x: locationX, y: locationY };

          const dx = Math.trunc(remainder.current.x);
          const dy = Math.trunc(remainder.current.y);
          remainder.current.x -= dx;
          remainder.current.y -= dy;

          if (dx === 0 && dy === 0) return;
          moved.current = true;
          onMoveRef.current(dx, dy);
        },
        onPanResponderRelease: () => {
          if (!moved.current) {
            onTapRef.current();
          }
        },
        onPanResponderTerminate: () => {
          moved.current = false;
        },
      }),
    []
  );

  return (
    <View
      style={[styles.pad, !enabled && styles.padDisabled, style]}
      {...panResponder.panHandlers}
    >
      <View style={styles.gridH} pointerEvents="none" />
      <View style={styles.gridV} pointerEvents="none" />
      <Text style={styles.hint} pointerEvents="none">
        slide to move · tap to click
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    minHeight: 260,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(212, 162, 76, 0.24)',
    backgroundColor: 'rgba(12, 10, 8, 0.78)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padDisabled: {
    opacity: 0.35,
  },
  gridH: {
    position: 'absolute',
    width: '72%',
    height: 1,
    backgroundColor: 'rgba(212, 162, 76, 0.1)',
  },
  gridV: {
    position: 'absolute',
    height: '58%',
    width: 1,
    backgroundColor: 'rgba(212, 162, 76, 0.1)',
  },
  hint: {
    color: 'rgba(160, 148, 128, 0.55)',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
