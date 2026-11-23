// Inline SVG icon set – hand-drawn line icons, 24×24, stroke = currentColor.
// No icon CDNs, no emoji.

const P = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z"/>',
  chart: '<path d="M4 20h16"/><path d="M6 16v-3"/><path d="M10 16V9"/><path d="M14 16v-5"/><path d="M18 16V5"/>',
  arrowUpLeft: '<path d="M17 17 7 7"/><path d="M7 15V7h8"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.2" cy="9" r="2.4"/><path d="M16.5 13.6c2.6.2 4.5 2 4.5 4.9"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.8"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  starFill: '<path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M12 6.5C10.3 5 7.6 4.5 3.5 4.8v13.4c4.1-.3 6.8.2 8.5 1.8 1.7-1.6 4.4-2.1 8.5-1.8V4.8C16.4 4.5 13.7 5 12 6.5z"/><path d="M12 6.5V20"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  trend: '<path d="m3 17 5.5-5.5 3.5 3.5L19 8"/><path d="M14.5 8H19v4.5"/><path d="M3 21h18" opacity=".35"/>',
  history: '<path d="M4 19h16"/><path d="m5 15 4-5 4 3 6-7"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="13" cy="13" r=".6" fill="currentColor"/>',
  science: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/><path d="M8 12.5c0-3 2-5 5-5-.2 3.2-2 5-5 5z"/><path d="M8 12.5 11 9.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5 15.6 10l-1.4 4.2H9.8L8.4 10z"/><path d="M12 3v4.5M15.6 10l4.8-1.4M14.2 14.2l2.8 4.3M9.8 14.2 7 18.5M8.4 10 3.6 8.6"/>',
  bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 19.5h8"/><path d="M9 8c0-1.5 1-2 1-3.5M13 8c0-1.5 1-2 1-3.5"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17M8 5l2 4.5M13 5l2 4.5"/><path d="m10.5 12.5 4 2.2-4 2.2z"/>',
  shareNodes: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  share: '<path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  crown: '<path d="M3.5 8.5 7.5 12 12 5.5l4.5 6.5 4-3.5-1.8 9.5H5.3z"/><path d="M5.5 20.5h13"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="m15.5 8.5 4-4M17 4.5h2.5V7"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5c5-2.6 9 2.6 14 0v9c-5 2.6-9-2.6-14 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8" y="8" width="12.5" height="12.5" rx="2.5"/><path d="M16 8V5.5A2 2 0 0 0 14 3.5H5.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4"/><path d="M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.3 10.9 5.5 3.5h4l2.5 5M15.7 10.9l2.8-7.4h-4L12 8.5"/><path d="m12 12.5.9 1.7 1.9.3-1.4 1.3.3 1.9-1.7-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  volumeOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  vibrate: '<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M4 8.5v7M20 8.5v7M11 17.5h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  sparkle: '<path d="M12 3.5c.6 4.3 2.4 6.3 6.5 7-4.1.7-5.9 2.7-6.5 7-.6-4.3-2.4-6.3-6.5-7 4.1-.7 5.9-2.7 6.5-7z"/><path d="M19 3v3M17.5 4.5h3M5 17.5v3M3.5 19h3"/>',
  download: '<path d="M12 3.5v11.5"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>',
  upload: '<path d="M12 15.5V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 5.6 7M4 12.5A8 8 0 0 0 18.4 17"/><path d="M5 3.5V7.5h4M19 20.5v-4h-4"/>',
  wifiOff: '<path d="M2.5 8.8A15 15 0 0 1 8 5.7M12 5a15 15 0 0 1 9.5 3.8"/><path d="M5.5 12.2A10 10 0 0 1 10 9.6M14.8 10a10 10 0 0 1 3.7 2.2"/><path d="M8.8 15.6a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="m3 3 18 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>',
  edit: '<path d="M4 20h4.5L19.3 9.2a2.1 2.1 0 0 0-3-3L5.5 17v3z"/><path d="m14.5 8 2.5 2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19z"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  dots: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>',
  windows: '<path d="M3.5 5.8 10.5 4.8v6.7h-7zM12 4.6l8.5-1.2v8.1H12zM3.5 13h7v6.7l-7-1zM12 13h8.5v8.1L12 19.9z"/>',
  linux: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 10 3 2.5L7 15M12.5 15.5h4.5"/>',
  android: '<path d="M5.5 10.5a6.5 6.5 0 0 1 13 0V17a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 17z"/><path d="M5.5 11.5h13M8 4l1.5 2.5M16 4l-1.5 2.5"/><circle cx="9.5" cy="8.6" r=".7" fill="currentColor"/><circle cx="14.5" cy="8.6" r=".7" fill="currentColor"/><path d="M9 18.5v2.5M15 18.5v2.5"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18"/><circle cx="6" cy="6.3" r=".6" fill="currentColor"/><circle cx="8.3" cy="6.3" r=".6" fill="currentColor"/><path d="m10 12.5 4.5 2.5-4.5 2.5z"/>',
  whatsapp: '<path d="M4 20.5 5.2 16.6A8.5 8.5 0 1 1 8.4 19.5z"/><path d="M9.1 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.5.9 1.4 1.8 2.4 2.3.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.6-.1l1.5.7c.3.1.4.3.3.6-.1.9-.9 1.6-1.8 1.6-2.6-.2-5.6-3.1-5.9-5.6-.1-.6 0-1.2.4-1.8z"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5"/>',
  steps: '<path d="M8 4.5c1.6 0 2.5 1.6 2.5 4s-.9 4-2.5 4-2.5-1.6-2.5-4 .9-4 2.5-4zM6 15h4v1.5a2 2 0 0 1-4 0zM16 8c1.6 0 2.5 1.6 2.5 4s-.9 4-2.5 4-2.5-1.6-2.5-4 .9-4 2.5-4zM14 18.5h4V20a2 2 0 0 1-4 0z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  fire: '<path d="M12 21c-3.8 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 1.8 1.4 2.9 2.4 3.3.2-2.8 1.5-5.3 3.5-6.8-.4 3.3 3.5 5.9 3.5 11.1 0 3.9-2.8 6.9-6.5 6.9z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.7 2.3-4.2.8 1.3 3.3 2 3.3 4.2 0 1.6-1.2 2.8-2.8 2.8z"/>',
  node: '<circle cx="12" cy="12" r="4"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10"/>',
};

