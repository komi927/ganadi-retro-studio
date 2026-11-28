export const HEAD_PIVOT_Y = 20.5;
export const HEAD_CENTER_Y = 32.7;
export const HEAD_LOCAL_CY = HEAD_CENTER_Y - HEAD_PIVOT_Y;
export const HEAD_RX = 13.0;
export const HEAD_RY = 13.4;
export const HEAD_RZ = 12.2;
export const HEAD_P = 2.65;
export const FACE_WIDTH = 21;
export const FACE_BOTTOM = 20.7;
export const FACE_TOP = 43.8;

// 台詞は作者のKakaoスタンプとHNFの日本語版LINEスタンプに合わせる。
const GANADI_EMOTES = [
  { id: 'normal', label: '通常',           icon: '🐶', face: 'normal', pose: 'idle',   key: '1' },
  { id: 'hug',    label: 'ぎゅってして',   icon: '🥺', face: 'hug',    pose: 'hug',    key: '2', bubble: 'ぎゅってして。。' },
  { id: 'du',     label: 'デュ…',          icon: '💧', face: 'du',     pose: 'du',     key: '3', bubble: 'デュ…' },
  { id: 'cry',    label: '号泣',           icon: '😭', face: 'cry',    pose: 'cry',    key: '4', bubble: 'デュァァァァァ' },
  { id: 'geso',   label: 'しょんぼり',     icon: '🫥', face: 'geso',   pose: 'geso',   key: '5' },
  { id: 'happy',  label: 'るんるん',       icon: '🎵', face: 'happy',  pose: 'dance',  key: '6', bubble: 'るん るん' },
  { id: 'fierce', label: 'ガルルル…',     icon: '💢', face: 'fierce', pose: 'fierce', key: '7', bubble: 'ガルルル…' },
  { id: 'angel',  label: '天使',           icon: '😇', face: 'angel',  pose: 'angel',  key: '8', prop: 'angel' },
  { id: 'devil',  label: '悪魔',           icon: '😈', face: 'normal', pose: 'devil',  key: '9', prop: 'devil' },
  { id: 'rose',   label: 'バラ',           icon: '🌹', face: 'normal', pose: 'rose',   key: '0', prop: 'rose' },
  { id: 'sit',    label: 'おすわり',       icon: '🐾', face: 'normal', pose: 'sit' },
  { id: 'sleep',  label: 'おひるね',       icon: '💤', face: 'sleep',  pose: 'sleep' },
  { id: 'bow',    label: 'ぺこっ',         icon: '🌿', face: 'sleep',  pose: 'bow' },
  { id: 'prone',  label: 'ぺたん',         icon: '🐾', face: 'normal', pose: 'prone', form: true },
  { id: 'roll',   label: 'ごろん',         icon: '☁️', face: 'normal', pose: 'roll', form: true },
  { id: 'mochi',  label: 'もちもち',       icon: '🍡', face: 'normal', pose: 'mochi', form: true },
  { id: 'bun',    label: 'ガナディまん',   icon: '♨️', face: 'normal', pose: 'bun',   form: true },
];
const GONYANI_EMOTES = [
  { id: 'normal', label: '通常',           icon: '🐱', face: 'gonyani-normal', pose: 'idle',   key: '1' },
  { id: 'stare',  label: '…',             icon: '👀', face: 'gonyani-stare',  pose: 'stare',  key: '2', bubble: '…' },
  { id: 'wary',   label: 'マジンガー耳',   icon: '⚡', face: 'gonyani-wary',   pose: 'wary',   key: '3' },
  { id: 'sit',    label: 'おすわり',       icon: '🐾', face: 'gonyani-stare',  pose: 'sit',    key: '4' },
  { id: 'sleep',  label: 'おひるね',       icon: '💤', face: 'gonyani-sleep',  pose: 'sleep',  key: '5' },
  { id: 'loaf',   label: '香箱座り',       icon: '🐾', face: 'gonyani-normal', pose: 'loaf', form: true },
  { id: 'stretch', label: 'のびー',       icon: '↔️', face: 'gonyani-normal', pose: 'stretch', form: true },
];
export const CHARACTERS = {
  ganadi: { id: 'ganadi', label: 'ガナディ', emotes: GANADI_EMOTES },
  gonyani: { id: 'gonyani', label: 'ゴニャニ', emotes: GONYANI_EMOTES },
};
export const FLOOR_POSES = new Set(['prone', 'roll', 'sleep', 'loaf', 'stretch']);
