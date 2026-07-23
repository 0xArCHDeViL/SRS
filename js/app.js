import { startQuizMenulisSession } from './mode-menulis.js';
import { fetchDatabase } from './data.js';
import { loadState } from './storage.js';
import { bindEvents, renderQuickSettings, quickStartSession } from './events.js';
import { renderHome } from './ui.js';

let initialized = false;
export async function init(){
  if(initialized) return;
  initialized = true;

  document.getElementById('heroGreeting').textContent = "Mengunduh Database...";
  document.getElementById('heroSub').textContent = "Mohon tunggu sebentar, sedang sinkronisasi data kotoba.";

  try {
    await fetchDatabase();
  } catch (error) {
    return;
  }

  await loadState();
  bindEvents();
  renderHome(quickStartSession);
  renderQuickSettings();
}

if(document.readyState === 'complete' || document.readyState === 'interactive'){
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
