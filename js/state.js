export let RAW = null;
export let ALL_CARDS = [];
export let META = {};
export let CARD_BY_ID = new Map();

export let srsState = {};
export let settings = {
  furigana: true,
  romaji: false,
  autoPlayNone: true,
  newPerSession: 12,
  reviewCap: 40,
  theme: 'dark',
  guidedDrawing: true,
  gridLines: 2
};
export let streakCache = { count:0, lastDay:null };

export let filterState = {
  selectedBabs: new Set(),
  selectedGroups: new Set(),
  scope: 'all'
};

export let session = {
  mode: null,
  queue: [],
  idx: 0,
  correct: 0,
  wrong: 0,
  flipped: false,
  answered: false
};

export let filterExpandedBab = new Set();
export let pendingMode = null;

// Setters to allow other modules to mutate state references
export function setRAW(val) { RAW = val; }
export function setALL_CARDS(val) { ALL_CARDS = val; }
export function setMETA(val) { META = val; }
export function setCARD_BY_ID(val) { CARD_BY_ID = val; }
export function setSrsState(val) { srsState = val; }
export function setSettings(val) { settings = Object.assign(settings, val); }
export function setStreakCache(val) { streakCache = val; }
export function setSession(val) { session = val; }
export function setPendingMode(val) { pendingMode = val; }
