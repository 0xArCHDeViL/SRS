import { STORE_KEY, SETTINGS_KEY, STREAK_STORE_KEY } from './config.js';
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
    if (stateStr) setSrsState(JSON.parse(stateStr));
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
    srsState[id] = { box:0, due: todayISO(), seen:0, correct:0, wrong:0, lastSeen:null };
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
