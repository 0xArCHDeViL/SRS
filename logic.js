/**
 * QUBIT SRS - Mobile Optimized Engine
 * Architecture: DOM Caching, O(n) Logic, Smart Re-queueing.
 */

// ==========================================
// 1. DATA MANIFEST
// ==========================================
const DATABASES = [
    { id: 'bab-1', path: './database/kotoba/bab-1.json', label: 'Bab 1' },
    { id: 'bab-2', path: './database/kotoba/bab-2.json', label: 'Bab 2' },
    { id: 'bab-3', path: './database/kotoba/bab-3.json', label: 'Bab 3' },
    { id: 'bab-4', path: './database/kotoba/bab-4.json', label: 'Bab 4' },
    { id: 'bab-5', path: './database/kotoba/bab-5.json', label: 'Bab 5' },
    { id: 'bab-6', path: './database/kotoba/bab-6.json', label: 'Bab 6' },
    { id: 'bab-7', path: './database/kotoba/bab-7.json', label: 'Bab 7' },
    { id: 'bab-8', path: './database/kotoba/bab-8.json', label: 'Bab 8' },
    { id: 'bab-9', path: './database/kotoba/bab-9.json', label: 'Bab 9' }
];

// ==========================================
// 2. DOM CACHING (Anti-Jank Requirement)
// ==========================================
const DOM = {};
function cacheDOM() {
    // Views
    ['dashboard', 'flashcard', 'quiz', 'complete'].forEach(v => DOM[`view_${v}`] = document.getElementById(`view-${v}`));
    
    // UI Elements
    DOM.deckGrid = document.getElementById('deck-grid');
    DOM.navDue = document.getElementById('nav-due-count');
    DOM.limitSelect = document.getElementById('setting-limit');
    
    // Flashcard
    DOM.fcArea = document.getElementById('fc-area');
    DOM.fcQ = document.getElementById('fc-q');
    DOM.fcKana = document.getElementById('fc-kana');
    DOM.fcA = document.getElementById('fc-a');
    DOM.fcTag = document.getElementById('fc-tag');
    DOM.fcProg = document.getElementById('fc-prog');
    DOM.fcPrio = document.getElementById('fc-prio');
    DOM.fcHint = document.getElementById('fc-hint');
    DOM.fcActions = document.getElementById('fc-actions');
    DOM.fcTHard = document.getElementById('fc-t-hard');
    DOM.fcTGood = document.getElementById('fc-t-good');
    DOM.fcTEasy = document.getElementById('fc-t-easy');

    // Quiz
    DOM.qzQ = document.getElementById('qz-q');
    DOM.qzQSub = document.getElementById('qz-q-sub');
    DOM.qzTag = document.getElementById('qz-tag');
    DOM.qzProg = document.getElementById('qz-prog');
    DOM.qzPrio = document.getElementById('qz-prio');
    DOM.qzOpts = document.getElementById('qz-opts');
    DOM.qzNextZone = document.getElementById('qz-next-zone');
}

// ==========================================
// 3. STORAGE & STATE
// ==========================================
const DB_KEY = 'qubit_mobile_srs';
const Storage = {
    load: () => JSON.parse(localStorage.getItem(DB_KEY) || '{}'),
    save: (data) => localStorage.setItem(DB_KEY, JSON.stringify(data)),
    getStats: (id) => Storage.load()[id] || { ease: 2.5, interval: 0, nextReview: 0, priorityScore: 0 },
    update: (id, stats) => { const d = Storage.load(); d[id] = stats; Storage.save(d); },
    getDue: () => {
        const d = Storage.load(), now = Date.now();
        let c = 0; for (let k in d) { if (d[k].nextReview <= now) c++; }
        return c;
    },
    wipe: () => { if (confirm("Hapus total data?")) { localStorage.removeItem(DB_KEY); location.reload(); } }
};

const state = {
    mode: 'flashcard', // flashcard | quiz
    dir: 'forward',    // forward | reverse
    limit: 20,
    decks: new Set(),
    pool: [],
    queue: [],
    idx: 0,
    curr: null,
    qzAnswered: false,
    qzGrade: 2
};

