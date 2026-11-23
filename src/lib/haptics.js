import { state } from './store.js';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
export function vibrate(kind = 'light') {
  if (!state.settings?.vibration) return;
  try {
    if (Capacitor.isNativePlatform()) {
      if (kind === 'success' || kind === 'error') Haptics.vibrate({ duration: kind === 'success' ? 120 : 220 });
      else Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'success' ? [40, 60, 80] : kind === 'error' ? 200 : 12);
    }
  } catch {}
}
