import { META, ALL_CARDS, srsState, settings, filterState, filterExpandedBab, session, setSrsState } from './state.js';
import { peekStreak, saveState, getCardState } from './storage.js';
import { computeDueNewCounts, getFilteredCards } from './data.js';
import { escapeHtml, titleCase, renderFurigana, toRomaji, formatTimeDiff } from './utils.js';
import { f, Rating } from './config.js';

export function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

let toastTimer = null;
export function toast(msg, ms=2000){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), ms);
}

export function renderHome(quickStartCb){
  const { due, fresh } = computeDueNewCounts();
  document.getElementById('statDue').textContent = due;
  document.getElementById('statNew').textContent = fresh;
  const streak = peekStreak();
  document.getElementById('statStreak').textContent = streak.count;
  document.getElementById('cardCountLabel').textContent = `${META.total_cards || 0} kartu · BAB 1–${META.babs ? Math.max(...META.babs) : 0}`;

  const hour = new Date().getHours();
  let greet = 'Selamat datang kembali';
  if(hour < 11) greet = 'Ohayou, siap belajar?';
  else if(hour < 15) greet = 'Konnichiwa — lanjut belajar?';
  else if(hour < 19) greet = 'Sore ini, sikat dikit yuk';
  else greet = 'Konbanwa — review malam?';
  document.getElementById('heroGreeting').textContent = greet;

  let sub = '';
  if(due > 0) sub = `${due} kartu jatuh tempo untuk direview hari ini.`;
  else if(fresh > 0) sub = `Semua review beres. Masih ada ${fresh} kartu baru kalau mau nambah.`;
  else sub = `Semua kartu sudah direview. Gaskeun besok lagi 🔥`;
  document.getElementById('heroSub').textContent = sub;

  const quickBtn = document.getElementById('heroQuickAction');
  if(due > 0){
    quickBtn.textContent = `⚡ Sikat ${due} Kartu Jatuh Tempo`;
    quickBtn.classList.remove('hidden');
    quickBtn.onclick = ()=> quickStartCb('due');
  } else if(fresh > 0){
    quickBtn.textContent = `🌱 Pelajari Semua Sisanya (${fresh})`;
    quickBtn.classList.remove('hidden');
    quickBtn.onclick = ()=> quickStartCb('new');
  } else {
    quickBtn.classList.add('hidden');
    quickBtn.onclick = null;
  }
}

export function renderFilterScreen(modeLabel, toggleBabCb, toggleGroupCb){
  document.getElementById('filterModeTitle').textContent = modeLabel;
  const babList = document.getElementById('babList');
  babList.innerHTML = '';

  for(const bab of META.babs){
    const groups = META.groups_per_bab[String(bab)] || [];
    const babCards = ALL_CARDS.filter(c => c.bab === bab);
    const item = document.createElement('div');
    item.className = 'bab-item';
    item.dataset.bab = bab;
    const isSelected = filterState.selectedBabs.has(bab);
    if(isSelected) item.classList.add('selected');

    const groupHtml = groups.map(g=>{
      const gCount = babCards.filter(c=>c.group===g).length;
      const gKey = bab+'::'+g;
      const gSel = filterState.selectedGroups.has(gKey);
      return `<div class="group-item ${gSel?'selected':''}" data-gkey="${gKey}" data-bab="${bab}" data-group="${escapeHtml(g)}">
        <span class="group-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span>
        <span>${titleCase(g)}</span>
        <span class="gc">${gCount}</span>
      </div>`;
    }).join('');

    item.innerHTML = `
      <div class="bab-row" data-bab="${bab}">
        <span class="bab-check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span>
        <span class="bab-num">BAB</span>
        <span class="bab-name">Bab ${bab}</span>
        <span class="bab-count">${babCards.length}</span>
        <span class="bab-expand ${filterExpandedBab.has(bab)?'open':''}">▾</span>
      </div>
      <div class="group-list ${filterExpandedBab.has(bab)?'open':''}">${groupHtml}</div>
    `;
    babList.appendChild(item);
  }

  babList.querySelectorAll('.bab-row').forEach(row=>{
    row.addEventListener('click', (e)=>{
      const bab = parseInt(row.dataset.bab,10);
      toggleBabCb(bab);
    });
  });
  babList.querySelectorAll('.bab-expand').forEach(exp=>{
    exp.addEventListener('click', (e)=>{
      e.stopPropagation();
      const bab = parseInt(exp.closest('.bab-row').dataset.bab,10);
      if(filterExpandedBab.has(bab)) filterExpandedBab.delete(bab);
      else filterExpandedBab.add(bab);
      renderFilterScreen(modeLabel, toggleBabCb, toggleGroupCb);
    });
  });
  babList.querySelectorAll('.group-item').forEach(gi=>{
    gi.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleGroupCb(gi.dataset.gkey, parseInt(gi.dataset.bab,10));
    });
  });

  updateFilterSelCount();
}

