/**
 * QUBIT SRS — Personal Engine v4
 * Diselaraskan langsung dengan struktur data asli LPK Tama (B1.json – B9.json).
 * Dual-mode: SRS (scheduled) vs Latihan (unlimited, no schedule writes).
 * Distractor engine: rarest-shared-tag priority (paling spesifik dulu), dedup by displayed text.
 */

// ==========================================
// 1. DATA MANIFEST
// ==========================================
const DATABASES = [
    { id: 'B1', path: './database/kotoba/B1.json' },
    { id: 'B2', path: './database/kotoba/B2.json' },
    { id: 'B3', path: './database/kotoba/B3.json' },
    { id: 'B4', path: './database/kotoba/B4.json' },
    { id: 'B5', path: './database/kotoba/B5.json' },
    { id: 'B6', path: './database/kotoba/B6.json' },
    { id: 'B7', path: './database/kotoba/B7.json' },
    { id: 'B8', path: './database/kotoba/B8.json' },
    { id: 'B9', path: './database/kotoba/B9.json' }
];

const LEECH_THRESHOLD = 8;

// ==========================================
// 2. DATA HELPERS — aligned to real schema quirks
// ==========================================

// ~17% of cards store kanji as "hiragana (kanji)" or "(kanji/kanji)" in one string
// e.g. "おれ (俺)", "だれ・どなた (誰・何方)". Split into a primary display string
// and an optional annotation so the flashcard doesn't just dump a long raw string
// into a giant font and clip on mobile.
function parseKanjiField(raw) {
    const m = raw.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
    if (m) return { primary: m[1].trim(), note: m[2].trim() };
    return { primary: raw, note: null };
}

// The label shown per deck on the dashboard. Derived from the data's own "Bab N" tag
// (always tags[0] in this dataset) rather than a hardcoded manifest string, so labels
// never drift out of sync with the actual file content.
function deriveDeckLabel(cards, fallbackId) {
    const babTag = cards[0]?.tags?.find(t => /^Bab\s*\d+/i.test(t));
    return babTag || fallbackId;
}

// Tag frequency across the active pool — used to weight distractor matching toward
// the most specific shared tag rather than the most generic one. E.g. two cards sharing
// "Numerik" (85 uses) is a much weaker signal than sharing "Kazoku-Outer" (15 uses);
// preferring the rarer tag first gives distractors that are actually "seranah".
function buildTagFrequency(pool) {
    const freq = {};
    pool.forEach(c => (c.tags || []).forEach(t => {
        if (t.toLowerCase().startsWith('bab')) return;
        freq[t] = (freq[t] || 0) + 1;
    }));
    return freq;
}

// Applies a length-tiered class so long strings (katakana loanword compounds up to
// 9 chars, or arti with inline notes up to 30+ chars) step down in font-size instead
// of clipping or overflowing the card on a phone screen. Thresholds are tuned against
// the real dataset's longest observed strings (see B1–B9 audit).
function fitText(el, text, thresholds = { md: 6, lg: 12, xl: 20 }) {
    el.classList.remove('text-len-md', 'text-len-lg', 'text-len-xl');
    const len = (text || '').length;
    if (len > thresholds.xl) el.classList.add('text-len-xl');
    else if (len > thresholds.lg) el.classList.add('text-len-lg');
    else if (len > thresholds.md) el.classList.add('text-len-md');
}

