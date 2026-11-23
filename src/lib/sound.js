// Subtle synthesized sounds via Web Audio (no audio files)
import { state } from './store.js';
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, { t = 0, dur = 0.12, type = 'sine', vol = 0.06, slide = 0 } = {}) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); const g = a.createGain();
  const s = a.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(freq, s);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, s + dur);
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(vol, s + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  o.connect(g).connect(a.destination); o.start(s); o.stop(s + dur + 0.02);
}
const S = {
  click: () => tone(880, { dur: 0.06, type: 'triangle', vol: 0.035 }),
  back: () => tone(520, { dur: 0.09, type: 'triangle', vol: 0.035, slide: 0.8 }),
  tick: () => tone(660, { dur: 0.08, type: 'sine', vol: 0.05 }),
  go: () => { tone(660, { dur: 0.1 }); tone(990, { t: 0.08, dur: 0.18, vol: 0.06 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { t: i * 0.09, dur: 0.22, type: 'triangle', vol: 0.055 })),
  fail: () => [392, 330, 262].forEach((f, i) => tone(f, { t: i * 0.12, dur: 0.22, type: 'sine', vol: 0.05 })),
  join: () => tone(740, { dur: 0.1, vol: 0.04, slide: 1.3 }),
  star: () => tone(1175, { dur: 0.16, type: 'triangle', vol: 0.045 }),
};
export function play(name) { if (!state.settings?.sound) return; try { S[name]?.(); } catch {} }
