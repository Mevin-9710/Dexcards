import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { SrsEngine, DEFAULT_SRS_SETTINGS } from './srsEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In serverless / Vercel, the only writable directory is os.tmpdir()
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'dexcards_data')
  : BUNDLED_DATA_DIR;

export class FlashcardDatabase {
  constructor(dataDir = DATA_DIR) {
    this.dataDir = dataDir;
    this.cardsFile = path.join(dataDir, 'flashcards.json');
    this.settingsFile = path.join(dataDir, 'settings.json');
    this.srsEngine = new SrsEngine();
    this.data = {
      decks: [],
      cards: [],
      stats: {
        totalReviews: 0,
        correctCount: 0,
        incorrectCount: 0,
        currentStreakDays: 1,
        lastStudyDate: null
      }
    };
    this.settings = {
      srs: { ...DEFAULT_SRS_SETTINGS },
      server: {
        httpPort: 8880,
        httpsPort: 8443,
        useHttps: true,
        host: '0.0.0.0',
        apiToken: ''
      }
    };

    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[DB] Cannot create dataDir (serverless read-only mode):', err.message);
    }

    // Try loading settings: first from target dir, fallback to bundled dir
    const settingsSource = fs.existsSync(this.settingsFile)
      ? this.settingsFile
      : path.join(BUNDLED_DATA_DIR, 'settings.json');

    if (fs.existsSync(settingsSource)) {
      try {
        const raw = fs.readFileSync(settingsSource, 'utf8');
        const parsed = JSON.parse(raw);
        this.settings = {
          ...this.settings,
          ...parsed,
          srs: { ...this.settings.srs, ...(parsed.srs || {}) },
          server: { ...this.settings.server, ...(parsed.server || {}) }
        };
        this.srsEngine.updateSettings(this.settings.srs);
      } catch (err) {
        console.warn('Warning: Could not parse settings.json, using defaults:', err.message);
      }
    } else {
      this.saveSettings();
    }

    // Try loading cards: first from target dir, fallback to bundled dir
    const cardsSource = fs.existsSync(this.cardsFile)
      ? this.cardsFile
      : path.join(BUNDLED_DATA_DIR, 'flashcards.json');

    if (fs.existsSync(cardsSource)) {
      try {
        const raw = fs.readFileSync(cardsSource, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.warn('Warning: Could not parse flashcards.json, seeding starter decks:', err.message);
        this.seedStarterDecks();
      }
    } else {
      this.seedStarterDecks();
    }
  }

  saveData() {
    try {
      const tmpFile = `${this.cardsFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.cardsFile);
    } catch (err) {
      console.warn('[DB] Storage write bypassed (in-memory mode for serverless):', err.message);
    }
  }

  saveSettings() {
    try {
      const tmpFile = `${this.settingsFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.settings, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.settingsFile);
    } catch (err) {
      console.warn('[DB] Settings write bypassed (in-memory mode for serverless):', err.message);
    }
  }

  // --- SETTINGS API ---
  getSettings() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  updateSrsSettings(newSrsSettings) {
    this.settings.srs = this.srsEngine.updateSettings(newSrsSettings);
    this.saveSettings();
    return this.settings.srs;
  }

  updateServerSettings(newServerSettings) {
    this.settings.server = { ...this.settings.server, ...newServerSettings };
    this.saveSettings();
    return this.settings.server;
  }