// ==========================================
// 3. DOM CACHE
// ==========================================
const DOM = {};
function cacheDOM() {
    ['dashboard', 'flashcard', 'quiz', 'complete'].forEach(v => DOM[`view_${v}`] = document.getElementById(`view-${v}`));

    DOM.deckGrid = document.getElementById('deck-grid');
    DOM.groupGrid = document.getElementById('group-grid');
    DOM.groupSection = document.getElementById('group-section');
    DOM.btnClearTags = document.getElementById('btn-clear-tags');
    DOM.navDue = document.getElementById('nav-due-count');
    DOM.navMode = document.getElementById('nav-mode-indicator');
    DOM.limitSelect = document.getElementById('setting-limit');

    DOM.fcArea = document.getElementById('fc-area');
    DOM.fcQ = document.getElementById('fc-q');
    DOM.fcQNote = document.getElementById('fc-q-note');
    DOM.fcKana = document.getElementById('fc-kana');
    DOM.fcKanaWrap = document.getElementById('fc-kana-wrap');
    DOM.fcA = document.getElementById('fc-a');
    DOM.fcTag = document.getElementById('fc-tag');
    DOM.fcProg = document.getElementById('fc-prog');
    DOM.fcPrio = document.getElementById('fc-prio');
    DOM.fcHint = document.getElementById('fc-hint');
    DOM.fcActions = document.getElementById('fc-actions');
    DOM.fcTHard = document.getElementById('fc-t-hard');
    DOM.fcTGood = document.getElementById('fc-t-good');
    DOM.fcTEasy = document.getElementById('fc-t-easy');
    DOM.fcBar = document.getElementById('fc-bar');
    DOM.fcLeech = document.getElementById('fc-leech');
    DOM.fcModeTag = document.getElementById('fc-mode-tag');

    DOM.qzQ = document.getElementById('qz-q');
    DOM.qzQNote = document.getElementById('qz-q-note');
    DOM.qzQSub = document.getElementById('qz-q-sub');
    DOM.qzTag = document.getElementById('qz-tag');
    DOM.qzProg = document.getElementById('qz-prog');
    DOM.qzPrio = document.getElementById('qz-prio');
    DOM.qzOpts = document.getElementById('qz-opts');
    DOM.qzNextZone = document.getElementById('qz-next-zone');
    DOM.qzBar = document.getElementById('qz-bar');
    DOM.qzLeech = document.getElementById('qz-leech');
    DOM.qzModeTag = document.getElementById('qz-mode-tag');

    DOM.completeStats = document.getElementById('complete-stats');
    DOM.completeTitle = document.getElementById('complete-title');
    DOM.completeSub = document.getElementById('complete-sub');
    DOM.btnRepeatSession = document.getElementById('btn-repeat-session');
}

// ==========================================
// 4. STORAGE — SRS state only. Latihan mode never touches this.
// ==========================================
const DB_KEY = 'qubit_srs_v4';
const Storage = {
    load: () => JSON.parse(localStorage.getItem(DB_KEY) || '{}'),
    save: (data) => localStorage.setItem(DB_KEY, JSON.stringify(data)),
    getStats: (id) => Storage.load()[id] || { ease: 2.5, interval: 0, nextReview: 0, priorityScore: 0, reps: 0, lapses: 0 },
    update: (id, stats) => { const d = Storage.load(); d[id] = stats; Storage.save(d); },
    getDue: () => {
        const d = Storage.load(), now = Date.now();
        let c = 0; for (let k in d) { if (d[k].nextReview <= now) c++; }
        return c;
    },
    getDueForCards: (cardIds) => {
        const d = Storage.load(), now = Date.now();
        let c = 0;
        cardIds.forEach(id => { const h = d[id]; if (!h || h.nextReview <= now) c++; });
        return c;
    },
    wipe: () => localStorage.removeItem(DB_KEY)
};

// ==========================================
// 5. STATE
// ==========================================
const state = {
    engineMode: 'srs',      // srs | latihan
    studyMode: 'flashcard', // flashcard | quiz
    dir: 'forward',         // forward (JP->ID) | reverse (ID->JP)
    order: 'priority',      // priority | random
    limit: 20,

    decks: new Set(),
    groups: new Set(),      // selected non-bab tags to filter by; empty = all
    deckCards: {},           // deckId -> full card array (raw, from JSON)
    tagFreq: {},             // computed at start() time, scoped to active pool

    pool: [],
    queue: [],
    total: 0,
    idx: 0,
    curr: null,
    qzAnswered: false,
    qzGrade: 2,
    session: { again: 0, hard: 0, good: 0, easy: 0, startedAt: 0 }
};

// ==========================================
// 6. ALGORITHM
// ==========================================
function shuffle(arr) {
    let m = arr.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);
        t = arr[m]; arr[m] = arr[i]; arr[i] = t;
    }
    return arr;
}

