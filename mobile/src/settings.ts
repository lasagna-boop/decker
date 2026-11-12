import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRACKPAD_SENSITIVITY_DEFAULT = 1.65;
export const TRACKPAD_SENSITIVITY_MIN = 0.5;
export const TRACKPAD_SENSITIVITY_MAX = 3.5;

const TRACKPAD_SENSITIVITY_KEY = 'decker.trackpadSensitivity.v1';

export function clampTrackpadSensitivity(value: number): number {
  if (!Number.isFinite(value)) return TRACKPAD_SENSITIVITY_DEFAULT;
  return Math.min(
    TRACKPAD_SENSITIVITY_MAX,
    Math.max(TRACKPAD_SENSITIVITY_MIN, value)
  );
}

export async function loadTrackpadSensitivity(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(TRACKPAD_SENSITIVITY_KEY);
    if (raw == null) return TRACKPAD_SENSITIVITY_DEFAULT;
    return clampTrackpadSensitivity(Number(raw));
  } catch {
    return TRACKPAD_SENSITIVITY_DEFAULT;
  }
}

export async function saveTrackpadSensitivity(value: number): Promise<number> {
  const next = clampTrackpadSensitivity(value);
  try {
    await AsyncStorage.setItem(TRACKPAD_SENSITIVITY_KEY, String(next));
  } catch {
    // best effort
  }
  return next;
}
