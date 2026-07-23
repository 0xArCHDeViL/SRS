import { session, srsState, settings } from './state.js';
import { f, Rating } from './config.js';
import { saveState, getCardState } from './storage.js';
import { buildSession } from './data.js';
import { showScreen, toast } from './ui.js';
import { escapeHtml, todayISO } from './utils.js';
import { initCanvasForKanji, setCanvasCompleteCallback } from './canvas.js';
import { advanceSession } from './modes.js';

export function startQuizMenulisSession(){
  // Filter out cards that don't have kanji
  const queue = buildSession().filter(c => c.kanji && c.kanji !== c.kana);
  if(queue.length === 0){
    toast('Nggak ada kartu dengan kanji untuk filter ini 🤔');
    return;
  }

  session.mode = 'quiz-menulis';
  session.queue = queue;
  session.idx = 0;
  session.correct = 0;
  session.wrong = 0;
  session.answered = false;

  showScreen('screen-menulis');
  renderQuizMenulis();
}

export function renderQuizMenulis(){
  const card = session.queue[session.idx];
  session.answered = false;

  document.getElementById('menulisArti').textContent = card.arti;

  const readingEl = document.getElementById('menulisReading');
  readingEl.innerHTML = '';

  // We need to split the kana and replace kanji parts with [...]
  // For simplicity since the app's database structure might not have strict character mapping:
  // We will assume `card.kanji` string contains the kanji characters to trace.
  // We will identify all characters in `card.kanji` that are actual Kanji (CJK Unified Ideographs)
  // and replace them with interactive slots. Non-kanji characters (like hiragana okurigana) will be text.

  const kanjiChars = [];
  let displayHTML = '';

  for (let i = 0; i < card.kanji.length; i++) {
    const char = card.kanji[i];
    // Check if character is a kanji
    if (char >= '\u4E00' && char <= '\u9FAF' || char === '々') {
      kanjiChars.push(char);
      const slotIndex = kanjiChars.length - 1;
      displayHTML += `<span class="menulis-slot" data-slot-idx="${slotIndex}" data-char="${char}">[...]</span>`;
    } else {
      displayHTML += `<span class="menulis-text">${char}</span>`;
    }
  }

  readingEl.innerHTML = displayHTML;

  // Also add kana reading below for hint
  readingEl.innerHTML += `<div style="width:100%; font-size:14px; margin-top:8px; color:var(--text-lo);">${card.kana}</div>`;

  const pct = Math.round((session.idx / session.queue.length) * 100);
  document.getElementById('menulisProgress').style.width = pct + '%';
  document.getElementById('menulisCount').textContent = `${session.idx+1}/${session.queue.length}`;

  // State for current word's canvas completion
  session.menulisState = {
    totalSlots: kanjiChars.length,
    completedSlots: 0,
    wrongSlots: 0
  };

  // Attach event listeners to slots
  const slots = readingEl.querySelectorAll('.menulis-slot');
  slots.forEach((slot, index) => {
    slot.addEventListener('click', () => {
      // Allow only sequential drawing or any? The prompt says:
      // "Setiap [...] adalah slot terpisah... tentukan salah satu perilaku ini secara eksplisit di kode, jangan ambigu"
      // We will allow ANY order, to make it flexible.

      if (slot.classList.contains('completed')) return;

      const targetChar = slot.dataset.char;
      openCanvasModal(targetChar, slot);
    });
  });

  // If the word had NO kanji somehow (filtered out, but just in case)
  if (kanjiChars.length === 0) {
    handleMenulisWordComplete(true);
  }
}

function openCanvasModal(char, slotElement) {
  document.getElementById('canvasModalOverlay').style.display = 'flex';
  // Give UI time to paint modal before init
  setTimeout(() => {
    document.getElementById('canvasModalOverlay').classList.add('show');
    initCanvasForKanji(char);
  }, 10);

  // Set up the completion callback
  setCanvasCompleteCallback((success, isSkip) => {
    closeCanvasModal();
    if (success) {
      slotElement.classList.add('completed');
      slotElement.textContent = char;
      session.menulisState.completedSlots++;
    }
    if (isSkip) {
      session.menulisState.wrongSlots++; // Skip means wrong
      session.menulisState.completedSlots++;
    }

    // Evaluate if word is done
    if (session.menulisState.completedSlots === session.menulisState.totalSlots) {
      const isWordCorrect = session.menulisState.wrongSlots === 0;
      handleMenulisWordComplete(isWordCorrect);
    }
  });
}

function closeCanvasModal() {
  document.getElementById('canvasModalOverlay').classList.remove('show');
  setTimeout(() => {
    document.getElementById('canvasModalOverlay').style.display = 'none';
  }, 300);
}

document.getElementById('canvasBatal').addEventListener('click', closeCanvasModal);

function handleMenulisWordComplete(isCorrect) {
  if (session.answered) return;
  session.answered = true;

  const card = session.queue[session.idx];
  const st = getCardState(card.id);
  st.seen++;
  st.lastSeen = todayISO();

  let rating;
  if(isCorrect){
    st.correct++;
    session.correct++;
    rating = Rating.Good;
    toast('✓ Berhasil');
  } else {
    st.wrong++;
    session.wrong++;
    rating = Rating.Again;
    toast('✕ Dilewati / Salah');
  }

  const nextStates = f.repeat(st, new Date());
  const logItem = nextStates[rating];

  Object.assign(st, logItem.card);
  saveState();

  setTimeout(() => {
    advanceSession();
  }, 1000);
}
