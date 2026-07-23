import { filterState, settings, session, setSession, srsState, setSrsState, ALL_CARDS, pendingMode } from './state.js';
import { f, Rating } from './config.js';
import { saveState, getCardState, touchStreak } from './storage.js';
import { buildSession } from './data.js';
import { showScreen, renderFlashcard, toast } from './ui.js';
import { todayISO, addDaysISO, shuffle, escapeHtml, titleCase } from './utils.js';
import { startQuizMenulisSession, renderQuizMenulis } from './mode-menulis.js';

export { startQuizMenulisSession };

export function startFlashcardSession(){
  const queue = buildSession();
  if(queue.length === 0){
    toast('Nggak ada kartu yang cocok sama filter ini 🤔');
    return;
  }
  setSession({ mode:'flashcard', queue, idx:0, correct:0, wrong:0, flipped:false, answered:false, lastAnswer:null });
  showScreen('screen-study');
  renderFlashcard();
}

export function answerFlashcard(rating){
  const card = session.queue[session.idx];
  const st = getCardState(card.id);

  session.lastAnswer = {
    cardId: card.id,
    idx: session.idx,
    prevState: JSON.parse(JSON.stringify(st)),
    wasCorrect: rating > Rating.Again,
    prevSessionCorrect: session.correct,
    prevSessionWrong: session.wrong
  };

  st.seen++;
  st.lastSeen = todayISO(); // Keep lastSeen around for simple checking if touched

  if(rating > Rating.Again){
    st.correct++;
    session.correct++;
  } else {
    st.wrong++;
    session.wrong++;
  }

  const nextStates = f.repeat(st, new Date());
  const logItem = nextStates[rating];

  // Update state with FSRS calculation
  Object.assign(st, logItem.card);

  saveState();
  advanceSession();
}

export function undoLastAnswer(){
  const last = session.lastAnswer;
  if(!last || last.idx !== session.idx - 1){
    toast('Nggak ada jawaban buat di-undo');
    return;
  }
  srsState[last.cardId] = last.prevState;
  session.correct = last.prevSessionCorrect;
  session.wrong = last.prevSessionWrong;
  session.idx = last.idx;
  session.lastAnswer = null;
  saveState();
  renderFlashcard();
  toast('Jawaban dibatalkan ↺');
}

export function advanceSession(){
  session.idx++;
  if(session.idx >= session.queue.length){
    finishSession();
  } else {
    if(session.mode === 'flashcard') renderFlashcard();
    else if(session.mode === 'quiz-kanji') renderQuizKanji();
    else if(session.mode === 'quiz-arti') renderQuizArti();
    else if(session.mode === 'quiz-menulis') renderQuizMenulis();
  }
}

export function startQuizKanjiSession(){
  const queue = buildSession().filter(c=>c.has_kanji !== false);
  if(queue.length === 0){
    toast('Nggak ada kartu yang cocok sama filter ini 🤔');
    return;
  }
  setSession({ mode:'quiz-kanji', queue, idx:0, correct:0, wrong:0, answered:false });
  showScreen('screen-quiz');
  renderQuizKanji();
}

export function buildKanaDistractors(card, n){
  const sameTagPool = ALL_CARDS.filter(c => c.id !== card.id && c.tags.some(t=>card.tags.includes(t)) && c.kana !== card.kana);
  const sameGroupPool = ALL_CARDS.filter(c => c.id !== card.id && c.group === card.group && c.kana !== card.kana);
  let pool = sameGroupPool.length >= n-1 ? sameGroupPool : sameTagPool;
  if(pool.length < n-1) pool = ALL_CARDS.filter(c=>c.id!==card.id && c.kana !== card.kana);
  shuffle(pool);
  const distractors = pool.slice(0, n-1);
  const options = [card, ...distractors].map(c=>({ id:c.id, kana:c.kana }));
  shuffle(options);
  return options;
}

export function renderQuizKanji(){
  const card = session.queue[session.idx];
  session.answered = false;
  document.getElementById('quizPromptLabel').textContent = 'BACA KANJI INI';

  const kanjiEl = document.getElementById('quizPromptMain');
  kanjiEl.innerHTML = escapeHtml(card.kanji);
  kanjiEl.classList.remove('small');

  const textLen = card.kanji ? card.kanji.length : 0;
  if (textLen >= 9) { kanjiEl.style.fontSize = '24px'; }
  else if (textLen >= 6) { kanjiEl.style.fontSize = '32px'; }
  else { kanjiEl.style.fontSize = '44px'; }

  document.getElementById('quizPromptSub').textContent = titleCase(card.group||'');
  document.getElementById('quizFeedback').textContent = '';
  document.getElementById('quizFeedback').className = 'quiz-feedback';

  const options = buildKanaDistractors(card, 6);
  const optEl = document.getElementById('quizOptions');
  optEl.className = 'quiz-options opt6';
  optEl.innerHTML = '';
  options.forEach(opt=>{
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.textContent = opt.kana;
    btn.dataset.correct = opt.id === card.id ? '1' : '0';
    btn.dataset.cardId = opt.id;
    btn.addEventListener('click', ()=> handleQuizAnswer(btn, card));
    optEl.appendChild(btn);
  });

  const pct = Math.round((session.idx / session.queue.length) * 100);
  document.getElementById('quizProgress').style.width = pct + '%';
  document.getElementById('quizCount').textContent = `${session.idx+1}/${session.queue.length}`;
  document.getElementById('quizKbdHints').innerHTML = `<span><span class="kbd">1-6</span> pilih jawaban</span>`;
}

export function startQuizArtiSession(){
  const queue = buildSession();
  if(queue.length === 0){
    toast('Nggak ada kartu yang cocok sama filter ini 🤔');
    return;
  }
  setSession({ mode:'quiz-arti', queue, idx:0, correct:0, wrong:0, answered:false });
  showScreen('screen-quiz');
  renderQuizArti();
}

