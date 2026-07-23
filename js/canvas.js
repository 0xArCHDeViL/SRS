import { settings } from './state.js';

let kanjiVgData = null;
let strokeData = []; // To store user's raw strokes
let currentPath = null;
let isDrawing = false;
let targetChar = '';
let targetPaths = [];
let completionCallback = null;

const CANVAS_SIZE = 300;
let ctxDraw, ctxGuide;

// Try to fetch kanjivg.json dynamically
export async function loadKanjiVgData() {
  if (kanjiVgData) return;
  try {
    const res = await fetch('database/kanjivg/kanjivg.json');
    kanjiVgData = await res.json();
    console.log("KanjiVG loaded:", Object.keys(kanjiVgData).length);
  } catch(e) {
    console.error("Failed to load KanjiVG data", e);
  }
}

export function setCanvasCompleteCallback(cb) {
  completionCallback = cb;
}

export async function initCanvasForKanji(char) {
  if (!kanjiVgData) await loadKanjiVgData();

  targetChar = char;
  targetPaths = kanjiVgData[char] || [];
  strokeData = [];

  const dcv = document.getElementById('drawingCanvas');
  const gcv = document.getElementById('guideCanvas');
  ctxDraw = dcv.getContext('2d', { willReadFrequently: true });
  ctxGuide = gcv.getContext('2d');

  // High DPI scaling support
  const scale = window.devicePixelRatio || 1;
  dcv.width = CANVAS_SIZE * scale;
  dcv.height = CANVAS_SIZE * scale;
  dcv.style.width = CANVAS_SIZE + 'px';
  dcv.style.height = CANVAS_SIZE + 'px';
  gcv.width = CANVAS_SIZE * scale;
  gcv.height = CANVAS_SIZE * scale;
  gcv.style.width = CANVAS_SIZE + 'px';
  gcv.style.height = CANVAS_SIZE + 'px';
  ctxDraw.scale(scale, scale);
  ctxGuide.scale(scale, scale);

  clearCanvas();
  renderGrid(settings.gridLines || 2);


  // Set up events
  dcv.onpointerdown = handlePointerDown;
  dcv.onpointermove = handlePointerMove;
  dcv.onpointerup = handlePointerUp;
  dcv.onpointercancel = handlePointerUp;
  dcv.onpointerout = handlePointerUp;

  document.getElementById('canvasClear').onclick = clearCanvas;

  const hintBtn = document.getElementById('canvasHint');
  hintBtn.onpointerdown = handleHintStart;
  hintBtn.onpointerup = handleHintEnd;
  hintBtn.onpointercancel = handleHintEnd;
  hintBtn.onpointerleave = handleHintEnd;

  document.getElementById('canvasSkip').onclick = handleSkip;
  document.getElementById('canvasSelesai').onclick = handleSelesai;
  document.getElementById('canvasSelesai').disabled = true;

  updateScores();
}

function clearCanvas() {
  ctxDraw.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctxGuide.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  strokeData = [];
  updateScores();
}

// Draw logic
function handlePointerDown(e) {
  isDrawing = true;
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  currentPath = [{x, y}];

  ctxDraw.beginPath();
  ctxDraw.moveTo(x, y);
  ctxDraw.lineCap = 'round';
  ctxDraw.lineJoin = 'round';
  ctxDraw.lineWidth = 6;
  ctxDraw.strokeStyle = 'white';
}

function handlePointerMove(e) {
  if (!isDrawing) return;
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  currentPath.push({x, y});

  ctxDraw.lineTo(x, y);
  ctxDraw.stroke();
}

function handlePointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentPath.length > 2) {
    strokeData.push(currentPath);
    if (settings.guidedDrawing) {
      applySnapToStroke(strokeData.length - 1);
    }
    updateScores();
  }
}

// Geometric distance based snap for Guided mode
function applySnapToStroke(strokeIndex) {
  if (strokeIndex >= targetPaths.length) return; // Out of bounds of correct kanji stroke count

  // We can draw the SVG path corresponding to the target stroke
  const pathD = targetPaths[strokeIndex];

  // Render over the rough stroke
  redrawCanvas();
}