export function updateFilterSelCount(){
  const cards = getFilteredCards();
  document.getElementById('filterSelCount').textContent = `${cards.length} kartu dipilih`;
}

export function renderFlashcard(){
  const card = session.queue[session.idx];
  const flashcard = document.getElementById('flashcard');
  const flashcardInner = document.getElementById('flashcardInner');
  const answerRow = document.getElementById('answerRow');

  flashcardInner.style.transition = 'none';
  flashcard.classList.remove('flipped');
  session.flipped = false;

  answerRow.style.transition = 'none';
  answerRow.classList.remove('show');

  void flashcardInner.offsetWidth;
  void answerRow.offsetWidth;

  flashcardInner.style.transition = '';
  answerRow.style.transition = '';

  const kanjiEl = document.getElementById('cardKanjiMain');
  kanjiEl.innerHTML = renderFurigana(card, settings.furigana);

  const textLen = card.kanji ? card.kanji.length : 0;
  if (textLen >= 9) {
    kanjiEl.style.fontSize = '24px';
  } else if (textLen >= 6) {
    kanjiEl.style.fontSize = '34px';
  } else if (textLen >= 4) {
    kanjiEl.style.fontSize = '42px';
  } else {
    kanjiEl.style.fontSize = '52px';
  }

  document.getElementById('cardFrontHint').textContent = 'Tap kartu untuk buka jawaban';
  document.getElementById('cardKanaBack').textContent = settings.romaji ? toRomaji(card.kana) : card.kana;
  document.getElementById('cardArtiBack').textContent = card.arti;
  document.getElementById('cardGroupBack').textContent = titleCase(card.group || '');

  const st = getCardState(card.id);

  // Predict next intervals using FSRS
  const now = new Date();
  const nextStates = f.repeat(st, now);

  const againDiff = nextStates[Rating.Again].card.due.getTime() - now.getTime();
  const hardDiff = nextStates[Rating.Hard].card.due.getTime() - now.getTime();
  const goodDiff = nextStates[Rating.Good].card.due.getTime() - now.getTime();
  const easyDiff = nextStates[Rating.Easy].card.due.getTime() - now.getTime();

  document.getElementById('lblAgain').textContent = formatTimeDiff(againDiff);
  document.getElementById('lblHard').textContent = formatTimeDiff(hardDiff);
  document.getElementById('lblGood').textContent = formatTimeDiff(goodDiff);
  document.getElementById('lblEasy').textContent = formatTimeDiff(easyDiff);

  document.getElementById('tapHint').style.display = 'flex';

  const pct = Math.round((session.idx / session.queue.length) * 100);
  document.getElementById('studyProgress').style.width = pct + '%';
  document.getElementById('studyCount').textContent = `${session.idx+1}/${session.queue.length}`;

  const undoBtn = document.getElementById('studyUndo');
  const canUndo = session.lastAnswer && session.lastAnswer.idx === session.idx - 1;
  undoBtn.style.opacity = canUndo ? '1' : '0.35';
  undoBtn.style.pointerEvents = canUndo ? 'auto' : 'none';
}

export function renderBoxRing(elId, box){
  const el = document.getElementById(elId);
  const maxBox = 5;
  const pct = Math.min(box / maxBox, 1);
  const r = 12, circ = 2*Math.PI*r;
  const offset = circ * (1-pct);
  const color = box===0 ? 'var(--text-lo)' : box<3 ? 'var(--shu-bright)' : box<5 ? 'var(--kin)' : 'var(--matcha-bright)';
  el.innerHTML = `<svg width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="${r}" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="3"/>
    <circle cx="15" cy="15" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 15 15)"/>
    <text x="15" y="19" text-anchor="middle" font-size="9" font-family="monospace" fill="${color}" font-weight="700">${box}</text>
  </svg>`;
}

export function flipCard(){
  if(session.mode !== 'flashcard') return;
  const flashcard = document.getElementById('flashcard');
  session.flipped = !session.flipped;
  flashcard.classList.toggle('flipped', session.flipped);
  document.getElementById('tapHint').style.display = session.flipped ? 'none' : 'flex';
  if(session.flipped){
    document.getElementById('answerRow').classList.add('show');
  } else {
    document.getElementById('answerRow').classList.remove('show');
  }
}

export function renderQuizKanji(handleQuizAnswerCb){
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

  // Import buildKanaDistractors dynamically or passed as argument since it's in modes.js
}

import { State } from './config.js';

