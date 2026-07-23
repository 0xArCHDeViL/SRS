import { filterState, pendingMode, setPendingMode, META, session, srsState, setSrsState, ALL_CARDS, settings, setSettings } from './state.js';
import { saveState, saveSettings } from './storage.js';
import { showScreen, renderFilterScreen, renderHome, updateFilterSelCount, renderStats, showResetModal, closeResetModal, closeExitModal, toast, flipCard } from './ui.js';
import { startFlashcardSession, startQuizKanjiSession, startQuizArtiSession, answerFlashcard, undoLastAnswer, handleQuizAnswer } from './modes.js';

export function toggleBabSelection(bab){
  if(filterState.selectedBabs.has(bab)){
    filterState.selectedBabs.delete(bab);
    [...filterState.selectedGroups].forEach(gkey=>{
      if(gkey.startsWith(bab+'::')) filterState.selectedGroups.delete(gkey);
    });
  } else {
    filterState.selectedBabs.add(bab);
  }
  renderFilterScreen(document.getElementById('filterModeTitle').textContent, toggleBabSelection, toggleGroupSelection);
}

export function toggleGroupSelection(gkey, bab){
  if(filterState.selectedGroups.has(gkey)){
    filterState.selectedGroups.delete(gkey);
  } else {
    filterState.selectedGroups.add(gkey);
    filterState.selectedBabs.add(bab);
  }
  renderFilterScreen(document.getElementById('filterModeTitle').textContent, toggleBabSelection, toggleGroupSelection);
  updateFilterSelCount();
}

export function quickStartSession(scope){
  filterState.selectedBabs = new Set();
  filterState.selectedGroups = new Set();
  filterState.scope = scope;
  setPendingMode('flashcard');
  const savedNewCap = settings.newPerSession;
  const savedReviewCap = settings.reviewCap;
  setSettings({ newPerSession: 0, reviewCap: 0 });
  startFlashcardSession();
  setSettings({ newPerSession: savedNewCap, reviewCap: savedReviewCap });
}

export function confirmExitSession(){
  if(!session.queue || session.idx === 0){
    showScreen('screen-home');
    renderHome(quickStartSession);
    renderQuickSettings();
    return;
  }
  document.getElementById('exitModalOverlay').classList.add('show');
}

export function executeReset() {
  const val = document.getElementById('resetBabSelect').value;
  let count = 0;

  if (val === 'ALL') {
    count = Object.keys(srsState).length;
    setSrsState({});
  } else {
    const bab = parseInt(val, 10);
    const cardsInBab = ALL_CARDS.filter(c => c.bab === bab);
    for(const c of cardsInBab) {
      if(srsState[c.id]) {
        delete srsState[c.id];
        count++;
      }
    }
  }

  saveState();
  closeResetModal();
  renderStats(showResetModal);
  renderHome(quickStartSession);
  renderQuickSettings();
  toast(`Berhasil mereset ${count} kartu 🗑️`);
}

export function renderQuickSettings(){
  const el = document.getElementById('quickSettings');
  const newDisplay = settings.newPerSession === 0 ? '∞' : settings.newPerSession;
  const reviewDisplay = settings.reviewCap === 0 ? '∞' : settings.reviewCap;
  el.innerHTML = `
    <div class="qsettings-row">
      <div class="qs-label"><span class="qi">振</span> Furigana<small>Tampilkan cara baca di atas kanji</small></div>
      <label class="toggle"><input type="checkbox" id="toggleFurigana" ${settings.furigana?'checked':''}><span class="track"><span class="thumb"></span></span></label>
    </div>
    <div class="qsettings-row">
      <div class="qs-label"><span class="qi">Rj</span> Romaji<small>Tampilkan romanisasi di kartu jawaban</small></div>
      <label class="toggle"><input type="checkbox" id="toggleRomaji" ${settings.romaji?'checked':''}><span class="track"><span class="thumb"></span></span></label>
    </div>
    <div class="qsettings-row">
      <div class="qs-label"><span class="qi">＋</span> Kartu baru / sesi<small>0 = tanpa batas. Kartu banyak = otak numpuk.</small></div>
      <div class="stepper">
        <button data-step="new" data-dir="-1">−</button>
        <span class="val ${settings.newPerSession===0?'infinity':''}" id="valNewPerSession">${newDisplay}</span>
        <button data-step="new" data-dir="1">+</button>
      </div>
    </div>
    <div class="qsettings-row">
      <div class="qs-label"><span class="qi">↻</span> Batas review<small>0 = tanpa batas. Semua yang jatuh tempo diborong.</small></div>
      <div class="stepper">
        <button data-step="review" data-dir="-1">−</button>
        <span class="val ${settings.reviewCap===0?'infinity':''}" id="valReviewCap">${reviewDisplay}</span>
        <button data-step="review" data-dir="1">+</button>
      </div>
    </div>
  `;
  el.querySelector('#toggleFurigana').addEventListener('change', e=>{
    setSettings({furigana: e.target.checked}); saveSettings();
  });
  el.querySelector('#toggleRomaji').addEventListener('change', e=>{
    setSettings({romaji: e.target.checked}); saveSettings();
  });
  el.querySelectorAll('button[data-step]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const dir = parseInt(btn.dataset.dir,10);
      if(btn.dataset.step === 'new'){
        setSettings({newPerSession: Math.max(0, Math.min(300, settings.newPerSession + dir*1))});
      } else {
        setSettings({reviewCap: Math.max(0, Math.min(999, settings.reviewCap + dir*5))});
      }
      saveSettings();
      renderQuickSettings();
      renderHome(quickStartSession);
    });
  });
}


