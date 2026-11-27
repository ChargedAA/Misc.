// Icons: the logo, one per skill, the menu tools, and the small flags that say what a game needs.
// All are inline SVG drawn with currentColor, so CSS sets their colour.

import { NEEDS_SOUND } from './minis/groups.ts';
import type { Entry } from './minis/index.ts';

const svg = (body: string, cls = 'ico', vb = 24) =>
  `<svg class="${cls}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The mark: a bar pulled taut into a bow, held by a line to a weight. */
export const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-label="Tension" role="img" fill="none" stroke-linecap="round"><path d="M5 9.5 Q16 14.5 27 9.5" stroke="currentColor" stroke-width="2.6"/><path d="M16 12.2 V22" stroke="currentColor" stroke-width="2.2"/><circle cx="16" cy="25" r="3.2" fill="var(--accent)"/></svg>`;

/** The logo with the name beside it, for the home screen. */
export const LOGO_FULL = `<span class="brand">${LOGO}<span class="wm">TENSION</span></span>`;

/** Each skill's colour: distinct hues that read on the dark background. */
export const SKILL_COLOR: Record<string, string> = {
  reaction: '#ff6b4a',
  speed: '#ffb84d',
  timing: '#4cc9f0',
  coordination: '#9d8cff',
  dexterity: '#ff7ac6',
  aim: '#ff4d6d',
  memory: '#5be37d',
  attention: '#ffd84d',
  judgement: '#3ddbd9',
  reasoning: '#6ea8ff',
  ear: '#c792ea',
};

const SKILL_PATHS: Record<string, string> = {
  // A lightning bolt.
  reaction: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  // Two chevrons.
  speed: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  // A metronome.
  timing: '<path d="M8 21h8l-2.5-17h-3z"/><path d="M12 15l5-8"/><circle cx="17" cy="7" r="1.2"/>',
  // Two linked rings.
  coordination: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  // Keys under fingers.
  dexterity: '<rect x="3" y="7" width="5" height="10" rx="1.2"/><rect x="9.5" y="4" width="5" height="13" rx="1.2"/><rect x="16" y="9" width="5" height="8" rx="1.2"/><path d="M3 20.5h18"/>',
  // A crosshair.
  aim: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  // A grid with one cell remembered.
  memory: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" fill="currentColor"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  // An eye.
  attention: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  // Scales.
  judgement: '<path d="M12 3.5v17M7 20.5h10M4 7.5h16"/><path d="M6 7.5 3 14h6zM18 7.5 15 14h6z"/>',
  // A light bulb.
  reasoning: '<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2V17h5v-1c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  // A speaker with sound waves.
  ear: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
};

export function skillIcon(skill: string): string {
  return `<span class="sk" style="--c:${SKILL_COLOR[skill] ?? 'var(--line)'}">${svg(SKILL_PATHS[skill] ?? '<circle cx="12" cy="12" r="6"/>')}</span>`;
}

const TOOL_PATHS: Record<string, string> = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  random: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  boards: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v3M8.5 20.5h7M10 17h4v3.5h-4z"/>',
  stats: '<path d="M4 20.5h16"/><rect x="5.5" y="11" width="3" height="7" rx=".6"/><rect x="10.5" y="6" width="3" height="12" rx=".6"/><rect x="15.5" y="13.5" width="3" height="4.5" rx=".6"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  share: '<circle cx="6" cy="12" r="2.6"/><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.3 10.8l7-4M8.3 13.2l7 4"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/>',
  daily: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>',
};

export function toolIcon(name: string): string {
  return svg(TOOL_PATHS[name] ?? '');
}

const FLAG_PATHS = {
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>',
  mouse: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 6.5v3.5"/>',
  audio: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
};

/** What a game needs, as small icons: blue if it is needed, yellow if it is one way of several. */
export function flagsHtml(e: Pick<Entry, 'id' | 'input'>): string {
  const f = (kind: keyof typeof FLAG_PATHS, optional: boolean, title: string) =>
    `<span class="flag${optional ? ' opt' : ''}" title="${title}">${svg(FLAG_PATHS[kind], 'ico')}</span>`;
  const out: string[] = [];
  if (e.input === 'keys') out.push(f('keyboard', false, 'Keyboard (or the on-screen pads)'));
  else if (e.input === 'type') out.push(f('keyboard', false, 'Needs a keyboard to type'));
  else if (e.input === 'pointer') out.push(f('mouse', false, 'Mouse or touch'));
  else {
    out.push(f('keyboard', true, 'Keyboard, or'));
    out.push(f('mouse', true, 'a click or tap'));
  }
  if (NEEDS_SOUND.has(e.id)) out.push(f('audio', false, 'Needs sound on'));
  return `<span class="flags">${out.join('')}</span>`;
}

/** A game's badge: its initials on a tile in its skill's colour. */
export function gameBadge(name: string, skill: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, '');
  const mono = (letters[0] ?? '?').toUpperCase() + (letters[1] ?? '').toLowerCase();
  return `<span class="gb" style="--c:${SKILL_COLOR[skill] ?? 'var(--line)'}">${mono}</span>`;
}
