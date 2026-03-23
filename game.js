/* ===== Muscle Typing - game.js ===== */
(() => {
    'use strict';

    // ---- Word List ----
    const WORDS = [
        'muscle', 'protein', 'squat', 'bench', 'deadlift',
        'bicep', 'tricep', 'abs', 'plank', 'crunch',
        'pushup', 'pullup', 'dumbbell', 'barbell', 'flex',
        'pump', 'bulk', 'shred', 'gains', 'reps',
        'sets', 'cardio', 'hiit', 'yoga', 'fitness'
    ];

    const TOTAL_IMAGES = 10;
    const GAME_DURATION = 60; // seconds

    // ---- Rank Definitions ----
    const RANKS = [
        { min: 60, jp: '筋肉の神', en: 'Muscle God', emoji: '🏆👑' },
        { min: 45, jp: '筋肉マスター', en: 'Muscle Master', emoji: '💪🔥' },
        { min: 30, jp: '筋肉エリート', en: 'Muscle Elite', emoji: '💪✨' },
        { min: 20, jp: '筋肉戦士', en: 'Muscle Warrior', emoji: '⚔️💪' },
        { min: 10, jp: '筋肉ルーキー', en: 'Muscle Rookie', emoji: '🌱💪' },
        { min: 0,  jp: '筋肉見習い', en: 'Muscle Beginner', emoji: '🐣💪' }
    ];

    // ---- DOM Elements ----
    const $ = id => document.getElementById(id);

    const screens = {
        start: $('screen-start'),
        game: $('screen-game'),
        result: $('screen-result')
    };

    const els = {
        bgImage: $('bg-image'),
        btnStart: $('btn-start'),
        btnRetry: $('btn-retry'),
        btnShare: $('btn-share'),
        hudTimer: $('hud-timer'),
        hudScore: $('hud-score'),
        hudCombo: $('hud-combo'),
        hudWpm: $('hud-wpm'),
        timerBar: $('timer-bar'),
        wordDisplay: $('word-display'),
        currentWord: $('current-word'),
        typingInput: $('typing-input'),
        comboDisplay: $('combo-display'),
        comboText: $('combo-text'),
        resultWpm: $('result-wpm'),
        resultCorrect: $('result-correct'),
        resultCombo: $('result-combo'),
        resultAccuracy: $('result-accuracy'),
        resultRank: $('result-rank')
    };

    // ---- Audio (Web Audio API) ----
    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playTone(freq, duration, type = 'sine', volume = 0.15) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.value = volume;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* silent fail */ }
    }

    function sfxCorrect() {
        playTone(880, 0.12, 'sine', 0.12);
        setTimeout(() => playTone(1100, 0.15, 'sine', 0.10), 60);
    }

    function sfxWrong() {
        playTone(200, 0.2, 'sawtooth', 0.08);
        setTimeout(() => playTone(150, 0.25, 'sawtooth', 0.06), 80);
    }

    function sfxStart() {
        playTone(440, 0.1, 'sine', 0.1);
        setTimeout(() => playTone(660, 0.1, 'sine', 0.1), 100);
        setTimeout(() => playTone(880, 0.15, 'sine', 0.12), 200);
    }

    function sfxEnd() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
            setTimeout(() => playTone(f, 0.3, 'sine', 0.1), i * 120);
        });
    }

    // ---- Game State ----
    let state = {
        running: false,
        timeLeft: GAME_DURATION,
        score: 0,
        combo: 0,
        maxCombo: 0,
        attempts: 0,
        correct: 0,
        imgIndex: 0,
        currentWord: '',
        timer: null,
        startTime: 0
    };

    // ---- Helpers ----
    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    let wordQueue = [];

    function nextWord() {
        if (wordQueue.length === 0) {
            wordQueue = shuffle(WORDS);
            // avoid repeating last word
            if (wordQueue[0] === state.currentWord && wordQueue.length > 1) {
                [wordQueue[0], wordQueue[1]] = [wordQueue[1], wordQueue[0]];
            }
        }
        return wordQueue.pop();
    }

    function setBackground(index) {
        const num = (index % TOTAL_IMAGES) + 1;
        els.bgImage.style.backgroundImage = `url('images/img${num}.png')`;
    }

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    function getRank(wpm) {
        return RANKS.find(r => wpm >= r.min) || RANKS[RANKS.length - 1];
    }

    // ---- Word Display ----
    function displayWord(word) {
        state.currentWord = word;
        els.currentWord.textContent = word;
        els.typingInput.value = '';
        els.wordDisplay.classList.remove('correct', 'wrong');
    }

    // ---- HUD Update ----
    function updateHUD() {
        els.hudTimer.textContent = state.timeLeft;
        els.hudScore.textContent = state.correct;
        els.hudCombo.textContent = state.combo;

        // Live WPM
        const elapsed = (Date.now() - state.startTime) / 1000;
        const wpm = elapsed > 0 ? Math.round((state.correct / elapsed) * 60) : 0;
        els.hudWpm.textContent = wpm;

        // Timer bar
        const pct = (state.timeLeft / GAME_DURATION) * 100;
        els.timerBar.style.width = pct + '%';

        if (state.timeLeft <= 10) {
            els.timerBar.classList.add('warning');
        } else {
            els.timerBar.classList.remove('warning');
        }
    }

    // ---- Combo ----
    function showCombo() {
        if (state.combo >= 3) {
            els.comboDisplay.classList.remove('hidden');
            els.comboText.textContent = `${state.combo} COMBO! 🔥`;
            // Re-trigger animation
            els.comboDisplay.style.animation = 'none';
            void els.comboDisplay.offsetHeight;
            els.comboDisplay.style.animation = '';
        } else {
            els.comboDisplay.classList.add('hidden');
        }
    }

    // ---- Correct / Wrong Feedback ----
    function onCorrect() {
        state.correct++;
        state.combo++;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;

        // Visual
        els.wordDisplay.classList.add('correct');
        setTimeout(() => els.wordDisplay.classList.remove('correct'), 300);

        // Sound
        sfxCorrect();

        // Background change
        state.imgIndex++;
        setBackground(state.imgIndex);

        // Combo
        showCombo();

        // Next word
        displayWord(nextWord());
        updateHUD();
    }

    function onWrong() {
        state.combo = 0;

        // Visual
        els.wordDisplay.classList.add('wrong');
        setTimeout(() => els.wordDisplay.classList.remove('wrong'), 400);

        // Sound
        sfxWrong();

        // Combo
        showCombo();
    }

    // ---- Input Handler ----
    function handleInput() {
        if (!state.running) return;

        const typed = els.typingInput.value.trim().toLowerCase();
        const target = state.currentWord.toLowerCase();

        if (typed === target) {
            state.attempts++;
            onCorrect();
        } else if (typed.length >= target.length) {
            // Wrong: typed enough chars but doesn't match
            state.attempts++;
            onWrong();
            els.typingInput.value = '';
        }
    }

    // ---- Timer ----
    function startTimer() {
        state.timer = setInterval(() => {
            state.timeLeft--;
            updateHUD();

            if (state.timeLeft <= 0) {
                endGame();
            }
        }, 1000);
    }

    // ---- Game Flow ----
    function startGame() {
        // Reset state
        state = {
            running: true,
            timeLeft: GAME_DURATION,
            score: 0,
            combo: 0,
            maxCombo: 0,
            attempts: 0,
            correct: 0,
            imgIndex: 0,
            currentWord: '',
            timer: null,
            startTime: Date.now()
        };
        wordQueue = [];

        // Init
        setBackground(0);
        displayWord(nextWord());
        updateHUD();
        showScreen('game');
        els.typingInput.value = '';
        els.typingInput.focus();
        els.comboDisplay.classList.add('hidden');
        els.timerBar.classList.remove('warning');
        els.timerBar.style.width = '100%';

        sfxStart();
        startTimer();
    }

    function endGame() {
        state.running = false;
        clearInterval(state.timer);

        sfxEnd();

        // Calculate results
        const elapsed = GAME_DURATION;
        const wpm = Math.round((state.correct / elapsed) * 60);
        const accuracy = state.attempts > 0
            ? Math.round((state.correct / state.attempts) * 100)
            : 0;

        // Display results
        els.resultWpm.textContent = wpm;
        els.resultCorrect.textContent = state.correct;
        els.resultCombo.textContent = state.maxCombo;
        els.resultAccuracy.textContent = accuracy + '%';

        // Rank
        const rank = getRank(wpm);
        els.resultRank.innerHTML = `
            <div style="font-size:2.5rem;margin-bottom:8px">${rank.emoji}</div>
            <div class="label-jp" style="font-size:1.4rem;font-weight:900;color:var(--pink)">${rank.jp}</div>
            <div class="label-en" style="font-size:0.8rem">${rank.en}</div>
        `;

        showScreen('result');
    }

    // ---- Share ----
    function shareResult() {
        const elapsed = GAME_DURATION;
        const wpm = Math.round((state.correct / elapsed) * 60);
        const rank = getRank(wpm);

        const text = [
            `【筋肉タイピング】`,
            `${rank.emoji} ${rank.jp}`,
            `WPM: ${wpm} | 正解: ${state.correct} | コンボ: ${state.maxCombo}`,
            `💪 #MuscleLove #筋肉タイピング`,
            `https://www.patreon.com/c/MuscleLove`
        ].join('\n');

        if (navigator.share) {
            navigator.share({ text }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert('結果をコピーしました！\nResult copied to clipboard!');
            }).catch(() => {
                prompt('コピーしてシェアしよう / Copy and share:', text);
            });
        } else {
            prompt('コピーしてシェアしよう / Copy and share:', text);
        }
    }

    // ---- Event Listeners ----
    els.btnStart.addEventListener('click', startGame);
    els.btnRetry.addEventListener('click', startGame);
    els.btnShare.addEventListener('click', shareResult);
    els.typingInput.addEventListener('input', handleInput);

    // Prevent Enter from doing anything weird
    els.typingInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });

    // Space bar on start screen triggers start
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' && screens.start.classList.contains('active')) {
            e.preventDefault();
            startGame();
        }
    });

    // ---- Init ----
    setBackground(0);
    showScreen('start');

})();