// ==========================================
// 4. UTILS & ALGORITHMS
// ==========================================
// Fisher-Yates Shuffle O(n)
function shuffle(arr) {
    let m = arr.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);
        t = arr[m]; arr[m] = arr[i]; arr[i] = t;
    }
    return arr;
}

function calcInterval(quality, hist) {
    let { ease = 2.5, interval = 0, priorityScore = 0 } = hist;
    const MIN = 60000, HR = 60 * MIN, DAY = 24 * HR;

    if (quality === 0) {
        priorityScore += 15; // Penalize & Prioritize
        ease = Math.max(1.3, ease - 0.2);
        interval = MIN;
    } else if (quality === 1) {
        priorityScore = Math.max(0, priorityScore - 2);
        ease = Math.max(1.3, ease - 0.15);
        interval = interval === 0 ? 10 * MIN : interval * 1.2;
    } else if (quality === 2) {
        priorityScore = 0;
        interval = interval === 0 ? 1 * HR : interval * ease;
    } else {
        priorityScore = 0;
        ease += 0.15;
        interval = interval === 0 ? 1 * DAY : interval * ease * 1.3;
    }
    return { ease, interval, priorityScore, nextReview: Date.now() + interval };
}

function timeStr(ms) {
    if (ms < 3600000) return Math.round(ms/60000) + 'm';
    if (ms < 86400000) return Math.round(ms/3600000) + 'j';
    return Math.round(ms/86400000) + 'h';
}

