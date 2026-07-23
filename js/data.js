import { DATA_URL } from './config.js';
import { setRAW, setALL_CARDS, setMETA, setCARD_BY_ID, ALL_CARDS, srsState, filterState, settings } from './state.js';
import { isDue, shuffle } from './utils.js';

export async function fetchDatabase() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const raw = await response.json();
    setRAW(raw);
    const allCards = raw.cards || [];
    setALL_CARDS(allCards);
    setMETA(raw.metadata || {});
    setCARD_BY_ID(new Map(allCards.map(c => [c.id, c])));
  } catch (error) {
    console.error("Gagal mengambil database kotoba:", error);
    document.getElementById('heroGreeting').textContent = "Koneksi Terputus";
    document.getElementById('heroSub').textContent = "Gagal mengunduh database kotoba. Periksa koneksi internetmu dan muat ulang halaman.";
    throw error;
  }
}

export function computeDueNewCounts(){
  let due = 0, fresh = 0;
  for(const c of ALL_CARDS){
    const st = srsState[c.id];
    if(!st || !st.lastSeen){ fresh++; }
    else if(isDue(st)){ due++; }
  }
  return { due, fresh };
}

export function getFilteredCards(){
  let cards = ALL_CARDS;
  if(filterState.selectedBabs.size > 0){
    cards = cards.filter(c => filterState.selectedBabs.has(c.bab));
  }
  if(filterState.selectedGroups.size > 0){
    cards = cards.filter(c => filterState.selectedGroups.has(c.bab+'::'+c.group));
  }
  if(filterState.scope === 'due'){
    cards = cards.filter(c => { const st = srsState[c.id]; return st && st.lastSeen && isDue(st); });
  } else if(filterState.scope === 'new'){
    cards = cards.filter(c => { const st = srsState[c.id]; return !st || !st.lastSeen; });
  }
  return cards;
}

export function buildSession(){
  let pool = getFilteredCards();
  if(pool.length === 0) return [];

  const due = [];
  const fresh = [];

  for(const c of pool){
    const st = srsState[c.id];
    if(!st || !st.lastSeen){ fresh.push(c); }
    else if(isDue(st)){ due.push(c); }
  }

  shuffle(due);
  shuffle(fresh);

  const dueCap = settings.reviewCap === 0 ? due.length : settings.reviewCap;
  const newCap = settings.newPerSession === 0 ? fresh.length : settings.newPerSession;

  const dueSlice = due.slice(0, dueCap);
  const freshSlice = fresh.slice(0, newCap);

  let queue = [...dueSlice, ...freshSlice];
  shuffle(queue);

  if(filterState.scope === 'due') queue = dueSlice;
  if(filterState.scope === 'new') queue = freshSlice;

  return queue;
}