function calcInterval(quality, hist) {
    let { ease = 2.5, interval = 0, priorityScore = 0, reps = 0, lapses = 0 } = hist;
    const MIN = 60000, HR = 60 * MIN, DAY = 24 * HR;
    reps += 1;

    if (quality === 0) {
        priorityScore += 3;
        lapses += 1;
        ease = Math.max(1.3, ease - 0.2);
        interval = MIN;
    } else if (quality === 1) {
        priorityScore = Math.max(0, priorityScore - 1);
        ease = Math.max(1.3, ease - 0.15);
        interval = interval === 0 ? 20 * MIN : interval * Math.max(1.15, ease * 0.75);
    } else if (quality === 2) {
        priorityScore = Math.max(0, priorityScore - 2);
        interval = interval === 0 ? 1 * HR : interval * ease;
    } else {
        priorityScore = Math.max(0, priorityScore - 2);
        ease = Math.min(3.2, ease + 0.15);
        interval = interval === 0 ? 1 * DAY : interval * ease * 1.3;
    }
    return { ease, interval, priorityScore, nextReview: Date.now() + interval, reps, lapses };
}

function isLeech(hist) {
    return hist.priorityScore >= LEECH_THRESHOLD;
}

function timeStr(ms) {
    if (ms < 3600000) return Math.round(ms / 60000) + 'm';
    if (ms < 86400000) return Math.round(ms / 3600000) + 'j';
    return Math.round(ms / 86400000) + 'h';
}

// --- Distractor engine ---
// displayField = the property actually rendered as an option ('arti' for JP->ID, 'kanji' for ID->JP).
// Two things this dataset specifically requires:
//  1) Rarest-shared-tag-first matching. This deck tags cards with both broad POS labels
//     ("Kata Kerja", 194 uses) and narrow semantic groups ("Kazoku-Outer", 15 uses) in the
//     same tags[] array. Matching on the first shared tag found would mostly surface the
//     broad one and produce generic, not-actually-"seranah" distractors. Instead we rank
//     candidates by their rarest shared tag so a "kakek" question pulls other Kazoku-Inner
//     terms before falling back to something merely also being a noun.
//  2) Dedup by displayed text, not card id. 76 different (id, kanji) pairs in this dataset
//     resolve to an identical arti string (e.g. two different kanji both meaning "kota"),
//     which would otherwise let two visually-identical options appear in one quiz.
function buildDistractors(target, pool, count, displayField, tagFreq) {
    const seenText = new Set([target[displayField]]);
    const opts = [target];
    const targetTags = (target.tags || []).filter(t => !t.toLowerCase().startsWith('bab'));

    let remaining = pool.filter(x => x.id !== target.id && !seenText.has(x[displayField]));

    if (targetTags.length) {
        // Score each candidate by the rarest tag it shares with the target (lower freq = better).
        const scored = remaining.map(c => {
            const shared = (c.tags || []).filter(t => targetTags.includes(t));
            if (!shared.length) return null;
            const bestRarity = Math.min(...shared.map(t => tagFreq[t] || Infinity));
            return { card: c, rarity: bestRarity };
        }).filter(Boolean);

        // Sort by rarity ascending, but shuffle within same-rarity buckets so it's not
        // deterministically the same distractor set every time the same card comes up.
        scored.sort((a, b) => a.rarity - b.rarity || Math.random() - 0.5);

        for (const { card } of scored) {
            if (opts.length >= count + 1) break;
            if (seenText.has(card[displayField])) continue;
            opts.push(card);
            seenText.add(card[displayField]);
        }
        remaining = remaining.filter(x => !seenText.has(x[displayField]));
    }

    // Fallback: random top-up so option count is always satisfied even for
    // singleton-tag cards with no real semantic neighbors in the pool.
    if (opts.length < count + 1) {
        shuffle(remaining);
        for (const c of remaining) {
            if (opts.length >= count + 1) break;
            if (seenText.has(c[displayField])) continue;
            opts.push(c);
            seenText.add(c[displayField]);
        }
    }

    return shuffle(opts);
}