// 12 avatars (line icons) – as in the design: compass, book, crown, bolt, star, globe, feather, key, rocket, owl, glasses, flag
const AV = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2z"/><circle cx="12" cy="12" r=".7" fill="currentColor"/>',
  book: P.book,
  crown: P.crown,
  bolt: P.bolt,
  star: P.star,
  globe: '<circle cx="12" cy="10" r="6.5"/><path d="M5.5 10h13M12 3.5c1.8 1.9 2.7 4 2.7 6.5s-.9 4.6-2.7 6.5c-1.8-1.9-2.7-4-2.7-6.5s.9-4.6 2.7-6.5z"/><path d="M17.8 15.2A8 8 0 0 1 6.2 15.2M12 18v2.5M8.5 21h7"/>',
  feather: '<path d="M20 4c-6.5 0-12 4.5-12.5 12L6 20.5"/><path d="M20 4c.3 7.2-4.8 12.2-11.8 12.4"/><path d="M10.5 12.5h5M9 15.5h3"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.7 9-9M16 7.2l2.5 2.5M13.5 9.7l2 2"/>',
  rocket: '<path d="M14.5 4.5c2.7-1 4.4-1 5-1 0 .6 0 2.3-1 5L12.8 14.2l-3-3z"/><path d="m9.8 11.2-3.6-.4L4 13l3.6 1.2M12.8 14.2l.4 3.6L11 20l-1.2-3.6"/><circle cx="15.5" cy="8.5" r="1.4"/><path d="M6.5 17.5c-1 .4-1.8 1.4-2 3 1.6-.2 2.6-1 3-2"/>',
  owl: '<path d="M6 5.5 8 7.5h8l2-2v9a6 6 0 0 1-12 0z"/><circle cx="9.5" cy="11" r="2"/><circle cx="14.5" cy="11" r="2"/><path d="m11.2 13.6.8 1.2.8-1.2M9.5 17.5c1.6.8 3.4.8 5 0"/>',
  glasses: '<circle cx="6.5" cy="13" r="3.5"/><circle cx="17.5" cy="13" r="3.5"/><path d="M10 12.5c1.3-.8 2.7-.8 4 0M3 12.5l1-3M21 12.5l-1-3"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.5 4 2.5 4H6"/>',
};

export const AVATARS = Object.keys(AV);
export const COLORS = [
  { id: 'blue', hex: '#2F5FC4', name: 'כחול' },
  { id: 'red', hex: '#EE5D5D', name: 'אדום' },
  { id: 'green', hex: '#26A867', name: 'ירוק' },
  { id: 'amber', hex: '#F2A51A', name: 'כתום' },
  { id: 'purple', hex: '#8A5CD6', name: 'סגול' },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;

export function icon(name, { size = 22, cls = '', sw = 1.8, label } = {}) {
  const body = P[name] || AV[name] || P.node;
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${aria} focusable="false">${body}</svg>`;
}

export function avatarSvg(name, size = 24) {
  return icon(AV[name] ? name : 'compass', { size, sw: 1.6 });
}

/** Round avatar badge: colored disc with line icon */
export function avatarBadge(p, size = 44, extra = '') {
  const hex = colorHex(p?.color);
  return `<span class="av ${extra}" style="--av:${hex};width:${size}px;height:${size}px">${avatarSvg(p?.avatar, Math.round(size * 0.56))}</span>`;
}

/** Brand mark: the node-route "path of links" */
export function brandRoute(w = 220, h = 70, cls = '') {
  return `<svg class="brand-route ${cls}" width="${w}" height="${h}" viewBox="0 0 220 70" fill="none" aria-hidden="true">
    <path d="M10 58h58l14-14h40l14 14h18l20-20V14l-14-8h-40" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${[[10, 58], [68, 58], [122, 44], [136, 58], [154, 58], [174, 38], [174, 14], [120, 6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="var(--card)" stroke="var(--ink)" stroke-width="2.6"/>`).join('')}
  </svg>`;
}
