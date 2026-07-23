import { session, settings } from './state.js';
import { getCardState, saveState } from './storage.js';
import { f, Rating } from './config.js';
import { todayISO } from './utils.js';
import { advanceSession } from './modes.js';
import { loadKanjiVG, getKanjiPaths, DrawCanvas } from './canvas.js';

let drawCanvas = null;
let currentKanjiIndex = 0;
let kanjiList = [];
let wordFailed = false;

// Ensure we have kanji canvas loaded
function loadKanjiCanvasLib() {
  return new Promise((resolve) => {
    if (window.KanjiCanvas) return resolve();
    const s1 = document.createElement('script');
    s1.src = 'js/vendor/kanji-canvas.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'js/vendor/ref-patterns.js';
      s2.onload = resolve;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

export async function renderMenulis() {
  await Promise.all([loadKanjiVG(), loadKanjiCanvasLib()]);

  const card = session.queue[session.idx];
  session.answered = false;

  document.getElementById('menulisArti').textContent = card.arti;

  // Extract kanji characters from the word
  kanjiList = card.kanji.split('').filter(c => getKanjiPaths(c));
  if (kanjiList.length === 0) {
    // Edge case where we have no data for these kanji
    handleMenulisAnswer(false, card);
    return;
  }

  currentKanjiIndex = 0;
  wordFailed = false;

  setupCanvas();
  updateMenulisPrompt(card);
}

function updateMenulisPrompt(card) {
  const pct = Math.round((session.idx / session.queue.length) * 100);
  document.getElementById('menulisProgress').style.width = pct + '%';
  document.getElementById('menulisCount').textContent = `${session.idx+1}/${session.queue.length}`;

  let html = '';
  let kIdx = 0;
  for (let ch of card.kanji) {
    if (kanjiList.includes(ch)) {
      if (kIdx < currentKanjiIndex) {
        html += `<span style="color:var(--text);">${ch}</span>`;
      } else if (kIdx === currentKanjiIndex) {
        html += `<span style="color:var(--text); font-weight:bold;">[...]</span>`;
      } else {
        html += `<span style="opacity:0.3;">[...]</span>`;
      }
      kIdx++;
    } else {
      html += `<span style="color:inherit;">${ch}</span>`;
    }
  }
  document.getElementById('menulisKana').innerHTML = html;

  document.getElementById('btnMenulisDone').disabled = true;
  document.getElementById('menulisScore').textContent = `Target: ${kanjiList[currentKanjiIndex]}`;
}

function onStrokeComplete(strokeCount) {
  const targetKanji = kanjiList[currentKanjiIndex];
  const targetPaths = getKanjiPaths(targetKanji);
  if (!targetPaths) return;

  if (settings.drawGuided && strokeCount <= targetPaths.length) {
    // Show snapped path in Guided SVG background
    drawCanvas.guidedSvg.innerHTML = '';
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (let i = 0; i < strokeCount; i++) {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', targetPaths[i]);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', '#ffffff');
      pathEl.setAttribute('stroke-width', '4');
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      group.appendChild(pathEl);
    }
    drawCanvas.guidedSvg.appendChild(group);
  }

  const strokes = drawCanvas.getStrokeData();
  let shapeScore = 0;
  let orderScore = 0;

  // Advanced order score logic (Index-by-index match)
  let matchedStrokes = 0;
  const maxIdx = Math.min(strokes.length, targetPaths.length);

  for (let i = 0; i < maxIdx; i++) {
    const userStroke = strokes[i];
    const targetSvg = targetPaths[i];

    // We do a simple directional and relational check:
    // 1. Calculate direction vector of user stroke
    const uDx = userStroke[userStroke.length-1][0] - userStroke[0][0];
    const uDy = userStroke[userStroke.length-1][1] - userStroke[0][1];
    const uLen = Math.sqrt(uDx*uDx + uDy*uDy) || 1;
    const uDirX = uDx / uLen;
    const uDirY = uDy / uLen;

    // 2. Parse basic direction of SVG path (naive but effective for order checking)
    const commands = targetSvg.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    let sx = 0, sy = 0, ex = 0, ey = 0;
    let hasStart = false;
    for (let cmd of commands) {
        let type = cmd[0];
        let args = cmd.slice(1).replace(/-/g, ' -').trim().split(/[ ,]+/).map(parseFloat).filter(n => !isNaN(n));
        if (args.length === 0) continue;

        if (type === 'M') { ex = args[0]; ey = args[1]; if (!hasStart) { sx = ex; sy = ey; hasStart = true; } }
        else if (type === 'm') { ex += args[0]; ey += args[1]; if (!hasStart) { sx = ex; sy = ey; hasStart = true; } }
        else if (type === 'L' || type === 'T') { ex = args[args.length-2]; ey = args[args.length-1]; }
        else if (type === 'l' || type === 't') { ex += args[args.length-2]; ey += args[args.length-1]; }
        else if (type === 'H') { ex = args[0]; }
        else if (type === 'h') { ex += args[0]; }
        else if (type === 'V') { ey = args[0]; }
        else if (type === 'v') { ey += args[0]; }
        else if (type === 'C') { ex = args[args.length-2]; ey = args[args.length-1]; }
        else if (type === 'c') { ex += args[args.length-2]; ey += args[args.length-1]; }
        else if (type === 'S' || type === 'Q') { ex = args[args.length-2]; ey = args[args.length-1]; }
        else if (type === 's' || type === 'q') { ex += args[args.length-2]; ey += args[args.length-1]; }
    }

    const tDx = ex - sx;
    const tDy = ey - sy;
    const tLen = Math.sqrt(tDx*tDx + tDy*tDy) || 1;
    const tDirX = tDx / tLen;
    const tDirY = tDy / tLen;

    // Dot product to check if directions align
    const dot = (uDirX * tDirX) + (uDirY * tDirY);
    if (dot > 0.5) {
      matchedStrokes++;
    }
  }

  orderScore = Math.round((matchedStrokes / targetPaths.length) * 100);
  if (strokes.length > targetPaths.length) {
    orderScore -= (strokes.length - targetPaths.length) * 5; // Penalty for extra strokes
  }
  orderScore = Math.max(0, Math.min(100, orderScore));

  // shape score from kanjicanvas
  if (window.KanjiCanvas) {
    try {
      const result = window.KanjiCanvas.recognize(strokes);
      if (result && result.length > 0) {
        const idx = result.findIndex(r => r === targetKanji);
        if (idx !== -1) {
          shapeScore = 100 - (idx * 5); // 1st = 100, 2nd = 95, etc.
        }
      }
    } catch(e) {}
  }

  // simple fallback if shapeScore is 0 but we drew correct number of strokes
  if (shapeScore === 0 && orderScore > 80) shapeScore = 50;

  const finalScore = Math.round((shapeScore + orderScore) / 2);
  document.getElementById('menulisScore').textContent = `Shape: ${shapeScore}% | Order: ${orderScore}% | Skor: ${finalScore}%`;

  if (finalScore >= 68) {
    document.getElementById('btnMenulisDone').disabled = false;
  }
}

function setupCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const hintSvg = document.getElementById('canvasHint');
  const guidedSvg = document.getElementById('canvasGuided');

  if (drawCanvas) {
    drawCanvas.clear();
    guidedSvg.innerHTML = '';
  } else {
    drawCanvas = new DrawCanvas(canvas, hintSvg, guidedSvg, onStrokeComplete);

    // Bind buttons
    document.getElementById('btnMenulisClear').onclick = () => {
      drawCanvas.clear();
      guidedSvg.innerHTML = '';
      document.getElementById('btnMenulisDone').disabled = true;
      document.getElementById('menulisScore').textContent = `Target: ${kanjiList[currentKanjiIndex]}`;
    };

    let hintTimer = null;
    const btnHint = document.getElementById('btnMenulisHint');

    const showHint = (hold) => {
      const paths = getKanjiPaths(kanjiList[currentKanjiIndex]);
      if (!paths) return;
      if (hold) {
        drawCanvas.playAnimation(paths);
      } else {
        drawCanvas.showHint(paths, 1500);
      }
    };

    btnHint.onmousedown = btnHint.ontouchstart = (e) => {
      e.preventDefault();
      hintTimer = setTimeout(() => {
        hintTimer = null;
        showHint(true);
      }, 500);
    };
    btnHint.onmouseup = btnHint.ontouchend = (e) => {
      e.preventDefault();
      if (hintTimer) {
        clearTimeout(hintTimer);
        showHint(false);
      }
    };

    document.getElementById('btnMenulisSkip').onclick = () => {
      drawCanvas.playAnimation(getKanjiPaths(kanjiList[currentKanjiIndex]), () => {
        handleKanjiDone(false);
      });
    };

    document.getElementById('btnMenulisDone').onclick = () => {
      handleKanjiDone(true);
    };
  }
}

function handleKanjiDone(isCorrect) {
  if (!isCorrect) {
    wordFailed = true;
  }

  // Check if we have more kanji
  currentKanjiIndex++;
  if (currentKanjiIndex < kanjiList.length) {
    drawCanvas.clear();
    const card = session.queue[session.idx];
    updateMenulisPrompt(card);
  } else {
    const card = session.queue[session.idx];
    drawCanvas.clear();
    handleMenulisAnswer(!wordFailed, card);
  }
}

function handleMenulisAnswer(isCorrect, card) {
  if(session.answered) return;
  session.answered = true;

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
    rating = Rating.Again; // Skip or failed
  }

  const nextStates = f.repeat(st, new Date());
  const logItem = nextStates[rating];

  Object.assign(st, logItem.card);
  saveState();

  setTimeout(()=>{
    advanceSession();
  }, 400);
}