export function bindEvents(){
  document.getElementById('modeFlashcard').addEventListener('click', ()=>{
    filterState.scope='all';
    renderFilterScreen('Flashcard SRS', toggleBabSelection, toggleGroupSelection);
    setPendingMode('flashcard');
    showScreen('screen-filter');
  });
  document.getElementById('modeQuizKanji').addEventListener('click', ()=>{
    filterState.scope='all';
    renderFilterScreen('Quiz — Yomikata', toggleBabSelection, toggleGroupSelection);
    setPendingMode('quiz-kanji');
    showScreen('screen-filter');
  });
  document.getElementById('modeQuizArti').addEventListener('click', ()=>{
    filterState.scope='all';
    renderFilterScreen('Quiz — Arti', toggleBabSelection, toggleGroupSelection);
    setPendingMode('quiz-arti');
    showScreen('screen-filter');
  });

  document.getElementById('filterBack').addEventListener('click', ()=>{
    showScreen('screen-home'); renderHome(quickStartSession); renderQuickSettings();
  });
  document.getElementById('filterSelectAll').addEventListener('click', ()=>{
    filterState.selectedBabs = new Set(META.babs || []);
    filterState.selectedGroups = new Set();
    renderFilterScreen(document.getElementById('filterModeTitle').textContent, toggleBabSelection, toggleGroupSelection);
  });
  document.getElementById('filterClear').addEventListener('click', ()=>{
    filterState.selectedBabs = new Set();
    filterState.selectedGroups = new Set();
    renderFilterScreen(document.getElementById('filterModeTitle').textContent, toggleBabSelection, toggleGroupSelection);
  });
  document.querySelectorAll('.segmented button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.segmented button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      filterState.scope = btn.dataset.scope;
      updateFilterSelCount();
    });
  });
  document.getElementById('filterStart').addEventListener('click', ()=>{
    if(pendingMode === 'flashcard') startFlashcardSession();
    else if(pendingMode === 'quiz-kanji') startQuizKanjiSession();
    else if(pendingMode === 'quiz-arti') startQuizArtiSession();
  });

  document.getElementById('flashcard').addEventListener('click', flipCard);
  document.getElementById('btnYes').addEventListener('click', (e)=>{ e.stopPropagation(); answerFlashcard(true); });
  document.getElementById('btnNo').addEventListener('click', (e)=>{ e.stopPropagation(); answerFlashcard(false); });
  document.getElementById('studyUndo').addEventListener('click', (e)=>{ e.stopPropagation(); undoLastAnswer(); });
  document.getElementById('studyExit').addEventListener('click', ()=> confirmExitSession());
  document.getElementById('quizExit').addEventListener('click', ()=> confirmExitSession());

  document.getElementById('exitModalCancel').addEventListener('click', ()=> closeExitModal());
  document.getElementById('exitModalConfirm').addEventListener('click', ()=>{
    closeExitModal();
    showScreen('screen-home');
    renderHome(quickStartSession);
    renderQuickSettings();
  });

  document.getElementById('resetModalCancel').addEventListener('click', ()=> closeResetModal());
  document.getElementById('resetModalConfirm').addEventListener('click', ()=> executeReset());

  document.getElementById('summaryHome').addEventListener('click', ()=>{ showScreen('screen-home'); renderHome(quickStartSession); renderQuickSettings(); });
  document.getElementById('summaryAgain').addEventListener('click', ()=>{
    if(session.mode==='flashcard') startFlashcardSession();
    else if(session.mode==='quiz-kanji') startQuizKanjiSession();
    else if(session.mode==='quiz-arti') startQuizArtiSession();
  });

  document.getElementById('btnStats').addEventListener('click', ()=>{
    renderStats(showResetModal);
    showScreen('screen-stats');
  });
  document.getElementById('statsBack').addEventListener('click', ()=>{
    showScreen('screen-home'); renderHome(quickStartSession); renderQuickSettings();
  });

  document.addEventListener('keydown', (e)=>{
    const activeScreen = document.querySelector('.screen.active').id;
    if(activeScreen === 'screen-study'){
      if(e.code === 'Space'){ e.preventDefault(); flipCard(); }
      else if(e.code === 'ArrowRight' && session.flipped){ answerFlashcard(true); }
      else if(e.code === 'ArrowLeft' && session.flipped){ answerFlashcard(false); }
      else if(e.key === 'u' || e.key === 'U'){ undoLastAnswer(); }
    } else if(activeScreen === 'screen-quiz'){
      const num = parseInt(e.key,10);
      if(!isNaN(num) && num>=1 && num<=6){
        const btns = document.querySelectorAll('#quizOptions .opt-btn');
        if(btns[num-1] && !session.answered){
          const card = session.queue[session.idx];
          handleQuizAnswer(btns[num-1], card);
        }
      }
    }
  });
}