function redrawCanvas() {
  ctxDraw.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctxDraw.lineCap = 'round';
  ctxDraw.lineJoin = 'round';
  ctxDraw.lineWidth = 6;

  for (let i = 0; i < strokeData.length; i++) {
    if (settings.guidedDrawing && i < targetPaths.length) {
      // Draw KanjiVG path instead
      const p = new Path2D(targetPaths[i]);
      // The KanjiVG data is originally 109x109, we must scale it to 300x300.
      ctxDraw.save();
      ctxDraw.scale(CANVAS_SIZE / 109, CANVAS_SIZE / 109);
      ctxDraw.strokeStyle = 'white';
      ctxDraw.stroke(p);
      ctxDraw.restore();
    } else {
      // Draw raw user path
      const pts = strokeData[i];
      if(pts.length===0) continue;
      ctxDraw.beginPath();
      ctxDraw.moveTo(pts[0].x, pts[0].y);
      for(let j=1; j<pts.length; j++) {
        ctxDraw.lineTo(pts[j].x, pts[j].y);
      }
      ctxDraw.strokeStyle = 'white';
      ctxDraw.stroke();
    }
  }
}

// Sub-scores
function updateScores() {
  if (strokeData.length === 0) {
    document.getElementById('scoreShape').textContent = '0';
    document.getElementById('scoreOrder').textContent = '0';
    document.getElementById('canvasSelesai').disabled = true;
    return;
  }

  // Calculate Order Score by matching index by index starting points
  // We approximate the start point of targetPath by picking its M x,y
  let orderScore = 0;
  let correctOrders = 0;
  for (let i = 0; i < Math.min(strokeData.length, targetPaths.length); i++) {
    const rawStroke = strokeData[i];
    const targetPathStr = targetPaths[i];

    if (rawStroke.length > 0 && targetPathStr) {
       let mMatch = targetPathStr.match(/M([\d\.\-]+),([\d\.\-]+)/);
       if (mMatch) {
          // Scale from 109 to CANVAS_SIZE
          let tx = parseFloat(mMatch[1]) * (CANVAS_SIZE / 109);
          let ty = parseFloat(mMatch[2]) * (CANVAS_SIZE / 109);

          let sx = rawStroke[0].x;
          let sy = rawStroke[0].y;

          // distance threshold for starting point to match roughly
          let dist = Math.sqrt(Math.pow(tx - sx, 2) + Math.pow(ty - sy, 2));
          if (dist < 40) {
              correctOrders++;
          }
       }
    }
  }
  orderScore = targetPaths.length ? Math.round((correctOrders / targetPaths.length) * 100) : 0;


  // Calculate Shape Score
  // Since KanjiCanvas.recognize() might be too heavy to run *every* stroke, we'll do a simple heuristic
  // combined with recognize() if possible. KanjiCanvas is loaded globally as KanjiCanvas.
  let shapeScore = 0;

  // Custom simple shape matching using stroke data geometric bounds if KanjiCanvas is not perfectly matching
  let overlapScore = targetPaths.length ? Math.max(0, 100 - Math.abs(strokeData.length - targetPaths.length) * 40) : 0;

  if (typeof window.KanjiCanvas !== 'undefined' && window.KanjiCanvas.refPatterns) {
    // We can use the exposed feature extraction from KanjiCanvas
    try {
       // KanjiCanvas normally relies on its own "recordedPattern_..." logic.
       // It expects data in [ [ [x,y],[x,y] ], [ [x,y],[x,y] ] ] format, which strokeData exactly is!
       // But we need to normalize to 256x256 first.

       let scaleRatio = 256 / CANVAS_SIZE;
       let normalizedStrokes = strokeData.map(stroke => stroke.map(pt => [pt.x * scaleRatio, pt.y * scaleRatio]));

       // Use KanjiCanvas's recognize function pipeline manually if it doesn't crash
       // momentNormalize is hardcoded to use KanjiCanvas.recordedPattern_[id].
       // We can inject our pattern directly if we want to use its matcher:
       const tempId = "tempCanvasID";
       KanjiCanvas["recordedPattern_" + tempId] = normalizedStrokes;

       if (KanjiCanvas.momentNormalize && KanjiCanvas.extractFeatures) {
           let norm = KanjiCanvas.momentNormalize(tempId);
           let features = KanjiCanvas.extractFeatures(norm, 20);

           // We can get coarse classifications if we want, or just get exact distance for our targetChar.
           // Since we KNOW the target character, we just need to find it in refPatterns and calculate distance.
           let targetPattern = KanjiCanvas.refPatterns.find(p => p[0] === targetChar);
           if (targetPattern) {
               let rMap = KanjiCanvas.getMap(features, targetPattern[2], KanjiCanvas.endPointDistance);
               rMap = KanjiCanvas.completeMap(features, targetPattern[2], KanjiCanvas.endPointDistance, rMap);
               let dist = KanjiCanvas.computeDistance(targetPattern[2], features, KanjiCanvas.endPointDistance, rMap);

               // dist is lower when shape matches. Max is around 3000-5000.
               let mappedScore = Math.max(0, 100 - (dist / 150));
               overlapScore = mappedScore; // prioritize precise kanjicanvas dist over naive overlap
           }
       }
    } catch (e) {
       console.warn("KanjiCanvas extraction failed, fallback to basic score", e);
    }
  }

  shapeScore = Math.min(100, Math.max(0, overlapScore));

  orderScore = Math.max(0, orderScore);
  shapeScore = Math.max(0, shapeScore);

  const finalScore = (orderScore + shapeScore) / 2;

  document.getElementById('scoreShape').textContent = shapeScore;
  document.getElementById('scoreOrder').textContent = orderScore;

  if (finalScore >= 68 && strokeData.length === targetPaths.length) {
    document.getElementById('canvasSelesai').disabled = false;
  } else {
    document.getElementById('canvasSelesai').disabled = true;
  }
}

