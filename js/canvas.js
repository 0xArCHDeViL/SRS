import { settings } from './state.js';

let kanjivgData = null;

// Fetch KanjiVG Data
export async function loadKanjiVG() {
  if (kanjivgData) return kanjivgData;
  try {
    const res = await fetch('database/kotoba/kanjivg.json');
    kanjivgData = await res.json();
    return kanjivgData;
  } catch(e) {
    console.error("Failed to load kanjivg.json", e);
    return {};
  }
}

export function getKanjiPaths(kanji) {
  if (!kanjivgData) return null;
  return kanjivgData[kanji];
}

export class DrawCanvas {
  constructor(canvasEl, hintSvgEl, guidedSvgEl, onStrokeComplete) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.hintSvg = hintSvgEl;
    this.guidedSvg = guidedSvgEl;
    this.onStrokeComplete = onStrokeComplete;
    this.isDrawing = false;
    this.currentStroke = [];
    this.allStrokes = []; // Array of arrays of {x,y}
    this.drawnPaths = []; // Offscreen or stored paths for rendering

    // Set internal resolution based on element size
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Bind events
    this.bindEvents();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.render();
  }

  bindEvents() {
    const start = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const pos = this.getPos(e);
      this.currentStroke = [pos];
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = this.getPos(e);
      this.currentStroke.push(pos);

      this.ctx.lineWidth = 4;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = 'white';
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    };

    const end = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      this.isDrawing = false;
      if (this.currentStroke.length > 2) {
        this.allStrokes.push(this.currentStroke);
        if (this.onStrokeComplete) this.onStrokeComplete(this.allStrokes.length);
      }
      this.currentStroke = [];
      this.render();
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    this.canvas.addEventListener('touchstart', start, {passive:false});
    this.canvas.addEventListener('touchmove', move, {passive:false});
    window.addEventListener('touchend', end);
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  clear() {
    this.allStrokes = [];
    this.drawnPaths = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hintSvg.innerHTML = '';
    if (this.guidedSvg) this.guidedSvg.innerHTML = '';
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = 'white';

    // Draw only the currently active stroke if guided mode is on (previous strokes are handled by SVG)
    if (settings.drawGuided) {
      if (this.currentStroke.length > 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
        for(let i=1; i<this.currentStroke.length; i++) {
          this.ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
        }
        this.ctx.stroke();
      }
    } else {
      this.allStrokes.forEach(stroke => {
        if(stroke.length === 0) return;
        this.ctx.beginPath();
        this.ctx.moveTo(stroke[0].x, stroke[0].y);
        for(let i=1; i<stroke.length; i++) {
          this.ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        this.ctx.stroke();
      });
      if (this.currentStroke.length > 0) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
        for(let i=1; i<this.currentStroke.length; i++) {
          this.ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
        }
        this.ctx.stroke();
      }
    }
  }

  showHint(paths, duration=1500) {
    this.hintSvg.innerHTML = '';
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Scale kanjivg paths (usually 109x109 box) to canvas box
    // The canvas SVG overlay viewBox is 0 0 109 109, so we don't need to scale the paths manually, just inject them.
    paths.forEach(p => {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', p);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', '#a0a0a0'); // Grayish hint
      pathEl.setAttribute('stroke-width', '3');
      group.appendChild(pathEl);
    });
    this.hintSvg.appendChild(group);

    if (duration > 0) {
      setTimeout(() => {
        this.hintSvg.innerHTML = '';
      }, duration);
    }
  }

  playAnimation(paths, onFinish) {
    // Show static shadow beneath the animation
    this.showHint(paths, 0); // 0 means don't auto-clear

    let i = 0;

    const drawNext = () => {
      if (i >= paths.length) {
        setTimeout(() => {
          this.hintSvg.innerHTML = '';
          if(onFinish) onFinish();
        }, 1000);
        return;
      }

      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', paths[i]);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', '#ffcc00'); // Yellowish animation
      pathEl.setAttribute('stroke-width', '4');

      // Animate stroke
      this.hintSvg.appendChild(pathEl);
      const len = pathEl.getTotalLength();
      pathEl.style.strokeDasharray = len;
      pathEl.style.strokeDashoffset = len;

      // Force reflow
      pathEl.getBoundingClientRect();

      pathEl.style.transition = 'stroke-dashoffset 0.4s ease-out';
      pathEl.style.strokeDashoffset = '0';

      i++;
      setTimeout(drawNext, 450);
    };

    drawNext();
  }

  // Returns data formatted for KanjiCanvas: array of strokes, each stroke is array of [x, y]
  getStrokeData() {
    return this.allStrokes.map(stroke => stroke.map(pt => [pt.x, pt.y]));
  }
}
