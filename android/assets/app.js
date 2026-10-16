/**
 * Dexcards — Liquid Glass Flashcard MCP
 * Frontend Controller & Mobile Gesture Engine
 */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.ctx = new AudioContext();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playClick() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
      } catch (e) {}
    }

    playFlip() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(560, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
      } catch (e) {}
    }

    playSuccess() {
      try {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);
          gain.gain.setValueAtTime(0.04, now + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.22);
        });
      } catch (e) {}
    }
  }

  const audio = new SoundEngine();

  // --- API ROUTING & OFFLINE BRIDGE ---
  const API_BASE = (window.location.protocol === 'file:') ? 'http://127.0.0.1:8880' : '';

  async function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    return fetch(url, options);
  }

  // --- STATE ---
  const state = {
    theme: localStorage.getItem('dexcards_theme') || 'light', // Light is default!
    currentView: 'viewStudy',
    dueCards: [],
    currentIndex: 0,
    isFlipped: false,
    currentDeckFilter: null,
    currentChapterFilter: null,
    currentTopicFilter: null,
    cardStartTime: Date.now(),
    serverStatus: null,
    srsSettings: null,
    stats: null
  };

  // --- DOM ELEMENTS ---
  const el = {
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),
    btnThemeLight: document.getElementById('btnThemeLight'),
    btnThemeDark: document.getElementById('btnThemeDark'),
    islandPulse: document.getElementById('islandPulse'),
    islandTitle: document.getElementById('islandTitle'),
    islandDueBadge: document.getElementById('islandDueBadge'),
    studyProgressText: document.getElementById('studyProgressText'),
    currentDeckName: document.getElementById('currentDeckName'),
    cardFlipper: document.getElementById('cardFlipper'),
    cardHierarchy: document.getElementById('cardHierarchy'),
    cardHierarchyBack: document.getElementById('cardHierarchyBack'),
    cardHealthPill: document.getElementById('cardHealthPill'),
    cardHealthText: document.getElementById('cardHealthText'),
    cardQuestion: document.getElementById('cardQuestion'),
    cardAnswer: document.getElementById('cardAnswer'),
    cardHintContainer: document.getElementById('cardHintContainer'),
    hintToggleBtn: document.getElementById('hintToggleBtn'),
    hintContent: document.getElementById('hintContent'),
    cardStreakText: document.getElementById('cardStreakText'),
    cardEaseVal: document.getElementById('cardEaseVal'),
    cardRepsVal: document.getElementById('cardRepsVal'),
    cardLapsesVal: document.getElementById('cardLapsesVal'),
    ratingControls: document.getElementById('ratingControls'),
    emptyStudyState: document.getElementById('emptyStudyState'),
    btnStudyAll: document.getElementById('btnStudyAll'),
    btnGoDecks: document.getElementById('btnGoDecks'),
    decksListContainer: document.getElementById('decksListContainer'),
    deckSearchInput: document.getElementById('deckSearchInput'),
    addDeckSelect: document.getElementById('addDeckSelect'),
    btnToggleNewDeck: document.getElementById('btnToggleNewDeck'),
    addNewDeckInput: document.getElementById('addNewDeckInput'),
    addChapterInput: document.getElementById('addChapterInput'),
    addTopicInput: document.getElementById('addTopicInput'),
    addFrontInput: document.getElementById('addFrontInput'),
    addBackInput: document.getElementById('addBackInput'),
    addHintInput: document.getElementById('addHintInput'),
    addTagsInput: document.getElementById('addTagsInput'),
    btnSaveCard: document.getElementById('btnSaveCard'),
    statsAvgHealth: document.getElementById('statsAvgHealth'),
    statsHealthLabel: document.getElementById('statsHealthLabel'),
    statsStreak: document.getElementById('statsStreak'),
    statsRetention: document.getElementById('statsRetention'),
    statsReviewCount: document.getElementById('statsReviewCount'),
    statsDueTomorrow: document.getElementById('statsDueTomorrow'),
    barMastered: document.getElementById('barMastered'),
    barHealthy: document.getElementById('barHealthy'),
    barStruggling: document.getElementById('barStruggling'),
    countMastered: document.getElementById('countMastered'),
    countHealthy: document.getElementById('countHealthy'),
    countStruggling: document.getElementById('countStruggling'),
    mcpStatusBadge: document.getElementById('mcpStatusBadge'),
    mcpProtocolBadge: document.getElementById('mcpProtocolBadge'),
    mcpBannerPulse: document.getElementById('mcpBannerPulse'),
    btnToggleMcp: document.getElementById('btnToggleMcp'),
    btnToggleMcpText: document.getElementById('btnToggleMcpText'),
    mcpJsonRpcUrl: document.getElementById('mcpJsonRpcUrl'),
    mcpSseUrl: document.getElementById('mcpSseUrl'),
    mcpHttpUrl: document.getElementById('mcpHttpUrl'),
    btnCopyMcpUrl: document.getElementById('btnCopyMcpUrl'),
    btnCopySseUrl: document.getElementById('btnCopySseUrl'),
    btnCopyHttpUrl: document.getElementById('btnCopyHttpUrl'),
    guideMcpUrlBox: document.getElementById('guideMcpUrlBox'),
    codeClaudeSnippet: document.getElementById('codeClaudeSnippet'),
    btnCopyClaudeSnippet: document.getElementById('btnCopyClaudeSnippet'),
    btnTestMcp: document.getElementById('btnTestMcp'),
    sliderStartingEase: document.getElementById('sliderStartingEase'),
    valStartingEase: document.getElementById('valStartingEase'),
    sliderLapsePenalty: document.getElementById('sliderLapsePenalty'),
    valLapsePenalty: document.getElementById('valLapsePenalty'),
    sliderSuccessBoost: document.getElementById('sliderSuccessBoost'),
    valSuccessBoost: document.getElementById('valSuccessBoost'),
    sliderHealthSensitivity: document.getElementById('sliderHealthSensitivity'),
    valHealthSensitivity: document.getElementById('valHealthSensitivity'),
    sliderEasyBonus: document.getElementById('sliderEasyBonus'),
    valEasyBonus: document.getElementById('valEasyBonus'),
    btnSaveSrsSettings: document.getElementById('btnSaveSrsSettings'),
    btnResetSrsSettings: document.getElementById('btnResetSrsSettings'),
    btnDisableBatteryOpt: document.getElementById('btnDisableBatteryOpt'),
    btnOpenBgSettings: document.getElementById('btnOpenBgSettings'),
    btnOpenAccessibility: document.getElementById('btnOpenAccessibility'),
    bgStatusBadge: document.getElementById('bgStatusBadge'),
    toastPill: document.getElementById('toastPill'),
    dockItems: document.querySelectorAll('.dock-item')
  };

  // --- INITIALIZATION ---
  async function init() {
    applyTheme(state.theme);
    setupThemeControls();
    setupNavigation();
    setupCardGestures();
    setupRatingButtons();
    setupSettingsControls();
    setupDeckExplorer();
    setupAddForm();
    setupKeyboardShortcuts();

    await loadServerStatus();
    await loadDueCards();
    await loadDecksHierarchy();
    await loadAnalytics();
    await loadSrsSettings();
  }

  // --- THEME MANAGEMENT ---
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('dexcards_theme', theme);
    const isDark = theme === 'dark';

    document.body.classList.toggle('dark-mode', isDark);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#07090e' : '#f1f5f9');
    }

    if (el.themeIconSun && el.themeIconMoon) {
      el.themeIconSun.style.display = isDark ? 'none' : 'block';
      el.themeIconMoon.style.display = isDark ? 'block' : 'none';
    }

    if (el.btnThemeLight && el.btnThemeDark) {
      el.btnThemeLight.classList.toggle('active', !isDark);
      el.btnThemeDark.classList.toggle('active', isDark);
    }
  }

  function setupThemeControls() {
    if (el.themeToggleBtn) {
      el.themeToggleBtn.addEventListener('click', () => {
        applyTheme(state.theme === 'light' ? 'dark' : 'light');
        audio.playClick();
        vibrate(10);
      });
    }

    if (el.btnThemeLight) {
      el.btnThemeLight.addEventListener('click', () => {
        applyTheme('light');
        audio.playClick();
      });
    }

    if (el.btnThemeDark) {
      el.btnThemeDark.addEventListener('click', () => {
        applyTheme('dark');
        audio.playClick();
      });
    }
  }

  // --- NAVIGATION ---
  function setupNavigation() {
    el.dockItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        switchView(targetView);
        audio.playClick();
        vibrate(10);
      });
    });

    el.btnGoDecks.addEventListener('click', () => switchView('viewDecks'));
    el.btnStudyAll.addEventListener('click', async () => {
      await loadAllCards();
      switchView('viewStudy');
    });
  }

  function switchView(viewId) {
    state.currentView = viewId;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));

    const panel = document.getElementById(viewId);
    if (panel) panel.classList.add('active');

    const dockItem = document.querySelector(`.dock-item[data-view="${viewId}"]`);
    if (dockItem) dockItem.classList.add('active');

    if (viewId === 'viewDecks') loadDecksHierarchy();
    if (viewId === 'viewStats') loadAnalytics();
    if (viewId === 'viewSettings') loadServerStatus();
  }

  // --- FLASHCARD & GESTURES ---
  function setupCardGestures() {
    el.cardFlipper.addEventListener('click', (e) => {
      if (e.target.closest('#hintToggleBtn') || e.target.closest('.card-meta-bar')) return;
      toggleFlip();
    });

    el.hintToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = el.hintContent.style.display === 'none';
      el.hintContent.style.display = isHidden ? 'block' : 'none';
      el.hintToggleBtn.querySelector('span').textContent = isHidden ? 'Hide Hint' : 'Show Hint';
      audio.playClick();
    });

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    el.cardFlipper.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    el.cardFlipper.addEventListener('touchend', (e) => {
      if (!state.isFlipped) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;
      const duration = Date.now() - startTime;

      if (duration > 500) return;

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) rateCurrentCard(1);
        else rateCurrentCard(3);
      } else if (Math.abs(diffY) > 60 && Math.abs(diffY) > Math.abs(diffX)) {
        if (diffY > 0) rateCurrentCard(2);
        else rateCurrentCard(4);
      }
    }, { passive: true });
  }

  function toggleFlip() {
    state.isFlipped = !state.isFlipped;
    if (state.isFlipped) {
      el.cardFlipper.classList.add('flipped');
      el.ratingControls.classList.add('active');
      audio.playFlip();
      vibrate(12);
    } else {
      el.cardFlipper.classList.remove('flipped');
      el.ratingControls.classList.remove('active');
      audio.playFlip();
      vibrate(8);
    }
  }

  function setupRatingButtons() {
    document.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rating = parseInt(btn.getAttribute('data-rating'), 10);
        rateCurrentCard(rating);
      });
    });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        toggleFlip();
      } else if (state.isFlipped && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const rating = parseInt(e.code.replace('Digit', ''), 10);
        rateCurrentCard(rating);
      }
    });
  }

  async function loadDueCards() {
    try {
      let url = '/api/due';
      const params = [];
      if (state.currentDeckFilter) params.push(`deckId=${encodeURIComponent(state.currentDeckFilter)}`);
      if (state.currentChapterFilter) params.push(`chapterName=${encodeURIComponent(state.currentChapterFilter)}`);
      if (state.currentTopicFilter) params.push(`topicName=${encodeURIComponent(state.currentTopicFilter)}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const res = await apiFetch(url);
      const data = await res.json();
      state.dueCards = data;
      try { localStorage.setItem('dexcards_cached_due', JSON.stringify(data)); } catch (_) {}
      state.currentIndex = 0;
      renderCurrentCard();
      updateTopIsland();
    } catch (err) {
      const cached = localStorage.getItem('dexcards_cached_due');
      if (cached) {
        try {
          state.dueCards = JSON.parse(cached);
          state.currentIndex = 0;
          renderCurrentCard();
          updateTopIsland();
        } catch (_) {}
      }
    }
  }

  async function loadAllCards() {
    try {
      const res = await apiFetch('/api/cards?limit=200');
      const data = await res.json();
      state.dueCards = data.cards || [];
      state.currentIndex = 0;
      renderCurrentCard();
      showToast(`Loaded ${state.dueCards.length} flashcards.`);
    } catch (err) {
      showToast('Error loading cards: ' + err.message);
    }
  }

  function renderCurrentCard() {
    state.isFlipped = false;
    el.cardFlipper.classList.remove('flipped');
    el.ratingControls.classList.remove('active');

    if (!state.dueCards || state.dueCards.length === 0 || state.currentIndex >= state.dueCards.length) {
      el.cardFlipper.style.display = 'none';
      el.ratingControls.style.display = 'none';
      el.emptyStudyState.style.display = 'flex';
      el.studyProgressText.textContent = '0 / 0';
      return;
    }

    el.cardFlipper.style.display = 'block';
    el.ratingControls.style.display = 'grid';
    el.emptyStudyState.style.display = 'none';

    const card = state.dueCards[state.currentIndex];
    state.cardStartTime = Date.now();

    const hierarchyText = `${card.deckName || 'General'} › ${card.chapterName || 'General'} › ${card.topicName || 'General'}`;
    el.cardHierarchy.textContent = hierarchyText;
    el.cardHierarchyBack.textContent = hierarchyText;

    const health = Math.round(card.healthScore || 70);
    el.cardHealthText.textContent = `${health}%`;
    if (health >= 80) {
      el.cardHealthPill.className = 'health-pill healthy';
    } else {
      el.cardHealthPill.className = 'health-pill';
    }

    el.cardQuestion.textContent = card.front;
    el.cardAnswer.textContent = card.back;

    if (card.hint && card.hint.trim()) {
      el.cardHintContainer.style.display = 'block';
      el.hintContent.style.display = 'none';
      el.hintContent.textContent = card.hint;
      el.hintToggleBtn.querySelector('span').textContent = 'Show Hint';
    } else {
      el.cardHintContainer.style.display = 'none';
    }

    el.cardStreakText.textContent = `Streak ${card.consecutiveCorrect || 0}`;
    el.cardEaseVal.textContent = Number(card.easeFactor || 2.50).toFixed(2);
    el.cardRepsVal.textContent = card.reps || 0;
    el.cardLapsesVal.textContent = card.lapses || 0;

    el.studyProgressText.textContent = `${state.currentIndex + 1} / ${state.dueCards.length}`;
  }

  async function rateCurrentCard(rating) {
    if (!state.dueCards || state.dueCards.length === 0) return;
    const card = state.dueCards[state.currentIndex];
    const timeTakenMs = Date.now() - state.cardStartTime;

    if (rating === 1) vibrate([30, 40, 30]);
    else {
      vibrate(15);
      audio.playSuccess();
    }

    try {
      const res = await apiFetch(`/api/cards/${card.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, timeTakenMs })
      });
      const data = await res.json();
      
      const scheduledIn = data?.scheduledInHours ? `${data.scheduledInHours} hours` : (data?.reviewResult?.scheduledInHuman || 'soon');
      showToast(`Next review in ${scheduledIn}`);

      state.currentIndex += 1;
      renderCurrentCard();
      updateTopIsland();
      loadAnalytics();
    } catch (err) {
      showToast('Error recording review: ' + err.message);
    }
  }

  function updateTopIsland() {
    const dueCount = state.dueCards.length - state.currentIndex;
    el.islandDueBadge.textContent = `${Math.max(0, dueCount)} DUE`;
  }

  // --- DECKS & TAXONOMY EXPLORER ---
  function setupDeckExplorer() {
    el.deckSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      filterDeckCards(q);
    });
  }

  async function loadDecksHierarchy() {
    try {
      const res = await apiFetch('/api/hierarchy');
      const decks = await res.json();
      try { localStorage.setItem('dexcards_cached_hierarchy', JSON.stringify(decks)); } catch (_) {}
      renderDecksList(decks);
      populateDeckSelector(decks);
    } catch (err) {
      const cached = localStorage.getItem('dexcards_cached_hierarchy');
      if (cached) {
        try {
          const decks = JSON.parse(cached);
          renderDecksList(decks);
          populateDeckSelector(decks);
        } catch (_) {}
      }
    }
  }

  function renderDecksList(decks) {
    el.decksListContainer.innerHTML = '';
    if (!decks || decks.length === 0) {
      el.decksListContainer.innerHTML = '<p class="empty-tip">No decks found. Create one to get started!</p>';
      return;
    }

    decks.forEach(deck => {
      const card = document.createElement('div');
      card.className = 'deck-tree-card';

      let chaptersHtml = '';
      if (deck.chapters && deck.chapters.length > 0) {
        chaptersHtml = '<div class="chapter-accordion">';
        deck.chapters.forEach(ch => {
          let topicsHtml = '<div class="topic-pills-row">';
          ch.topics.forEach(t => {
            topicsHtml += `
              <div class="topic-pill" data-deck-id="${deck.id}" data-chapter="${escapeHtml(ch.name)}" data-topic="${escapeHtml(t.name)}">
                <span class="topic-health-dot" style="background: ${getHealthColor(t.averageHealth)}"></span>
                <span>${escapeHtml(t.name)}</span>
                <span class="topic-count">(${t.cardCount})</span>
              </div>
            `;
          });
          topicsHtml += '</div>';

          chaptersHtml += `
            <div class="chapter-item">
              <div class="chapter-title">📂 ${escapeHtml(ch.name)}</div>
              ${topicsHtml}
            </div>
          `;
        });
        chaptersHtml += '</div>';
      }

      card.innerHTML = `
        <div class="deck-tree-header" data-deck-id="${deck.id}">
          <div class="deck-title-row">
            <div class="deck-icon-badge" style="background: ${deck.color}25; color: ${deck.color};">📚</div>
            <div>
              <div class="deck-name">${escapeHtml(deck.name)}</div>
              <div class="deck-meta-counts">${deck.totalCards} cards • Avg Health ${deck.averageHealth}%</div>
            </div>
          </div>
          <span class="deck-due-pill">${deck.dueCards} Due</span>
        </div>
        ${chaptersHtml}
      `;

      card.querySelector('.deck-tree-header').addEventListener('click', () => {
        state.currentDeckFilter = deck.id;
        state.currentChapterFilter = null;
        state.currentTopicFilter = null;
        el.currentDeckName.textContent = deck.name;
        loadDueCards();
        switchView('viewStudy');
        audio.playClick();
      });

      card.querySelectorAll('.topic-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          state.currentDeckFilter = pill.getAttribute('data-deck-id');
          state.currentChapterFilter = pill.getAttribute('data-chapter');
          state.currentTopicFilter = pill.getAttribute('data-topic');
          el.currentDeckName.textContent = `${pill.getAttribute('data-topic')}`;
          loadDueCards();
          switchView('viewStudy');
          audio.playClick();
        });
      });

      el.decksListContainer.appendChild(card);
    });
  }

  function filterDeckCards(query) {
    const cards = el.decksListContainer.querySelectorAll('.deck-tree-card');
    cards.forEach(c => {
      const text = c.textContent.toLowerCase();
      c.style.display = text.includes(query) ? 'block' : 'none';
    });
  }

  function populateDeckSelector(decks) {
    el.addDeckSelect.innerHTML = '';
    decks.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      el.addDeckSelect.appendChild(opt);
    });
  }

  // --- ADD FLASHCARD FORM ---
  function setupAddForm() {
    el.btnToggleNewDeck.addEventListener('click', () => {
      const isVisible = el.addNewDeckInput.style.display !== 'none';
      el.addNewDeckInput.style.display = isVisible ? 'none' : 'block';
      el.btnToggleNewDeck.textContent = isVisible ? '+ New' : 'Cancel';
      if (!isVisible) el.addNewDeckInput.focus();
    });

    el.btnSaveCard.addEventListener('click', async () => {
      const front = el.addFrontInput.value.trim();
      const back = el.addBackInput.value.trim();
      const hint = el.addHintInput.value.trim();
      const chapterName = el.addChapterInput.value.trim() || 'General';
      const topicName = el.addTopicInput.value.trim() || 'General';
      const tagsStr = el.addTagsInput.value.trim();
      const tags = tagsStr ? tagsStr.split(',').map(s => s.trim()) : [];

      if (!front || !back) {
        showToast('Please provide both question and answer.');
        return;
      }

      let deckId = el.addDeckSelect.value;
      let deckName = el.addDeckSelect.options[el.addDeckSelect.selectedIndex]?.text;

      if (el.addNewDeckInput.style.display !== 'none' && el.addNewDeckInput.value.trim()) {
        deckName = el.addNewDeckInput.value.trim();
        deckId = null;
      }

      try {
        const res = await apiFetch('/api/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            front,
            back,
            hint,
            deckId,
            deckName,
            chapterName,
            topicName,
            tags
          })
        });

        if (res.ok) {
          showToast('✓ Flashcard created!');
          audio.playSuccess();
          vibrate(20);

          el.addFrontInput.value = '';
          el.addBackInput.value = '';
          el.addHintInput.value = '';
          el.addTagsInput.value = '';

          await loadDueCards();
          await loadDecksHierarchy();
          switchView('viewStudy');
        } else {
          const err = await res.json();
          showToast('Failed to save card: ' + err.error);
        }
      } catch (err) {
        showToast('Error saving card: ' + err.message);
      }
    });
  }

  // --- ANALYTICS ---
  async function loadAnalytics() {
    try {
      const res = await apiFetch('/api/stats');
      const stats = await res.json();
      state.stats = stats;
      try { localStorage.setItem('dexcards_cached_stats', JSON.stringify(stats)); } catch (_) {}
      renderAnalyticsUi(stats);
    } catch (err) {
      const cached = localStorage.getItem('dexcards_cached_stats');
      if (cached) {
        try {
          const stats = JSON.parse(cached);
          renderAnalyticsUi(stats);
        } catch (_) {}
      }
    }
  }

  function renderAnalyticsUi(stats) {
    if (!stats) return;
    el.statsAvgHealth.textContent = `${stats.averageHealth}%`;
    el.statsStreak.textContent = `${stats.streakDays} Day${stats.streakDays > 1 ? 's' : ''}`;
    el.statsRetention.textContent = `${stats.retentionRate}%`;
    el.statsReviewCount.textContent = `${stats.totalReviews} Total Reviews`;
    el.statsDueTomorrow.textContent = stats.dueTomorrow;

    const total = Math.max(1, stats.totalCards);
    const pctMastered = Math.round((stats.masteredCards / total) * 100);
    const pctHealthy = Math.round((stats.healthyCards / total) * 100);
    const pctStruggling = Math.round((stats.strugglingCards / total) * 100);

    el.barMastered.style.width = `${pctMastered}%`;
    el.barHealthy.style.width = `${pctHealthy}%`;
    el.barStruggling.style.width = `${pctStruggling}%`;

    el.countMastered.textContent = stats.masteredCards;
    el.countHealthy.textContent = stats.healthyCards;
    el.countStruggling.textContent = stats.strugglingCards;
  }

  // --- SETTINGS & MCP HUB (START/STOP & INSTRUCTIONS) ---
  function setupSettingsControls() {
    // Copy URLs
    el.btnCopyMcpUrl.addEventListener('click', () => {
      copyToClipboard(el.mcpJsonRpcUrl.textContent);
      showToast('✓ Copied Gemini MCP URL!');
      audio.playClick();
      vibrate(10);
    });

    el.btnCopySseUrl.addEventListener('click', () => {
      copyToClipboard(el.mcpSseUrl.textContent);
      showToast('✓ Copied Gemini SSE Stream URL!');
      audio.playClick();
      vibrate(10);
    });

    el.btnCopyHttpUrl.addEventListener('click', () => {
      copyToClipboard(el.mcpHttpUrl.textContent);
      showToast('✓ Copied Local HTTP URL!');
      audio.playClick();
      vibrate(10);
    });

    el.btnCopyClaudeSnippet.addEventListener('click', () => {
      copyToClipboard(el.codeClaudeSnippet.textContent);
      showToast('✓ Copied Claude Desktop configuration!');
      audio.playClick();
      vibrate(10);
    });

    // Battery & Background Persistent Settings
    if (el.btnDisableBatteryOpt) {
      el.btnDisableBatteryOpt.addEventListener('click', () => {
        if (window.DexcardsBridge && window.DexcardsBridge.requestIgnoreBatteryOptimizations) {
          window.DexcardsBridge.requestIgnoreBatteryOptimizations();
          showToast('Requesting battery optimization exemption...');
        } else {
          showToast('In Android Settings › Apps › Dexcards › Battery › Set Unrestricted');
        }
        audio.playClick();
      });
    }

    if (el.btnOpenBgSettings) {
      el.btnOpenBgSettings.addEventListener('click', () => {
        if (window.DexcardsBridge && window.DexcardsBridge.openBackgroundSettings) {
          window.DexcardsBridge.openBackgroundSettings();
        } else {
          showToast('Opening Android App Settings...');
        }
        audio.playClick();
      });
    }

    if (el.btnOpenAccessibility) {
      el.btnOpenAccessibility.addEventListener('click', () => {
        if (window.DexcardsBridge && window.DexcardsBridge.openAccessibilitySettings) {
          window.DexcardsBridge.openAccessibilitySettings();
        } else {
          showToast('Opening Android Accessibility Settings...');
        }
        audio.playClick();
      });
    }

    if (window.DexcardsBridge && window.DexcardsBridge.isIgnoringBatteryOptimizations) {
      try {
        const isExempt = window.DexcardsBridge.isIgnoringBatteryOptimizations();
        if (isExempt && el.bgStatusBadge) {
          el.bgStatusBadge.textContent = 'PERSISTENT (EXEMPT)';
          el.bgStatusBadge.className = 'mcp-live-badge active';
        }
      } catch (_) {}
    }

    // Start / Stop Master Button
    el.btnToggleMcp.addEventListener('click', async () => {
      const isCurrentlyRunning = state.serverStatus?.status === 'running';
      const endpoint = isCurrentlyRunning ? '/api/mcp/stop' : '/api/mcp/start';
      try {
        if (window.DexcardsBridge) {
          if (isCurrentlyRunning) window.DexcardsBridge.stopMcp();
          else window.DexcardsBridge.startMcp();
        }
        const res = await apiFetch(endpoint, { method: 'POST' });
        const data = await res.json();
        state.serverStatus = data;
        updateMcpUi(data);
        showToast(isCurrentlyRunning ? 'MCP Server Stopped' : '✓ MCP Server Started on :8443');
        vibrate(20);
        audio.playClick();
      } catch (err) {
        showToast('Error toggling server: ' + err.message);
      }
    });

    // Test MCP Ping
    el.btnTestMcp.addEventListener('click', async () => {
      showToast('Testing MCP endpoint...');
      const start = Date.now();
      try {
        const res = await apiFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        });
        const duration = Date.now() - start;
        const data = await res.json();
        if (data.result && data.result.tools) {
          showToast(`✓ MCP Responsive in ${duration}ms (${data.result.tools.length} tools available)`);
          audio.playSuccess();
        } else {
          showToast('MCP error: ' + JSON.stringify(data.error));
        }
      } catch (err) {
        showToast('MCP test failed: ' + err.message);
      }
    });

    // Slider Listeners
    el.sliderStartingEase.addEventListener('input', (e) => el.valStartingEase.textContent = Number(e.target.value).toFixed(2));
    el.sliderLapsePenalty.addEventListener('input', (e) => el.valLapsePenalty.textContent = `-${e.target.value}%`);
    el.sliderSuccessBoost.addEventListener('input', (e) => el.valSuccessBoost.textContent = `+${e.target.value}%`);
    el.sliderHealthSensitivity.addEventListener('input', (e) => el.valHealthSensitivity.textContent = `${e.target.value}%`);
    el.sliderEasyBonus.addEventListener('input', (e) => el.valEasyBonus.textContent = `${Number(e.target.value).toFixed(2)}x`);

    // Save SRS Settings
    el.btnSaveSrsSettings.addEventListener('click', async () => {
      const srs = {
        startingEase: parseFloat(el.sliderStartingEase.value),
        lapsePenaltyHealth: parseFloat(el.sliderLapsePenalty.value),
        successBoostHealth: parseFloat(el.sliderSuccessBoost.value),
        healthIntervalSensitivity: parseFloat(el.sliderHealthSensitivity.value) / 100.0,
        easyBonus: parseFloat(el.sliderEasyBonus.value)
      };

      try {
        const res = await apiFetch('/api/settings/srs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(srs)
        });
        if (res.ok) {
          showToast('✓ SRS settings saved & synced to MCP!');
          audio.playSuccess();
        }
      } catch (err) {
        showToast('Failed to save settings: ' + err.message);
      }
    });

    // Reset Defaults
    el.btnResetSrsSettings.addEventListener('click', () => {
      el.sliderStartingEase.value = 2.50;
      el.valStartingEase.textContent = '2.50';
      el.sliderLapsePenalty.value = 25;
      el.valLapsePenalty.textContent = '-25%';
      el.sliderSuccessBoost.value = 15;
      el.valSuccessBoost.textContent = '+15%';
      el.sliderHealthSensitivity.value = 65;
      el.valHealthSensitivity.textContent = '65%';
      el.sliderEasyBonus.value = 1.35;
      el.valEasyBonus.textContent = '1.35x';
      showToast('Defaults loaded. Tap Save to apply.');
    });
  }

  async function loadServerStatus() {
    try {
      const res = await apiFetch('/api/mcp/status');
      const data = await res.json();
      state.serverStatus = data;
      updateMcpUi(data);
    } catch (err) {
      console.warn('Could not read server status:', err);
    }
  }

  function updateMcpUi(data) {
    if (!data) return;
    const isRunning = data.status === 'running';

    el.mcpStatusBadge.textContent = isRunning ? 'MCP ACTIVE' : 'MCP STOPPED';
    el.mcpStatusBadge.className = isRunning ? 'status-pill-lg' : 'status-pill-lg stopped';
    el.islandPulse.className = isRunning ? 'pulse-indicator live' : 'pulse-indicator stopped';
    el.mcpBannerPulse.className = isRunning ? 'pulse-indicator live' : 'pulse-indicator stopped';
    el.islandTitle.textContent = isRunning ? `MCP LIVE :${data.httpsPort || 8443}` : 'MCP STOPPED';

    el.btnToggleMcpText.textContent = isRunning ? 'STOP MCP SERVER' : 'START MCP SERVER';
    el.btnToggleMcp.className = isRunning ? 'glass-btn danger mcp-master-btn' : 'glass-btn primary mcp-master-btn';

    if (data.urls) {
      el.mcpJsonRpcUrl.textContent = data.urls.mcpJsonRpcHttps;
      el.mcpSseUrl.textContent = data.urls.mcpSseHttps;
      el.mcpHttpUrl.textContent = data.urls.webHttp;
      el.guideMcpUrlBox.textContent = data.urls.mcpJsonRpcHttps;
      el.codeClaudeSnippet.textContent = JSON.stringify({
        mcpServers: {
          dexcards: {
            url: data.urls.mcpSseHttps
          }
        }
      }, null, 2);
    }
  }

  async function loadSrsSettings() {
    try {
      const res = await apiFetch('/api/settings');
      const data = await res.json();
      state.srsSettings = data.srs;

      if (data.srs) {
        el.sliderStartingEase.value = data.srs.startingEase || 2.50;
        el.valStartingEase.textContent = Number(data.srs.startingEase || 2.50).toFixed(2);
        el.sliderLapsePenalty.value = data.srs.lapsePenaltyHealth || 25;
        el.valLapsePenalty.textContent = `-${data.srs.lapsePenaltyHealth || 25}%`;
        el.sliderSuccessBoost.value = data.srs.successBoostHealth || 15;
        el.valSuccessBoost.textContent = `+${data.srs.successBoostHealth || 15}%`;
        el.sliderHealthSensitivity.value = Math.round((data.srs.healthIntervalSensitivity ?? 0.65) * 100);
        el.valHealthSensitivity.textContent = `${el.sliderHealthSensitivity.value}%`;
        el.sliderEasyBonus.value = data.srs.easyBonus || 1.35;
        el.valEasyBonus.textContent = `${Number(data.srs.easyBonus || 1.35).toFixed(2)}x`;
      }
    } catch (err) {
      console.warn('Could not load SRS settings:', err);
    }
  }

  // --- UTILS ---
  function showToast(msg) {
    el.toastPill.textContent = msg;
    el.toastPill.classList.add('show');
    setTimeout(() => {
      el.toastPill.classList.remove('show');
    }, 2800);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  }

  function vibrate(ms) {
    try {
      if (window.DexcardsBridge && window.DexcardsBridge.vibrate) {
        window.DexcardsBridge.vibrate(Array.isArray(ms) ? ms[0] : ms);
      } else if (navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch (e) {}
  }

  function getHealthColor(h) {
    if (h >= 80) return '#059669';
    if (h >= 50) return '#d97706';
    return '#e11d48';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', init);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