export function renderStats(showResetModalCb){
  const el = document.getElementById('statsContent');
  let stNew=0, stLearning=0, stReview=0, stRelearning=0, totalSeen=0, totalCorrect=0, totalWrong=0;
  for(const c of ALL_CARDS){
    const st = srsState[c.id];
    if(!st){ stNew++; continue; }

    if(st.state === State.New) stNew++;
    else if(st.state === State.Learning) stLearning++;
    else if(st.state === State.Review) stReview++;
    else if(st.state === State.Relearning) stRelearning++;

    totalSeen += st.seen||0;
    totalCorrect += st.correct||0;
    totalWrong += st.wrong||0;
  }
  const learned = stLearning + stReview + stRelearning;
  const acc = (totalCorrect+totalWrong)>0 ? Math.round(totalCorrect/(totalCorrect+totalWrong)*100) : 0;
  const streak = peekStreak();

  el.innerHTML = `
    <div class="hero-card" style="margin-top:10px;">
      <div class="hero-eyebrow"><span class="dot"></span> RINGKASAN</div>
      <div class="stat-row">
        <div class="stat-chip streak"><div class="num">${streak.count}</div><div class="lbl">Streak Hari</div></div>
        <div class="stat-chip due"><div class="num">${acc}%</div><div class="lbl">Akurasi</div></div>
        <div class="stat-chip new"><div class="num">${learned}</div><div class="lbl">Kartu Disentuh</div></div>
      </div>
    </div>
    <div class="section-label">Status Memori FSRS</div>
    <div class="qsettings" style="padding:14px;">
      ${renderBoxBar('Baru (New)', stNew, META.total_cards || 0, 'var(--text-lo)')}
      ${renderBoxBar('Belajar (Learning)', stLearning, META.total_cards || 0, 'var(--shu-bright)')}
      ${renderBoxBar('Diingat (Review)', stReview, META.total_cards || 0, 'var(--matcha-bright)')}
      ${renderBoxBar('Lupa (Relearning)', stRelearning, META.total_cards || 0, 'var(--kin)')}
    </div>
    <div class="section-label">Per BAB</div>
    <div class="qsettings" style="padding:6px;">
      ${(META.babs || []).map(bab=>{
        const babCards = ALL_CARDS.filter(c=>c.bab===bab);
        const touched = babCards.filter(c=>srsState[c.id] && srsState[c.id].lastSeen).length;
        const pct = Math.round((touched/(babCards.length || 1))*100);
        return `<div class="qsettings-row">
          <div class="qs-label">Bab ${bab}<small>${touched}/${babCards.length} kartu disentuh</small></div>
          <div style="font-family:var(--mono); font-size:13px; color:var(--ai-glow); font-weight:700;">${pct}%</div>
        </div>`;
      }).join('')}
    </div>
  `;

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-ghost btn-block';
  resetBtn.style.cssText = 'margin-top: 24px; border-color: var(--shu); color: var(--shu-bright);';
  resetBtn.innerHTML = '⚡ Reset Progres Per-BAB';
  resetBtn.onclick = showResetModalCb;
  el.appendChild(resetBtn);
}
export function renderBoxBar(label, val, total, color){
  const pct = total>0 ? Math.round((val/total)*100) : 0;
  return `<div style="margin-bottom:12px;">
    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;">
      <span style="color:var(--text-mid)">${label}</span>
      <span style="font-family:var(--mono); color:${color}; font-weight:700;">${val}</span>
    </div>
    <div style="height:6px; background:var(--sumi-2); border-radius:6px; overflow:hidden;">
      <div style="height:100%; width:${pct}%; background:${color}; border-radius:6px; transition:width .5s ease;"></div>
    </div>
  </div>`;
}

export function showResetModal() {
  const select = document.getElementById('resetBabSelect');
  select.innerHTML = '<option value="ALL">💥 Reset SEMUA BAB (Bahaya!)</option>';

  const babsWithProgress = new Set();
  for(const c of ALL_CARDS) {
    if(srsState[c.id] && srsState[c.id].lastSeen) {
      babsWithProgress.add(c.bab);
    }
  }

  if(babsWithProgress.size === 0) {
    toast("Belum ada progres yang bisa direset.");
    return;
  }

  [...babsWithProgress].sort((a,b)=>a-b).forEach(bab => {
    const opt = document.createElement('option');
    opt.value = bab;
    opt.textContent = `Reset BAB ${bab}`;
    select.appendChild(opt);
  });

  document.getElementById('resetModalOverlay').classList.add('show');
}

export function closeResetModal() {
  document.getElementById('resetModalOverlay').classList.remove('show');
}
export function closeExitModal(){
  document.getElementById('exitModalOverlay').classList.remove('show');
}
