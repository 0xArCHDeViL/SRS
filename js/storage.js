import { STORE_KEY, SETTINGS_KEY, STREAK_STORE_KEY, createEmptyCard, State } from './config.js';
import { srsState, settings, streakCache, setSrsState, setSettings, setStreakCache } from './state.js';
import { todayISO, addDaysISO } from './utils.js';

export const StorageAPI = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') {
      try {
        const res = await window.storage.get(key, false);
        return res && res.value ? res.value : null;
      } catch (e) {
        console.warn("Native storage get failed, falling back to localStorage");
      }
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage get failed:", e);
      return null;
    }
  },

  async set(key, value) {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      try {
        await window.storage.set(key, value, false);
        return;
      } catch (e) {
        console.warn("Native storage set failed, falling back to localStorage");
      }
    }
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage set failed:", e);
    }
  }
};

export async function loadState(){
  try {
    const stateStr = await StorageAPI.get(STORE_KEY);
    if (stateStr) {
      let parsed = JSON.parse(stateStr);
      // Migration script: convert old scalar box to FSRS card object
      for(let key in parsed){
        let st = parsed[key];
        if(st.box !== undefined){
          let card = createEmptyCard(new Date());
          if (st.box === 0) {
            card.state = State.New;
          } else {
            card.state = State.Review;
            // Guessing stability based on old box (intervals were 1, 3, 7, 16, 35)
            const stabs = [0, 1, 3, 7, 16, 35];
            card.stability = stabs[st.box] || 1;
            card.difficulty = 5.0;
            card.reps = st.seen || 0;
            card.lapses = st.wrong || 0;
            // set due date from old string
            card.due = st.due ? new Date(st.due) : new Date();
            card.last_review = st.lastSeen ? new Date(st.lastSeen) : new Date();
          }
          card.seen = st.seen || 0;
          card.correct = st.correct || 0;
          card.wrong = st.wrong || 0;
          parsed[key] = card;
        } else {
          // If already migrated, we just need to ensure due dates are Date objects
          if(st.due && typeof st.due === 'string') st.due = new Date(st.due);
          if(st.last_review && typeof st.last_review === 'string') st.last_review = new Date(st.last_review);
        }
      }
      setSrsState(parsed);
    }
  } catch(e) { setSrsState({}); }

  try {
    const settingsStr = await StorageAPI.get(SETTINGS_KEY);
    if(settingsStr) setSettings(JSON.parse(settingsStr));
  } catch(e) {}

  try {
    const streakStr = await StorageAPI.get(STREAK_STORE_KEY);
    if(streakStr) setStreakCache(JSON.parse(streakStr));
    else setStreakCache({ count:0, lastDay:null });
  } catch(e) { setStreakCache({ count:0, lastDay:null }); }
}

export function saveState(){
  StorageAPI.set(STORE_KEY, JSON.stringify(srsState));
}
export function saveSettings(){
  StorageAPI.set(SETTINGS_KEY, JSON.stringify(settings));
}
export function saveStreak(){
  StorageAPI.set(STREAK_STORE_KEY, JSON.stringify(streakCache));
}

export function getCardState(id){
  if(!srsState[id]){
    let card = createEmptyCard(new Date());
    card.seen = 0;
    card.correct = 0;
    card.wrong = 0;
    srsState[id] = card;
  }
  return srsState[id];
}

export function touchStreak(){
  const today = todayISO();
  if(streakCache.lastDay === today) return streakCache;
  const yest = addDaysISO(-1);
  if(streakCache.lastDay === yest){ streakCache.count += 1; } else { streakCache.count = 1; }
  streakCache.lastDay = today;
  saveStreak();
  return streakCache;
}
export function peekStreak(){ return streakCache; }