// ==========================================
// 7. ENGINE
// ==========================================
const app = {
    init: function () {
        cacheDOM();
        this.renderDecks();
        this.updateBadge();
        this.attachEvents();
        this.attachKeyboard();
        this.updateModeIndicator();
    },

    attachEvents: function () {
        document.querySelectorAll('.engine-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                document.querySelectorAll('.engine-btn').forEach(el => el.classList.remove('active'));
                e.currentTarget.classList.add('active');
                state.engineMode = e.currentTarget.dataset.val;
                this.updateModeIndicator();
            });
        });

        document.querySelectorAll('.setting-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const type = btn.dataset.type;
                const val = btn.dataset.val;
                document.querySelectorAll(`.setting-btn[data-type="${type}"]`).forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                if (type === 'direction') state.dir = val;
                else if (type === 'order') state.order = val;
                else state.studyMode = val;
            });
        });

        DOM.limitSelect.addEventListener('change', (e) => state.limit = e.target.value);

        document.getElementById('btn-select-all').addEventListener('click', (e) => {
            const allSelected = state.decks.size === DATABASES.length;
            document.querySelectorAll('.deck-btn').forEach(b => {
                const has = state.decks.has(b.dataset.id);
                if (allSelected && has) b.click();
                if (!allSelected && !has) b.click();
            });
            e.currentTarget.textContent = allSelected ? 'Pilih Semua' : 'Batal Semua';
        });

        if (DOM.btnClearTags) {
            DOM.btnClearTags.addEventListener('click', () => {
                state.groups.clear();
                this.refreshGroupOptions();
            });
        }

        document.getElementById('btn-wipe').addEventListener('click', () => this.confirmWipe());
        document.getElementById('btn-start').addEventListener('click', () => this.start());
        DOM.btnRepeatSession.addEventListener('click', () => this.start());

        document.querySelectorAll('.btn-home').forEach(b => b.addEventListener('click', () => this.goHome()));

        DOM.fcArea.addEventListener('click', () => this.flipFC());
        document.querySelectorAll('.grade-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                this.grade(parseInt(b.dataset.q), 'flashcard');
            });
        });

        DOM.qzOpts.addEventListener('click', (e) => {
            const btn = e.target.closest('.quiz-opt');
            if (!btn || state.qzAnswered) return;
            this.handleQuizOpt(btn);
        });

        document.getElementById('btn-quiz-next').addEventListener('click', () => this.grade(state.qzGrade, 'quiz'));
    },

    attachKeyboard: function () {
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const activeView = document.querySelector('main > div:not(.hidden)');
            if (!activeView) return;
            const id = activeView.id;

            if (id === 'view-flashcard') {
                if (e.code === 'Space') {
                    e.preventDefault();
                    if (!DOM.fcArea.classList.contains('is-flipped')) this.flipFC();
                    return;
                }
                if (DOM.fcArea.classList.contains('is-flipped') && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
                    this.grade(['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code), 'flashcard');
                }
                if (e.code === 'Escape') this.goHome();
            }

            if (id === 'view-quiz') {
                if (e.code === 'Escape') this.goHome();
                if (!state.qzAnswered && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
                    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
                    const btn = DOM.qzOpts.children[n];
                    if (btn) this.handleQuizOpt(btn);
                }
                if (state.qzAnswered && (e.code === 'Enter' || e.code === 'Space')) {
                    e.preventDefault();
                    this.grade(state.qzGrade, 'quiz');
                }
            }
        });
    },

    updateModeIndicator: function () {
        const isLatihan = state.engineMode === 'latihan';
        DOM.navMode.textContent = isLatihan ? 'LATIHAN' : 'SRS';
        DOM.navMode.className = isLatihan
            ? 'text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-accent border-accent/30 bg-accent/10'
            : 'text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-info border-info/30 bg-info/10';
    },

    renderDecks: async function () {
        const frag = document.createDocumentFragment();
        for (const db of DATABASES) {
            const btn = document.createElement('div');
            btn.className = "deck-btn relative p-4 rounded-xl border border-border bg-card text-left transition-all active:scale-95 cursor-pointer";
            btn.dataset.id = db.id;
            btn.innerHTML = `
                <div class="check-badge absolute top-3 right-3 w-5 h-5 bg-accent rounded-full flex items-center justify-center text-primary-foreground opacity-0 scale-50 transition-all">
                    <i data-lucide="check" class="w-3 h-3"></i>
                </div>
                <h4 class="font-bold text-sm text-primary deck-label">${db.id}</h4>
                <p class="deck-due text-[11px] text-muted-foreground mt-1 font-mono">memuat···</p>
            `;

            btn.addEventListener('click', () => {
                if (state.decks.has(db.id)) {
                    state.decks.delete(db.id);
                    btn.classList.remove('border-accent', 'bg-accent/5', 'shadow-glow');
                    btn.querySelector('.check-badge').classList.add('opacity-0', 'scale-50');
                } else {
                    state.decks.add(db.id);
                    btn.classList.add('border-accent', 'bg-accent/5', 'shadow-glow');
                    btn.querySelector('.check-badge').classList.remove('opacity-0', 'scale-50');
                }
                document.getElementById('btn-select-all').textContent = state.decks.size === DATABASES.length ? 'Batal Semua' : 'Pilih Semua';
                this.refreshGroupOptions();
            });
            frag.appendChild(btn);
        }
        DOM.deckGrid.appendChild(frag);
        lucide.createIcons();

        // Load all data to memory first so we can extract global tags
        const fetches = DATABASES.map(db =>
            fetch(db.path).then(res => res.json()).then(arr => {
                state.deckCards[db.id] = arr;
                return { id: db.id, arr };
            })
        );

        try {
            const results = await Promise.all(fetches);
            results.forEach(({ id, arr }) => {
                const due = Storage.getDueForCards(arr.map(c => c.id));
                const labelEl = document.querySelector(`.deck-btn[data-id="${id}"] .deck-label`);
                const dueEl = document.querySelector(`.deck-btn[data-id="${id}"] .deck-due`);
                if (labelEl) labelEl.textContent = deriveDeckLabel(arr, id);
                if (dueEl) dueEl.textContent = `${arr.length} kartu · ${due} due`;
            });

            // Once all data is loaded, render the global tags
            this.refreshGroupOptions();
        } catch (e) {
            console.error(e);
            this.toast('Gagal memuat data JSON.', 'error');
        }
    },

    // Guided Study Tags: Pulls from ALL decks or only SELECTED decks
    refreshGroupOptions: function () {
        const tagCount = {};
        const sourceDecks = state.decks.size > 0 ? Array.from(state.decks) : DATABASES.map(d => d.id);

        sourceDecks.forEach(id => {
            (state.deckCards[id] || []).forEach(c => {
                (c.tags || []).forEach(t => {
                    if (t.toLowerCase().startsWith('bab')) return;
                    tagCount[t] = (tagCount[t] || 0) + 1;
                });
            });
        });

        const tags = Object.keys(tagCount);
        if (tags.length === 0) {
            DOM.groupGrid.innerHTML = '<p class="text-xs text-muted-foreground">Tidak ada tag di modul ini.</p>';
            return;
        }

        // Prune selections that no longer apply
        state.groups.forEach(g => { if (!tagCount[g]) state.groups.delete(g); });

        DOM.groupGrid.innerHTML = '';
        const frag = document.createDocumentFragment();

        tags.sort((a, b) => tagCount[b] - tagCount[a]);

        tags.forEach(tag => {
            const chip = document.createElement('button');
            const active = state.groups.has(tag);
            chip.className = `group-chip ${active ? 'active' : ''}`;
            chip.innerHTML = `${tag} <span class="opacity-50 font-mono">${tagCount[tag]}</span>`;
            chip.dataset.tag = tag;
            chip.addEventListener('click', () => {
                if (state.groups.has(tag)) {
                    state.groups.delete(tag);
                    chip.classList.remove('active');
                } else {
                    state.groups.add(tag);
                    chip.classList.add('active');
                }
                const btnClear = document.getElementById('btn-clear-tags');
                if (btnClear) {
                    if (state.groups.size > 0) btnClear.classList.remove('hidden');
                    else btnClear.classList.add('hidden');
                }
            });
            frag.appendChild(chip);
        });
        DOM.groupGrid.appendChild(frag);

        const btnClear = document.getElementById('btn-clear-tags');
        if (btnClear) {
            if (state.groups.size > 0) btnClear.classList.remove('hidden');
            else btnClear.classList.add('hidden');
        }
    },

    updateBadge: function () {
        DOM.navDue.textContent = Storage.getDue();
    },

    switchView: function (v) {
        const views = ['dashboard', 'flashcard', 'quiz', 'complete'];
        const current = views.find(id => !DOM[`view_${id}`].classList.contains('hidden'));

        const finishSwitch = () => {
            views.forEach(id => {
                DOM[`view_${id}`].classList.add('hidden');
                DOM[`view_${id}`].classList.remove('flex', 'view-exit');
            });
            DOM[`view_${v}`].classList.remove('hidden');
            if (v !== 'dashboard') DOM[`view_${v}`].classList.add('flex');
        };

        // Play a brief exit animation on the outgoing view instead of an instant cut —
        // this was the main source of "jank" reported between flashcard/quiz transitions.
        if (current && current !== v) {
            const outgoing = DOM[`view_${current}`];
            outgoing.classList.add('view-exit');
            setTimeout(finishSwitch, 130);
        } else {
            finishSwitch();
        }
    },

    goHome: function () {
        this.switchView('dashboard');
        this.updateBadge();
        this.renderDeckDueRefresh();
    },

    renderDeckDueRefresh: function () {
        Object.entries(state.deckCards).forEach(([id, cards]) => {
            const due = Storage.getDueForCards(cards.map(c => c.id));
            const el = document.querySelector(`.deck-btn[data-id="${id}"] .deck-due`);
            if (el) el.textContent = `${cards.length} kartu · ${due} due`;
        });
    },

    confirmWipe: function () {
        if (confirm("Hapus total riwayat SRS? Mode Latihan tidak terpengaruh karena memang tidak pernah menulis riwayat. Tindakan ini tidak bisa dibatalkan.")) {
            Storage.wipe();
            location.reload();
        }
    },

    start: async function () {
        if (state.decks.size === 0 && state.groups.size === 0) {
            return this.toast("Pilih minimal 1 modul bab atau 1 topik studi.", 'warn');
        }

        try {
            state.pool = [];
            const activeDecks = state.decks.size > 0 ? Array.from(state.decks) : DATABASES.map(d => d.id);

            for (const id of activeDecks) {
                if (state.deckCards[id]) {
                    state.pool.push(...state.deckCards[id]);
                }
            }

            if (state.groups.size > 0) {
                state.pool = state.pool.filter(c => (c.tags || []).some(t => state.groups.has(t)));
            }

            if (state.pool.length === 0) return this.toast("Tidak ada kartu yang cocok dengan filter grup ini.", 'warn');

            state.tagFreq = buildTagFrequency(state.pool);

            let candidates;
            if (state.engineMode === 'latihan') {
                candidates = state.pool.map(c => ({ ...c, _h: Storage.getStats(c.id) }));
            } else {
                const NOW = Date.now();
                candidates = state.pool.map(c => ({ ...c, _h: Storage.getStats(c.id) }))
                    .filter(c => c._h.nextReview <= NOW);
            }

            if (state.order === 'random') {
                shuffle(candidates);
            } else {
                candidates.sort((a, b) => b._h.priorityScore !== a._h.priorityScore ?
                    b._h.priorityScore - a._h.priorityScore :
                    a._h.nextReview - b._h.nextReview);
            }

            if (state.limit !== 'all') candidates = candidates.slice(0, parseInt(state.limit));

            state.queue = candidates;
            state.total = candidates.length;
            state.idx = 0;
            state.session = { again: 0, hard: 0, good: 0, easy: 0, startedAt: Date.now() };

            if (state.queue.length === 0) {
                return state.engineMode === 'latihan'
                    ? this.toast("Tidak ada kartu di seleksi ini.", 'warn')
                    : this.renderComplete(true);
            }

            state.studyMode === 'flashcard' ? this.loadFC() : this.loadQZ();

        } catch (e) {
            this.toast("Gagal memuat data JSON. Jalankan lewat Live Server, bukan file://", 'error');
        }
    },

    toast: function (msg, type = 'info') {
        const el = document.createElement('div');
        const colors = { info: 'border-info/40 text-info', warn: 'border-warning/40 text-warning', error: 'border-destructive/40 text-destructive' };
        el.className = `toast ${colors[type]}`;
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2600);
    },

    updateProgressBar: function (barEl) {
        const pct = state.total === 0 ? 0 : (state.idx / state.total) * 100;
        barEl.style.width = `${pct}%`;
    },

    modeTagLabel: function () {
        return state.engineMode === 'latihan' ? 'LATIHAN · TANPA JADWAL' : 'SRS · TERJADWAL';
    },

    primaryTagFor: function (c) {
        return (c.tags || []).find(t => !t.toLowerCase().startsWith('bab')) || 'VOCAB';
    },

    // --- FLASHCARD ---
    loadFC: function () {
        if (state.idx >= state.queue.length) return this.renderComplete(false);

        const c = state.curr = state.queue[state.idx];
        const isRev = state.dir === 'reverse';

        if (isRev) {
            DOM.fcQ.textContent = c.arti;
            fitText(DOM.fcQ, c.arti);
            DOM.fcQNote.textContent = '';
            DOM.fcQNote.classList.add('hidden');
        } else {
            const parsed = parseKanjiField(c.kanji);
            DOM.fcQ.textContent = parsed.primary;
            fitText(DOM.fcQ, parsed.primary);
            if (parsed.note) {
                DOM.fcQNote.textContent = parsed.note;
                DOM.fcQNote.classList.remove('hidden');
            } else {
                DOM.fcQNote.classList.add('hidden');
            }
        }

        // Back face: kana is redundant for 219 pure-katakana/kana cards (kanji === kana) — hide it then.
        const showKana = !isRev && c.kana && c.kana !== c.kanji;
        if (showKana) {
            DOM.fcKana.textContent = c.kana;
            DOM.fcKanaWrap.classList.remove('hidden');
        } else if (isRev) {
            DOM.fcKana.textContent = c.kana || c.kanji;
            DOM.fcKanaWrap.classList.remove('hidden');
        } else {
            DOM.fcKanaWrap.classList.add('hidden');
        }

        DOM.fcA.textContent = isRev ? parseKanjiField(c.kanji).primary : c.arti;
        fitText(DOM.fcA, DOM.fcA.textContent, { md: 18, lg: 26, xl: 34 });
        DOM.fcTag.textContent = this.primaryTagFor(c);
        DOM.fcProg.textContent = `${state.idx + 1}/${state.queue.length}`;
        DOM.fcModeTag.textContent = this.modeTagLabel();
        this.updateProgressBar(DOM.fcBar);

        DOM.fcPrio.style.display = c._h.priorityScore > 0 ? 'flex' : 'none';
        DOM.fcPrio.innerHTML = `<i data-lucide="flame" class="w-3 h-3"></i> ${c._h.priorityScore}`;
        DOM.fcLeech.style.display = isLeech(c._h) ? 'flex' : 'none';

        DOM.fcTHard.textContent = timeStr(calcInterval(1, c._h).interval);
        DOM.fcTGood.textContent = timeStr(calcInterval(2, c._h).interval);
        DOM.fcTEasy.textContent = timeStr(calcInterval(3, c._h).interval);

        DOM.fcArea.classList.remove('is-flipped');
        DOM.fcHint.classList.remove('hidden');
        DOM.fcActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');

        this.switchView('flashcard');
        lucide.createIcons();
    },

    flipFC: function () {
        if (DOM.fcArea.classList.contains('is-flipped')) return;
        DOM.fcArea.classList.add('is-flipped');
        DOM.fcHint.classList.add('hidden');
        DOM.fcActions.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
    },

    // --- QUIZ ---
    loadQZ: function () {
        if (state.idx >= state.queue.length) return this.renderComplete(false);

        const c = state.curr = state.queue[state.idx];
        const isRev = state.dir === 'reverse';
        state.qzAnswered = false;
        state.qzGrade = 2;

        if (isRev) {
            DOM.qzQ.textContent = c.arti;
            fitText(DOM.qzQ, c.arti);
            DOM.qzQNote.classList.add('hidden');
            DOM.qzQSub.classList.add('hidden');
        } else {
            const parsed = parseKanjiField(c.kanji);
            DOM.qzQ.textContent = parsed.primary;
            fitText(DOM.qzQ, parsed.primary);
            if (parsed.note) {
                DOM.qzQNote.textContent = parsed.note;
                DOM.qzQNote.classList.remove('hidden');
            } else {
                DOM.qzQNote.classList.add('hidden');
            }
            if (c.kana && c.kana !== c.kanji) {
                DOM.qzQSub.textContent = c.kana;
                DOM.qzQSub.classList.remove('hidden');
            } else {
                DOM.qzQSub.classList.add('hidden');
            }
        }

        DOM.qzTag.textContent = this.primaryTagFor(c);
        DOM.qzProg.textContent = `${state.idx + 1}/${state.queue.length}`;
        DOM.qzModeTag.textContent = this.modeTagLabel();
        this.updateProgressBar(DOM.qzBar);

        DOM.qzPrio.style.display = c._h.priorityScore > 0 ? 'flex' : 'none';
        DOM.qzPrio.innerHTML = `<i data-lucide="flame" class="w-3 h-3"></i> ${c._h.priorityScore}`;
        DOM.qzLeech.style.display = isLeech(c._h) ? 'flex' : 'none';

        const pool = state.pool.filter(x => x.id !== c.id);
        const displayField = isRev ? 'kanji' : 'arti';
        const opts = buildDistractors(c, pool, 5, displayField, state.tagFreq);

        const frag = document.createDocumentFragment();
        opts.forEach((o, i) => {
            const b = document.createElement('button');
            b.className = 'quiz-opt';
            b.style.animationDelay = `${i * 30}ms`;
            const optText = isRev ? parseKanjiField(o.kanji).primary : o.arti;
            b.dataset.id = o.id;
            b.innerHTML = `<span class="opt-num">${i + 1}</span><span class="opt-label">${optText}</span>`;
            fitText(b, optText, { md: 14, lg: 22, xl: 30 });
            frag.appendChild(b);
        });
        DOM.qzOpts.innerHTML = '';
        DOM.qzOpts.appendChild(frag);

        DOM.qzNextZone.classList.add('opacity-0', 'pointer-events-none');
        this.switchView('quiz');
        lucide.createIcons();
    },

    handleQuizOpt: function (btn) {
        state.qzAnswered = true;
        const isCorrect = btn.dataset.id === state.curr.id;

        const allBtns = DOM.qzOpts.querySelectorAll('.quiz-opt');
        allBtns.forEach(b => b.classList.add('opt-disabled'));

        if (isCorrect) {
            btn.classList.add('opt-correct');
            state.qzGrade = 2;
        } else {
            btn.classList.add('opt-wrong');
            state.qzGrade = 0;
            allBtns.forEach(b => {
                if (b.dataset.id === state.curr.id) b.classList.add('opt-correct');
            });
        }
        DOM.qzNextZone.classList.remove('opacity-0', 'pointer-events-none');
    },

    // --- GRADING ---
    grade: function (q, mode) {
        const c = state.curr;

        if (state.engineMode !== 'latihan') {
            const newHist = calcInterval(q, c._h);
            Storage.update(c.id, newHist);
            if (q === 0) c._h = newHist;
        }

        const key = ['again', 'hard', 'good', 'easy'][q];
        state.session[key]++;

        if (q === 0) {
            const insertIdx = Math.min(state.idx + 4, state.queue.length);
            state.queue.splice(insertIdx, 0, c);
            state.total = Math.max(state.total, state.queue.length);
        }

        state.idx++;

        if (mode === 'quiz') {
            this.loadQZ();
        } else {
            DOM.fcArea.classList.remove('is-flipped');
            DOM.fcActions.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            setTimeout(() => this.loadFC(), 180);
        }
    },

    renderComplete: function (nothingDue) {
        this.updateBadge();
        this.renderDeckDueRefresh();

        if (nothingDue) {
            DOM.completeTitle.textContent = 'Nihil Due';
            DOM.completeSub.textContent = 'Tidak ada entitas overdue di memori SRS Anda saat ini. Switch ke mode Latihan kalau mau tetap latihan.';
            DOM.completeStats.innerHTML = '';
            return this.switchView('complete');
        }

        const s = state.session;
        const totalGraded = s.again + s.hard + s.good + s.easy;
        const accuracy = totalGraded ? Math.round(((s.good + s.easy) / totalGraded) * 100) : 0;
        const elapsed = Math.round((Date.now() - s.startedAt) / 1000);
        const mins = Math.floor(elapsed / 60), secs = elapsed % 60;

        DOM.completeTitle.textContent = 'Matriks Selesai';
        DOM.completeSub.textContent = `${totalGraded} kartu · ${mins}m ${secs}s · ${accuracy}% akurasi · mode ${state.engineMode === 'latihan' ? 'Latihan' : 'SRS'}`;
        DOM.completeStats.innerHTML = `
            <div class="stat-pill text-destructive"><span class="stat-num">${s.again}</span><span>Lupa</span></div>
            <div class="stat-pill text-warning"><span class="stat-num">${s.hard}</span><span>Sulit</span></div>
            <div class="stat-pill text-success"><span class="stat-num">${s.good}</span><span>Ingat</span></div>
            <div class="stat-pill text-info"><span class="stat-num">${s.easy}</span><span>Mudah</span></div>
        `;
        this.switchView('complete');
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