  // --- HIERARCHY / DECKS / CHAPTERS / TOPICS ---
  getHierarchy() {
    const hierarchy = [];
    const deckMap = new Map();

    for (const d of this.data.decks) {
      deckMap.set(d.id, {
        id: d.id,
        name: d.name,
        description: d.description || '',
        color: d.color || '#6366f1',
        icon: d.icon || 'layers',
        chapters: []
      });
    }

    for (const card of this.data.cards) {
      if (!deckMap.has(card.deckId)) {
        deckMap.set(card.deckId, {
          id: card.deckId,
          name: card.deckName || 'General',
          description: '',
          color: '#6366f1',
          icon: 'layers',
          chapters: []
        });
      }
      const deck = deckMap.get(card.deckId);
      
      let chapter = deck.chapters.find(c => c.name === (card.chapterName || 'General'));
      if (!chapter) {
        chapter = {
          name: card.chapterName || 'General',
          topics: []
        };
        deck.chapters.push(chapter);
      }

      let topic = chapter.topics.find(t => t.name === (card.topicName || 'General'));
      if (!topic) {
        topic = {
          name: card.topicName || 'General',
          cardCount: 0,
          dueCount: 0,
          averageHealth: 0,
          cards: []
        };
        chapter.topics.push(topic);
      }

      topic.cardCount += 1;
      if (this.srsEngine.isCardDue(card)) {
        topic.dueCount += 1;
      }
      topic.cards.push(card.id);
    }

    // Compute health metrics per topic/deck
    for (const deck of deckMap.values()) {
      let deckTotalCards = 0;
      let deckDueCards = 0;
      let deckTotalHealth = 0;

      for (const chapter of deck.chapters) {
        for (const topic of chapter.topics) {
          deckTotalCards += topic.cardCount;
          deckDueCards += topic.dueCount;
          const topicCards = this.data.cards.filter(c => topic.cards.includes(c.id));
          const avgH = topicCards.length > 0 
            ? Math.round(topicCards.reduce((acc, c) => acc + (c.healthScore || 70), 0) / topicCards.length) 
            : 70;
          topic.averageHealth = avgH;
          deckTotalHealth += (avgH * topic.cardCount);
          delete topic.cards; // Clean payload
        }
      }

      hierarchy.push({
        ...deck,
        totalCards: deckTotalCards,
        dueCards: deckDueCards,
        averageHealth: deckTotalCards > 0 ? Math.round(deckTotalHealth / deckTotalCards) : 70
      });
    }

    return hierarchy;
  }

  createDeck(name, description = '', color = '#3b82f6', icon = 'folder') {
    const existing = this.data.decks.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const newDeck = {
      id: `deck_${crypto.randomUUID().slice(0, 8)}`,
      name,
      description,
      color,
      icon,
      createdAt: new Date().toISOString()
    };
    this.data.decks.push(newDeck);
    this.saveData();
    return newDeck;
  }

  // --- CARDS CRUD ---
  addCard({
    front,
    back,
    hint = '',
    deckId,
    deckName,
    chapterName = 'General',
    topicName = 'General',
    tags = [],
    initialDifficulty = 0.3
  }) {
    if (!front || !back) {
      throw new Error('Flashcard front (question) and back (answer) are required.');
    }

    // Resolve or create deck
    let resolvedDeckId = deckId;
    let resolvedDeckName = deckName;
    if (!resolvedDeckId && resolvedDeckName) {
      const d = this.createDeck(resolvedDeckName);
      resolvedDeckId = d.id;
    } else if (resolvedDeckId && !resolvedDeckName) {
      const d = this.data.decks.find(x => x.id === resolvedDeckId);
      resolvedDeckName = d ? d.name : 'General';
    } else if (!resolvedDeckId && !resolvedDeckName) {
      if (this.data.decks.length > 0) {
        resolvedDeckId = this.data.decks[0].id;
        resolvedDeckName = this.data.decks[0].name;
      } else {
        const d = this.createDeck('Default Deck');
        resolvedDeckId = d.id;
        resolvedDeckName = d.name;
      }
    }

    const srsDefaults = this.srsEngine.initCardSrs();
    if (initialDifficulty) srsDefaults.difficulty = initialDifficulty;

    const newCard = {
      id: `card_${crypto.randomUUID().slice(0, 10)}`,
      front: front.trim(),
      back: back.trim(),
      hint: (hint || '').trim(),
      deckId: resolvedDeckId,
      deckName: resolvedDeckName,
      chapterName: chapterName.trim() || 'General',
      topicName: topicName.trim() || 'General',
      tags: Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()) : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...srsDefaults
    };