// ==========================================
// 5. ENGINE LOGIC
// ==========================================
const app = {
    init: function() {
        cacheDOM();
        this.renderDecks();
        this.updateBadge();
        this.attachEvents();
    },

    attachEvents: function() {
        // Toggle Settings
        document.querySelectorAll('.setting-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const type = btn.dataset.type; // mode or direction
                const val = btn.dataset.val;
                
                document.querySelectorAll(`.setting-btn[data-type="${type}"]`).forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                state[type === 'direction' ? 'dir' : 'mode'] = val;
            });
        });

        // Limit Select
        DOM.limitSelect.addEventListener('change', (e) => state.limit = e.target.value);

        // Core Buttons
        document.getElementById('btn-select-all').addEventListener('click', () => {
            document.querySelectorAll('.deck-btn').forEach(b => {
                if(!state.decks.has(b.dataset.id)) b.click();
            });
        });
        document.getElementById('btn-wipe').addEventListener('click', Storage.wipe);
        document.getElementById('btn-start').addEventListener('click', () => this.start());
        
        // Return Home
        document.querySelectorAll('.btn-home').forEach(b => b.addEventListener('click', () => this.goHome()));

        // Flashcard Events
        DOM.fcArea.addEventListener('click', () => this.flipFC());
        document.querySelectorAll('.grade-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation(); // Cegah propagasi flip
                this.grade(parseInt(b.dataset.q), 'flashcard');
            });
        });

        // Quiz Event Delegation (High Performance)
        DOM.qzOpts.addEventListener('click', (e) => {
            const btn = e.target.closest('.quiz-opt');
            if(!btn || state.qzAnswered) return;
            this.handleQuizOpt(btn);
        });

        document.getElementById('btn-quiz-next').addEventListener('click', () => this.grade(state.qzGrade, 'quiz'));
    },

    renderDecks: function() {
        // Batching DOM updates dengan DocumentFragment
        const frag = document.createDocumentFragment();
        DATABASES.forEach(db => {
            const btn = document.createElement('div');
            btn.className = "deck-btn relative p-4 rounded-xl border border-border bg-card text-left transition-colors active:scale-95";
            btn.dataset.id = db.id;
            btn.innerHTML = `
                <div class="check-badge absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground opacity-0 scale-50 transition-all">
                    <i data-lucide="check" class="w-3 h-3"></i>
                </div>
                <h4 class="font-bold text-sm text-primary">${db.label}</h4>
            `;
            
            btn.addEventListener('click', () => {
                if(state.decks.has(db.id)) {
                    state.decks.delete(db.id);
                    btn.classList.remove('border-primary', 'bg-primary/5');
                    btn.querySelector('.check-badge').classList.add('opacity-0', 'scale-50');
                } else {
                    state.decks.add(db.id);
                    btn.classList.add('border-primary', 'bg-primary/5');
                    btn.querySelector('.check-badge').classList.remove('opacity-0', 'scale-50');
                }
            });
            frag.appendChild(btn);
        });
        DOM.deckGrid.appendChild(frag);
        lucide.createIcons();
    },

    updateBadge: function() {
        DOM.navDue.textContent = Storage.getDue();
    },

    switchView: function(v) {
        ['dashboard', 'flashcard', 'quiz', 'complete'].forEach(id => {
            DOM[`view_${id}`].classList.add('hidden');
            DOM[`view_${id}`].classList.remove('flex');
        });
        DOM[`view_${v}`].classList.remove('hidden');
        if(v !== 'dashboard') DOM[`view_${v}`].classList.add('flex');
    },

    goHome: function() {
        this.switchView('dashboard');
        this.updateBadge();
    },

    start: async function() {
        if (state.decks.size === 0) return alert("Pilih minimal 1 pangkalan data.");

        try {
            state.pool = [];
            const fetches = Array.from(state.decks).map(id => fetch(DATABASES.find(d => d.id === id).path).then(r => r.json()));
            const dataArrays = await Promise.all(fetches);
            dataArrays.forEach(arr => state.pool.push(...arr));

            const NOW = Date.now();
            let dueCards = state.pool.map(c => ({...c, _h: Storage.getStats(c.id)}))
                                     .filter(c => c._h.nextReview <= NOW);

            // Sorting: Priority > Timestamp
            dueCards.sort((a, b) => b._h.priorityScore !== a._h.priorityScore ? 
                                    b._h.priorityScore - a._h.priorityScore : 
                                    a._h.nextReview - b._h.nextReview);

            if (state.limit !== 'all') dueCards = dueCards.slice(0, parseInt(state.limit));

            state.queue = dueCards;
            state.idx = 0;

            if (state.queue.length === 0) return this.switchView('complete');

            state.mode === 'flashcard' ? this.loadFC() : this.loadQZ();

        } catch (e) {
            alert("Error: Gagal memuat JSON. Gunakan Live Server.");
        }
    },

    // --- FLASHCARD LOGIC ---
    loadFC: function() {
        if (state.idx >= state.queue.length) return this.switchView('complete');

        const c = state.curr = state.queue[state.idx];
        const isRev = state.dir === 'reverse';

        // DOM Updates
        DOM.fcQ.textContent = isRev ? c.arti : c.kanji;
        DOM.fcKana.textContent = isRev ? c.kana : (c.kana || c.kanji);
        DOM.fcA.textContent = isRev ? c.kanji : c.arti;
        DOM.fcTag.textContent = c.tags.filter(t => !t.toLowerCase().includes('bab'))[0] || 'VOCAB';
        DOM.fcProg.textContent = `${state.idx + 1}/${state.queue.length}`;
        
        DOM.fcPrio.style.display = c._h.priorityScore > 0 ? 'flex' : 'none';
        DOM.fcPrio.innerHTML = `<i data-lucide="flame" class="w-3 h-3"></i> Prio (${c._h.priorityScore})`;

        DOM.fcTHard.textContent = timeStr(calcInterval(1, c._h).interval);
        DOM.fcTGood.textContent = timeStr(calcInterval(2, c._h).interval);
        DOM.fcTEasy.textContent = timeStr(calcInterval(3, c._h).interval);

        // Reset Visuals
        DOM.fcArea.classList.remove('is-flipped');
        DOM.fcHint.classList.remove('hidden');
        DOM.fcActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
        
        this.switchView('flashcard');
        lucide.createIcons();
    },

    flipFC: function() {
        if (DOM.fcArea.classList.contains('is-flipped')) return;
        DOM.fcArea.classList.add('is-flipped');
        DOM.fcHint.classList.add('hidden');
        DOM.fcActions.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
    },

    // --- QUIZ LOGIC ---
    loadQZ: function() {
        if (state.idx >= state.queue.length) return this.switchView('complete');

        const c = state.curr = state.queue[state.idx];
        const isRev = state.dir === 'reverse';
        state.qzAnswered = false;
        state.qzGrade = 2; // Default Good

        DOM.qzQ.textContent = isRev ? c.arti : c.kanji;
        if (!isRev && c.kana !== c.kanji && c.kana) {
            DOM.qzQSub.textContent = c.kana;
            DOM.qzQSub.classList.remove('hidden');
        } else {
            DOM.qzQSub.classList.add('hidden');
        }

        DOM.qzTag.textContent = c.tags.filter(t => !t.toLowerCase().includes('bab'))[0] || 'VOCAB';
        DOM.qzProg.textContent = `${state.idx + 1}/${state.queue.length}`;
        
        DOM.qzPrio.style.display = c._h.priorityScore > 0 ? 'flex' : 'none';
        DOM.qzPrio.innerHTML = `<i data-lucide="flame" class="w-3 h-3"></i> Prio (${c._h.priorityScore})`;

        // Build Distractors (Smart Semantic Filter)
        const opts = [c];
        const semantics = c.tags.filter(t => !t.toLowerCase().includes('bab'));
        let pool = state.pool.filter(x => x.id !== c.id);
        
        let filtered = pool.filter(x => x.tags.some(t => semantics.includes(t)));
        shuffle(filtered);
        opts.push(...filtered.slice(0, 5));
        
        if (opts.length < 6) {
            let left = pool.filter(x => !opts.find(o => o.id === x.id));
            shuffle(left);
            opts.push(...left.slice(0, 6 - opts.length));
        }
        shuffle(opts);

        // Render Options (Document Fragment for speed)
        const frag = document.createDocumentFragment();
        opts.forEach(o => {
            const b = document.createElement('button');
            b.className = 'quiz-opt';
            b.textContent = isRev ? o.kanji : o.arti;
            b.dataset.id = o.id; // Store ID for logic
            frag.appendChild(b);
        });
        DOM.qzOpts.innerHTML = '';
        DOM.qzOpts.appendChild(frag);

        DOM.qzNextZone.classList.add('opacity-0', 'pointer-events-none');
        this.switchView('quiz');
        lucide.createIcons();
    },

    handleQuizOpt: function(btn) {
        state.qzAnswered = true;
        const isCorrect = btn.dataset.id === state.curr.id;
        
        const allBtns = DOM.qzOpts.querySelectorAll('.quiz-opt');
        allBtns.forEach(b => b.classList.add('opt-disabled'));

        if (isCorrect) {
            btn.classList.add('opt-correct');
        } else {
            btn.classList.add('opt-wrong');
            state.qzGrade = 0; // Penalize
            // Find and highlight correct answer
            allBtns.forEach(b => {
                if(b.dataset.id === state.curr.id) b.classList.add('opt-correct');
            });
        }
        DOM.qzNextZone.classList.remove('opacity-0', 'pointer-events-none');
    },

    // --- GRADING & QUEUE ---
    grade: function(q, mode) {
        const c = state.curr;
        const newHist = calcInterval(q, c._h);
        Storage.update(c.id, newHist);

        if (q === 0) {
            c._h = newHist;
            // Short-term memory insertion: Insert 3 steps ahead instead of at the end
            const insertIdx = Math.min(state.idx + 4, state.queue.length);
            state.queue.splice(insertIdx, 0, c);
        }

        state.idx++;

        if (mode === 'quiz') {
            this.loadQZ();
        } else {
            DOM.fcArea.classList.remove('is-flipped');
            DOM.fcActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            setTimeout(() => this.loadFC(), 200); // Fast CSS transition sync
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
