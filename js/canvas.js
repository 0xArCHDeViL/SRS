import { settings } from './state.js';

let kanjiVgData = null;
let strokeData = []; // To store user's raw strokes
let currentPath = null;
let isDrawing = false;
let targetChar = '';
let targetPaths = [];
let targetChar = '';
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
  targetChar = char;
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

  const NUM_POINTS = 20;
  let targetSamples = targetPaths.map(path => samplePathPoints(path, NUM_POINTS));

  for (let i = 0; i < strokeData.length; i++) {
    let pts = strokeData[i];
    if(pts.length === 0) continue;

    let snapped = false;

    if (settings.guidedDrawing) {
      // Find the closest target stroke to what was drawn
      let userSample = sampleRawStrokePoints(pts, NUM_POINTS);
      let bestDist = 9999;
      let bestIdx = -1;

      for (let j = 0; j < targetSamples.length; j++) {
        let distForward = 0;
        let distBackward = 0;
        for (let k = 0; k < NUM_POINTS; k++) {
          let dx = targetSamples[j][k].x - userSample[k].x;
          let dy = targetSamples[j][k].y - userSample[k].y;
          distForward += Math.sqrt(dx*dx + dy*dy);

          let dxRev = targetSamples[j][NUM_POINTS - 1 - k].x - userSample[k].x;
          let dyRev = targetSamples[j][NUM_POINTS - 1 - k].y - userSample[k].y;
          distBackward += Math.sqrt(dxRev*dxRev + dyRev*dyRev);
        }
        let minDist = Math.min(distForward/NUM_POINTS, distBackward/NUM_POINTS);
        if (minDist < bestDist) {
           bestDist = minDist;
           bestIdx = j;
        }
      }

      // Only snap if the stroke is vaguely close to some stroke (distance < 80)
      if (bestIdx !== -1 && bestDist < 80) {
        const p = new Path2D(targetPaths[bestIdx]);
        ctxDraw.save();
        ctxDraw.scale(CANVAS_SIZE / 109, CANVAS_SIZE / 109);
        ctxDraw.strokeStyle = 'white';
        ctxDraw.stroke(p);
        ctxDraw.restore();
        snapped = true;
      }
    }

    if (!snapped) {
      // Draw raw user path
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
  if (strokeData.length === 0 || targetPaths.length === 0) {
    document.getElementById('scoreShape').textContent = '0';
    document.getElementById('scoreOrder').textContent = '0';
    document.getElementById('canvasSelesai').disabled = true;
    return;
  }

  let totalShapeSum = 0;
  let correctOrders = 0;
  const NUM_POINTS = 20;
  const MAX_DIST = 60; // Max acceptable average pixel distance for points

  // Pre-sample all points
  let targetSamples = targetPaths.map(path => samplePathPoints(path, NUM_POINTS));
  let userSamples = strokeData.map(stroke => sampleRawStrokePoints(stroke, NUM_POINTS));

  // NORMALIZATION: Calculate bounding boxes for the overall target kanji and the user drawing
  function getBounds(samples) {
      let minX = 9999, minY = 9999, maxX = -9999, maxY = -9999;
      let hasPts = false;
      for (let s of samples) {
          for (let p of s) {
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
              hasPts = true;
          }
      }
      return hasPts ? {minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: minX + (maxX - minX)/2, cy: minY + (maxY - minY)/2} : null;
  }

  let tb = getBounds(targetSamples);
  let ub = getBounds(userSamples);

  if (tb && ub && ub.w > 0 && ub.h > 0) {
      let scaleX = tb.w / ub.w;
      let scaleY = tb.h / ub.h;
      let scale = Math.min(scaleX, scaleY);
      if (scale > 3) scale = 3; // Prevent insane scaling for dots
      if (scale < 0.3) scale = 0.3;

      userSamples = userSamples.map(s => s.map(p => ({
          x: tb.cx + (p.x - ub.cx) * scale,
          y: tb.cy + (p.y - ub.cy) * scale
      })));
  }

  // Distances matrix user i -> target j
  let allMatches = [];
  for (let i = 0; i < userSamples.length; i++) {
    for (let j = 0; j < targetSamples.length; j++) {
      let distForward = 0;
      let distBackward = 0;
      for (let k = 0; k < NUM_POINTS; k++) {
        let dx = targetSamples[j][k].x - userSamples[i][k].x;
        let dy = targetSamples[j][k].y - userSamples[i][k].y;
        distForward += Math.sqrt(dx*dx + dy*dy);

        let dxRev = targetSamples[j][NUM_POINTS - 1 - k].x - userSamples[i][k].x;
        let dyRev = targetSamples[j][NUM_POINTS - 1 - k].y - userSamples[i][k].y;
        distBackward += Math.sqrt(dxRev*dxRev + dyRev*dyRev);
      }
      distForward /= NUM_POINTS;
      distBackward /= NUM_POINTS;

      allMatches.push({
        i: i,
        j: j,
        bestDist: Math.min(distForward, distBackward),
        isForward: distForward <= distBackward + 15
      });
    }
  }

  // Greedy matching: flatten, sort by bestDist, assign
  allMatches.sort((a, b) => a.bestDist - b.bestDist);

  let assignedUser = new Set();
  let assignedTarget = new Set();

  for (let match of allMatches) {
     if (!assignedUser.has(match.i) && !assignedTarget.has(match.j)) {
         assignedUser.add(match.i);
         assignedTarget.add(match.j);

         // Calculate shape score for this match
         let strokeShapeScore = Math.max(0, 100 - (match.bestDist / MAX_DIST * 100));
         totalShapeSum += strokeShapeScore;

         // Order score is independent % of correctly ordered strokes
         if (strokeShapeScore > 30) {
            if (match.i === match.j && match.isForward) {
                correctOrders++;
            }
         }
     }
  }

  // 1. SHAPE SCORE (0-100) using KanjiCanvas.recognize()
  let shapeScore = 0;

  if (typeof KanjiCanvas !== 'undefined' && KanjiCanvas.recognize) {
      // KanjiCanvas expects array of paths where each path is an array of [x, y] coordinates
      let kcStrokeData = strokeData.map(stroke => stroke.map(pt => [pt.x, pt.y]));
      let result = KanjiCanvas.recognize(kcStrokeData);

      // If the target char is in the results, we give a score based on its position in candidates
      if (result && result.length > 0) {
          let foundIndex = result.indexOf(targetChar);
          if (foundIndex === 0) shapeScore = 100;
          else if (foundIndex === 1) shapeScore = 90;
          else if (foundIndex === 2) shapeScore = 80;
          else if (foundIndex === 3) shapeScore = 70;
          else if (foundIndex > 3 && foundIndex <= 10) shapeScore = 60;
      }
  }

  // Fallback to geometric if KanjiCanvas didn't find it or isn't loaded
  if (shapeScore === 0) {
      shapeScore = Math.round(totalShapeSum / targetPaths.length);
      let penalty = Math.abs(strokeData.length - targetPaths.length) * 20;
      shapeScore = Math.max(0, shapeScore - penalty);
  }

  // 2. ORDER SCORE (0-100) purely independent
  let orderScore = targetPaths.length > 0 ? Math.round((correctOrders / targetPaths.length) * 100) : 0;

  const finalScore = (orderScore + shapeScore) / 2;

    document.getElementById('scoreShape').textContent = shapeScore;
  document.getElementById('scoreOrder').textContent = orderScore;

  if (finalScore >= 68) {
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

// Utility to sample exactly NUM_POINTS evenly spaced from an SVG path string
function samplePathPoints(pathStr, numPoints) {
  // Use a temporary SVG path element to sample points precisely
  const ns = "http://www.w3.org/2000/svg";
  let pathEl = document.createElementNS(ns, "path");
  pathEl.setAttribute("d", pathStr);

  // Need to append to DOM to get getTotalLength() in some browsers, but let's try without first
  let svgEl = document.createElementNS(ns, "svg");
  svgEl.style.display = "none";
  svgEl.appendChild(pathEl);
  document.body.appendChild(svgEl);

  let len = pathEl.getTotalLength();
  let pts = [];
  for (let i = 0; i < numPoints; i++) {
    let pt = pathEl.getPointAtLength(len * (i / (numPoints - 1)));
    // Scale from 109x109 to CANVAS_SIZE
    pts.push({
      x: pt.x * (CANVAS_SIZE / 109),
      y: pt.y * (CANVAS_SIZE / 109)
    });
  }

  document.body.removeChild(svgEl);
  return pts;
}

// Utility to sample exactly NUM_POINTS evenly spaced from raw user stroke points
function sampleRawStrokePoints(rawPoints, numPoints) {
  if (rawPoints.length === 0) {
    return Array(numPoints).fill({x: 0, y: 0});
  }
  if (rawPoints.length === 1) {
    return Array(numPoints).fill({x: rawPoints[0].x, y: rawPoints[0].y});
  }

  let totalLength = 0;
  let distances = [0];
  for (let i = 1; i < rawPoints.length; i++) {
    let dx = rawPoints[i].x - rawPoints[i-1].x;
    let dy = rawPoints[i].y - rawPoints[i-1].y;
    let d = Math.sqrt(dx*dx + dy*dy);
    totalLength += d;
    distances.push(totalLength);
  }

  let pts = [];
  for (let i = 0; i < numPoints; i++) {
    let targetDist = totalLength * (i / (numPoints - 1));

    // Find the segment containing targetDist
    let idx = 1;
    while (idx < distances.length && distances[idx] < targetDist) {
      idx++;
    }

    if (idx >= distances.length) {
      pts.push({x: rawPoints[rawPoints.length - 1].x, y: rawPoints[rawPoints.length - 1].y});
      continue;
    }

    let distPrev = distances[idx - 1];
    let distNext = distances[idx];
    let segmentLen = distNext - distPrev;

    if (segmentLen === 0) {
      pts.push({x: rawPoints[idx].x, y: rawPoints[idx].y});
    } else {
      let t = (targetDist - distPrev) / segmentLen;
      let x = rawPoints[idx - 1].x + t * (rawPoints[idx].x - rawPoints[idx - 1].x);
      let y = rawPoints[idx - 1].y + t * (rawPoints[idx].y - rawPoints[idx - 1].y);
      pts.push({x, y});
    }
  }

  return pts;
}