export function buildKanjiDistractors(card, n){
  const sameGroupPool = ALL_CARDS.filter(c => c.id !== card.id && c.group === card.group && c.kanji !== card.kanji);
  const sameTagPool = ALL_CARDS.filter(c => c.id !== card.id && c.tags.some(t=>card.tags.includes(t)) && c.kanji !== card.kanji);
  let pool = sameGroupPool.length >= n-1 ? sameGroupPool : sameTagPool;
  if(pool.length < n-1) pool = ALL_CARDS.filter(c=>c.id!==card.id && c.kanji !== card.kanji);
  shuffle(pool);
  const distractors = pool.slice(0, n-1);
  const options = [card, ...distractors].map(c=>({ id:c.id, kanji:c.kanji }));
  shuffle(options);
  return options;
}

export function renderQuizArti(){
  const card = session.queue[session.idx];
  session.answered = false;
  document.getElementById('quizPromptLabel').textContent = 'ARTINYA APA HAYO';

  const mainEl = document.getElementById('quizPromptMain');
  mainEl.textContent = card.arti;
  mainEl.classList.add('small');
  mainEl.style.fontSize = '';

  document.getElementById('quizPromptSub').textContent = titleCase(card.group||'');
  document.getElementById('quizFeedback').textContent = '';
  document.getElementById('quizFeedback').className = 'quiz-feedback';

  const options = buildKanjiDistractors(card, 4);
  const optEl = document.getElementById('quizOptions');
  optEl.className = 'quiz-options opt4';
  optEl.innerHTML = '';
  options.forEach(opt=>{
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.innerHTML = escapeHtml(opt.kanji);
    btn.dataset.correct = opt.id === card.id ? '1' : '0';
    btn.dataset.cardId = opt.id;
    btn.addEventListener('click', ()=> handleQuizAnswer(btn, card));
    optEl.appendChild(btn);
  });

  const pct = Math.round((session.idx / session.queue.length) * 100);
  document.getElementById('quizProgress').style.width = pct + '%';
  document.getElementById('quizCount').textContent = `${session.idx+1}/${session.queue.length}`;
  document.getElementById('quizKbdHints').innerHTML = `<span><span class="kbd">1-4</span> pilih jawaban</span>`;
}

export function handleQuizAnswer(btn, card){
  if(session.answered) return;
  session.answered = true;
  const isCorrect = btn.dataset.correct === '1';
  const optEl = document.getElementById('quizOptions');
  const allBtns = [...optEl.querySelectorAll('.opt-btn')];

  allBtns.forEach(b=>{
    if(b !== btn) b.classList.add('dim');
  });

  if(isCorrect){
    btn.classList.add('correct');
    document.getElementById('quizFeedback').textContent = '✓ Benar!';
    document.getElementById('quizFeedback').className = 'quiz-feedback correct';
  } else {
    btn.classList.add('wrong');
    const correctBtn = allBtns.find(b=>b.dataset.correct==='1');
    if(correctBtn){ correctBtn.classList.remove('dim'); correctBtn.classList.add('reveal-correct'); }
    const answerText = session.mode === 'quiz-kanji' ? card.kana : card.kanji;
    document.getElementById('quizFeedback').textContent = `✕ Jawaban benar: ${answerText}`;
    document.getElementById('quizFeedback').className = 'quiz-feedback wrong';
  }

  const st = getCardState(card.id);
  st.seen++;
  st.lastSeen = todayISO();

  let rating;
  if(isCorrect){
    st.correct++;
    session.correct++;
    rating = Rating.Good;
  } else {
    st.wrong++;
    session.wrong++;
    rating = Rating.Again;
  }

  const nextStates = f.repeat(st, new Date());
  const logItem = nextStates[rating];

  Object.assign(st, logItem.card);
  saveState();

  setTimeout(()=>{
    advanceSession();
  }, isCorrect ? 650 : 1400);
}


export function finishSession(){
  touchStreak();
  const total = session.correct + session.wrong;
  const pct = total > 0 ? Math.round((session.correct/total)*100) : 0;
  document.getElementById('summaryPct').textContent = pct + '%';
  document.getElementById('sumCorrect').textContent = session.correct;
  document.getElementById('sumWrong').textContent = session.wrong;
  document.getElementById('sumTotal').textContent = total;

  const circ = 415;
  const ring = document.getElementById('summaryRingFg');
  ring.style.stroke = pct >= 80 ? 'var(--matcha)' : pct >= 50 ? 'var(--kin)' : 'var(--shu)';
  setTimeout(()=>{
    ring.style.transition = 'stroke-dashoffset 1s cubic-bezier(.2,.8,.3,1)';
    ring.setAttribute('stroke-dashoffset', circ * (1 - pct/100));
  }, 100);

  let title = 'Sesi selesai 🎉';
  let sub = 'Mantap, lanjutin lagi besok.';
  if(pct === 100) { title = 'Sempurna! 完璧'; sub = 'Nol salah. Otak lagi encer nih.'; }
  else if(pct >= 80){ title = 'Solid banget 👌'; sub = 'Konsisten kayak gini terus, pasti nempel.'; }
  else if(pct >= 50){ title = 'Lumayan, jalan terus'; sub = 'Yang salah tadi bakal balik lagi buat direview.'; }
  else { title = 'Gapapa, ini bagian dari proses'; sub = 'Kartu yang salah otomatis direset ke box 0 buat direview lagi.'; }
  document.getElementById('summaryTitle').textContent = title;
  document.getElementById('summarySub').textContent = sub;

  showScreen('screen-summary');
}