    this.data.cards.push(newCard);
    this.saveData();
    return newCard;
  }

  batchAddCards(cardsArray) {
    if (!Array.isArray(cardsArray) || cardsArray.length === 0) {
      return [];
    }
    const created = [];
    for (const item of cardsArray) {
      created.push(this.addCard(item));
    }
    return created;
  }

  getCard(id) {
    return this.data.cards.find(c => c.id === id) || null;
  }

  updateCard(id, updates) {
    const card = this.getCard(id);
    if (!card) throw new Error(`Card with ID ${id} not found.`);

    if (updates.front !== undefined) card.front = updates.front.trim();
    if (updates.back !== undefined) card.back = updates.back.trim();
    if (updates.hint !== undefined) card.hint = updates.hint.trim();
    if (updates.chapterName !== undefined) card.chapterName = updates.chapterName.trim();
    if (updates.topicName !== undefined) card.topicName = updates.topicName.trim();
    if (updates.deckId !== undefined) {
      card.deckId = updates.deckId;
      const d = this.data.decks.find(x => x.id === updates.deckId);
      if (d) card.deckName = d.name;
    }
    if (updates.tags !== undefined) {
      card.tags = Array.isArray(updates.tags) ? updates.tags.map(t => t.trim().toLowerCase()) : [];
    }
    if (updates.healthScore !== undefined) card.healthScore = Number(updates.healthScore);
    if (updates.easeFactor !== undefined) card.easeFactor = Number(updates.easeFactor);

    card.updatedAt = new Date().toISOString();
    this.saveData();
    return card;
  }

  deleteCard(id) {
    const idx = this.data.cards.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.data.cards.splice(idx, 1);
    this.saveData();
    return true;
  }

  // --- REVIEW FLOW ---
  reviewCard(id, rating, timeTakenMs = 0) {
    const card = this.getCard(id);
    if (!card) throw new Error(`Card with ID ${id} not found.`);

    const reviewResult = this.srsEngine.calculateReview(card, rating, timeTakenMs);
    
    // Merge updated SRS state back into card
    Object.assign(card, reviewResult.updatedSrs);
    card.updatedAt = new Date().toISOString();

    // Global study metrics update
    this.data.stats.totalReviews = (this.data.stats.totalReviews || 0) + 1;
    if (reviewResult.historyEntry.rating > 1) {
      this.data.stats.correctCount = (this.data.stats.correctCount || 0) + 1;
    } else {
      this.data.stats.incorrectCount = (this.data.stats.incorrectCount || 0) + 1;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (this.data.stats.lastStudyDate !== todayStr) {
      // Check streak continuity
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (this.data.stats.lastStudyDate === yesterday) {
        this.data.stats.currentStreakDays = (this.data.stats.currentStreakDays || 0) + 1;
      } else if (!this.data.stats.lastStudyDate) {
        this.data.stats.currentStreakDays = 1;
      } else {
        this.data.stats.currentStreakDays = 1;
      }
      this.data.stats.lastStudyDate = todayStr;
    }

    this.saveData();
    return {
      card,
      reviewResult
    };
  }

  // --- QUERY & FILTERING ---
  listCards({
    deckId,
    chapterName,
    topicName,
    tag,
    search,
    status = 'all', // 'all' | 'due' | 'new' | 'struggling' | 'mastered'
    limit = 100,
    offset = 0
  } = {}) {
    let result = [...this.data.cards];
    const now = new Date();

    if (deckId) {
      result = result.filter(c => c.deckId === deckId);
    }
    if (chapterName) {
      result = result.filter(c => c.chapterName.toLowerCase() === chapterName.toLowerCase());
    }
    if (topicName) {
      result = result.filter(c => c.topicName.toLowerCase() === topicName.toLowerCase());
    }
    if (tag) {
      const lowerTag = tag.toLowerCase();
      result = result.filter(c => c.tags && c.tags.includes(lowerTag));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => 
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        (c.hint && c.hint.toLowerCase().includes(q)) ||
        c.chapterName.toLowerCase().includes(q) ||
        c.topicName.toLowerCase().includes(q) ||
        (c.tags && c.tags.some(t => t.includes(q)))
      );
    }

    if (status === 'due') {
      result = result.filter(c => this.srsEngine.isCardDue(c, now));
    } else if (status === 'new') {
      result = result.filter(c => c.totalReviews === 0);
    } else if (status === 'struggling') {
      result = result.filter(c => c.healthScore < 50);
    } else if (status === 'mastered') {
      result = result.filter(c => c.healthScore >= 85 && c.reps >= 3);
    }

    // Sort due cards first by priority (lowest health first, oldest due date first)
    result.sort((a, b) => {
      const aDue = this.srsEngine.isCardDue(a, now);
      const bDue = this.srsEngine.isCardDue(b, now);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      // Both due or both not due: prioritize lower health
      if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
      return new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime();
    });

    const total = result.length;
    const paginated = result.slice(offset, offset + limit);

    return {
      total,
      cards: paginated,
      limit,
      offset
    };
  }

  getDueCards({ deckId, chapterName, topicName, limit = 50 } = {}) {
    return this.listCards({
      deckId,
      chapterName,
      topicName,
      status: 'due',
      limit
    }).cards;
  }

  // --- ANALYTICS & STATS ---
  getAnalytics() {
    const totalCards = this.data.cards.length;
    const now = new Date();
    const dueCount = this.data.cards.filter(c => this.srsEngine.isCardDue(c, now)).length;

    let strugglingCount = 0;
    let healthyCount = 0;
    let masteredCount = 0;
    let totalHealthSum = 0;

    for (const c of this.data.cards) {
      const h = c.healthScore || 70;
      totalHealthSum += h;
      if (h < 50) strugglingCount += 1;
      else if (h >= 85 && (c.reps || 0) >= 3) masteredCount += 1;
      else healthyCount += 1;
    }

    const avgHealth = totalCards > 0 ? Math.round(totalHealthSum / totalCards) : 100;
    const totalRev = this.data.stats.totalReviews || 0;
    const correctRev = this.data.stats.correctCount || 0;
    const retentionRate = totalRev > 0 ? Math.round((correctRev / totalRev) * 100) : 100;

    // Upcoming forecast
    const dueTomorrow = this.data.cards.filter(c => {
      if (!c.nextReviewDate) return false;
      const t = new Date(c.nextReviewDate).getTime();
      return t > now.getTime() && t <= (now.getTime() + 86400000);
    }).length;

    const dueNext7Days = this.data.cards.filter(c => {
      if (!c.nextReviewDate) return false;
      const t = new Date(c.nextReviewDate).getTime();
      return t > now.getTime() && t <= (now.getTime() + 7 * 86400000);
    }).length;

    return {
      totalCards,
      dueCount,
      dueTomorrow,
      dueNext7Days,
      averageHealth: avgHealth,
      retentionRate,
      strugglingCards: strugglingCount,
      healthyCards: healthyCount,
      masteredCards: masteredCount,
      totalReviews: totalRev,
      correctCount: correctRev,
      incorrectCount: this.data.stats.incorrectCount || 0,
      streakDays: this.data.stats.currentStreakDays || 1,
      lastStudyDate: this.data.stats.lastStudyDate
    };
  }

  // --- PRE-LOADED STARTER DECKS ---
  seedStarterDecks() {
    this.data.decks = [
      {
        id: 'deck_cs_sys',
        name: 'Computer Science & Distributed Systems',
        description: 'Core concepts in system design, networking, concurrency, and architecture.',
        color: '#6366f1',
        icon: 'cpu',
        createdAt: new Date().toISOString()
      },
      {
        id: 'deck_mcp_ai',
        name: 'Model Context Protocol (MCP) & Agents',
        description: 'Complete architecture of MCP servers, tools, SSE transports, and agent integration.',
        color: '#06b6d4',
        icon: 'sparkles',
        createdAt: new Date().toISOString()
      },
      {
        id: 'deck_spanish',
        name: 'Spanish: High-Frequency Vocabulary',
        description: 'Essential phrases, idioms, and conversational grammar.',
        color: '#f59e0b',
        icon: 'globe',
        createdAt: new Date().toISOString()
      }
    ];

    const sampleCards = [
      // CS Deck
      {
        front: 'What is the CAP Theorem and what does it state?',
        back: 'In a distributed data store, it is impossible to simultaneously provide more than two of three guarantees:\n• **Consistency (C)**: Every read receives the most recent write or an error.\n• **Availability (A)**: Every request receives a non-error response, without guarantee that it contains the most recent write.\n• **Partition Tolerance (P)**: The system continues to operate despite an arbitrary number of messages being dropped or delayed by the network.',
        hint: 'Think about network partitions (P) in real-world distributed systems.',
        deckId: 'deck_cs_sys',
        deckName: 'Computer Science & Distributed Systems',
        chapterName: 'Distributed Systems',
        topicName: 'Consistency Models',
        tags: ['distributed-systems', 'architecture', 'interview']
      },
      {
        front: 'How does Server-Sent Events (SSE) differ from WebSockets?',
        back: '• **SSE**: Unidirectional (server-to-client streaming) over standard HTTP. Built-in reconnection, event IDs, and polyfillable. Works easily with HTTP/2 and standard proxies.\n• **WebSockets**: Full-duplex (bidirectional) over a dedicated TCP upgrade. Requires custom ping/pong framing and specialized load balancer support.',
        hint: 'Unidirectional vs Full Duplex; HTTP vs TCP Upgrade.',
        deckId: 'deck_cs_sys',
        deckName: 'Computer Science & Distributed Systems',
        chapterName: 'Networking & Protocols',
        topicName: 'Real-time Transports',
        tags: ['networking', 'sse', 'websockets']
      },
      {
        front: 'What is Epoll in Linux and why is it O(1) compared to select/poll O(N)?',
        back: '`select` and `poll` require linear scanning of all watched file descriptors on every event. `epoll` registers descriptors in a red-black tree in kernel space and uses a ready list with callback mechanisms. When an I/O event occurs, the kernel places the descriptor on the ready list, allowing the process to poll only active events in O(1) time.',
        hint: 'Kernel-space readiness queue vs linear array scan.',
        deckId: 'deck_cs_sys',
        deckName: 'Computer Science & Distributed Systems',
        chapterName: 'Linux Kernel & I/O',
        topicName: 'Async I/O Primitives',
        tags: ['linux', 'performance', 'epoll']
      },
      // MCP Deck
      {
        front: 'What are the core primitives exposed by an MCP Server?',
        back: 'An MCP Server exposes three primary primitives to LLM clients:\n1. **Tools**: Executable functions that allow models to perform actions (e.g., query database, create flashcard).\n2. **Resources**: Passive data sources (similar to file or URL reads) providing context to models.\n3. **Prompts**: Pre-configured prompt templates and multi-step workflows.',
        hint: 'Tools, Resources, and Prompts.',
        deckId: 'deck_mcp_ai',
        deckName: 'Model Context Protocol (MCP) & Agents',
        chapterName: 'MCP Architecture',
        topicName: 'Primitives',
        tags: ['mcp', 'llm', 'tools']
      },
      {
        front: 'How does MCP over HTTP/SSE handle bidirectional communication?',
        back: '1. The client opens an SSE stream via `GET /sse` to receive server-sent JSON-RPC messages and an initial `endpoint` URI.\n2. The client sends JSON-RPC requests (tool calls, initializations) via `POST` to that endpoint (e.g. `/messages?sessionId=...`).\n3. The server emits JSON-RPC responses and notifications back through the active SSE stream.',
        hint: 'GET for receiving stream, POST for sending requests.',
        deckId: 'deck_mcp_ai',
        deckName: 'Model Context Protocol (MCP) & Agents',
        chapterName: 'Transports',
        topicName: 'HTTP & SSE Specification',
        tags: ['mcp', 'sse', 'json-rpc']
      },
      // Spanish Deck
      {
        front: 'How do you say "I would like to know more about this" in Spanish?',
        back: '• **"Me gustaría saber más sobre esto."**\n\n*Breakdown*:\n• *Me gustaría*: Conditional form of gustar (I would like)\n• *saber*: to know (information/facts)\n• *más sobre esto*: more about this',
        hint: 'Conditional of gustar + saber.',
        deckId: 'deck_spanish',
        deckName: 'Spanish: High-Frequency Vocabulary',
        chapterName: 'Conversational Fluency',
        topicName: 'Opinions & Inquiries',
        tags: ['spanish', 'phrases', 'intermediate']
      }
    ];

    this.data.cards = [];
    for (const card of sampleCards) {
      const srsDefaults = this.srsEngine.initCardSrs();
      this.data.cards.push({
        id: `card_${crypto.randomUUID().slice(0, 10)}`,
        front: card.front,
        back: card.back,
        hint: card.hint,
        deckId: card.deckId,
        deckName: card.deckName,
        chapterName: card.chapterName,
        topicName: card.topicName,
        tags: card.tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...srsDefaults
      });
    }

    this.saveData();
  }
}