// Hint system
let hintTimer = null;
let isLongPress = false;
let animationRef = null;

function handleHintStart(e) {
  isLongPress = false;
  hintTimer = setTimeout(() => {
    isLongPress = true;
    playStrokeAnimation();
  }, 400); // 400ms hold triggers animation
}

function handleHintEnd(e) {
  clearTimeout(hintTimer);
  if (!isLongPress) {
    showStaticHint();
  } else {
    // Release after long press - stop animation? The prompt says "Begitu animasi selesai... keduanya hilang".
    // We will let the animation finish.
  }
}

function showStaticHint() {
  drawTargetShadow();
  setTimeout(() => {
    ctxGuide.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, 1500);
}

function drawTargetShadow() {
  ctxGuide.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctxGuide.save();
  ctxGuide.scale(CANVAS_SIZE / 109, CANVAS_SIZE / 109);
  ctxGuide.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctxGuide.lineWidth = 6;
  ctxGuide.lineCap = 'round';
  ctxGuide.lineJoin = 'round';
  for (let path of targetPaths) {
    ctxGuide.stroke(new Path2D(path));
  }
  ctxGuide.restore();
}

function playStrokeAnimation() {
  drawTargetShadow();
  let strokeIdx = 0;
  let progress = 0;

  // Real animation requires parsing SVG lengths.
  // For a simpler animation: show stroke by stroke sequentially
  ctxGuide.save();
  ctxGuide.scale(CANVAS_SIZE / 109, CANVAS_SIZE / 109);
  ctxGuide.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctxGuide.lineWidth = 6;
  ctxGuide.lineCap = 'round';
  ctxGuide.lineJoin = 'round';

  function step() {
    if (strokeIdx >= targetPaths.length) {
      ctxGuide.restore();
      setTimeout(() => {
        ctxGuide.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      }, 500); // Disappear after complete
      return;
    }

    ctxGuide.stroke(new Path2D(targetPaths[strokeIdx]));
    strokeIdx++;
    animationRef = setTimeout(step, 400); // Next stroke after 400ms
  }

  step();
}

function renderGrid(lines) {
  const svg = document.getElementById('canvasGridOverlay');
  svg.innerHTML = '';
  if (lines <= 0) return;

  let spacing = CANVAS_SIZE / lines;
  for (let i = 1; i < lines; i++) {
     let pos = i * spacing;
     svg.innerHTML += `<line x1="${pos}" y1="0" x2="${pos}" y2="${CANVAS_SIZE}" stroke="var(--sumi-4)" stroke-width="2" stroke-dasharray="4" />`;
     svg.innerHTML += `<line x1="0" y1="${pos}" x2="${CANVAS_SIZE}" y2="${pos}" stroke="var(--sumi-4)" stroke-width="2" stroke-dasharray="4" />`;
  }
}

function handleSkip() {
  // Animate remaining and close as skip
  document.getElementById('canvasSkip').disabled = true;
  document.getElementById('canvasSelesai').disabled = true;
  document.getElementById('canvasBatal').disabled = true;
  document.getElementById('canvasHint').disabled = true;

  // Fast animation
  let strokeIdx = strokeData.length;
  function stepFast() {
    if (strokeIdx >= targetPaths.length) {
      setTimeout(() => {
        if (completionCallback) completionCallback(false, true); // (success, isSkip)
      }, 300);
      return;
    }

    // Draw missing stroke
    ctxDraw.save();
    ctxDraw.scale(CANVAS_SIZE / 109, CANVAS_SIZE / 109);
    ctxDraw.strokeStyle = 'white';
    ctxDraw.lineWidth = 6;
    ctxDraw.lineCap = 'round';
    ctxDraw.lineJoin = 'round';
    ctxDraw.stroke(new Path2D(targetPaths[strokeIdx]));
    ctxDraw.restore();

    strokeIdx++;
    setTimeout(stepFast, 100); // 100ms per missing stroke
  }
  stepFast();
}

function handleSelesai() {
  if (completionCallback) completionCallback(true, false);
}
