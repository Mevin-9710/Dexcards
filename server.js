import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { fileURLToPath } from 'node:url';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { FlashcardDatabase } from './db.js';
import { createFlashcardMcpServer } from './mcpServer.js';
import { CertManager } from './certManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

export class FlashcardServer {
  constructor(options = {}) {
    this.db = options.db || new FlashcardDatabase();
    this.certManager = new CertManager();
    this.mcpServer = createFlashcardMcpServer(this.db);
    this.sseTransports = new Map(); // sessionId -> SSEServerTransport

    this.settings = this.db.getSettings();
    this.httpPort = options.httpPort || this.settings.server.httpPort || 8880;
    this.httpsPort = options.httpsPort || this.settings.server.httpsPort || 8443;
    this.host = options.host || this.settings.server.host || '0.0.0.0';

    this.httpServer = null;
    this.httpsServer = null;
    this.isMcpActive = true;
    this.startedAt = null;
  }

  async start() {
    // 1. Prepare TLS certificates
    const tlsCreds = await this.certManager.ensureCertificates();
    this.tlsFingerprint = tlsCreds.fingerprint;

    // 2. Request router function
    const requestHandler = (req, res) => this.handleRequest(req, res);

    // 3. Start HTTP Server (for local web dashboard and local HTTP clients)
    this.httpServer = http.createServer(requestHandler);
    await new Promise((resolve, reject) => {
      this.httpServer.listen(this.httpPort, this.host, () => {
        console.log(`[HTTP] Flashcard Server running on http://${this.host}:${this.httpPort}`);
        resolve();
      }).on('error', reject);
    });

    // 4. Start HTTPS Server (for Gemini, secure MCP SSE, and remote TLS clients)
    const httpsOptions = {
      key: tlsCreds.key,
      cert: tlsCreds.cert
    };

    this.httpsServer = https.createServer(httpsOptions, requestHandler);
    await new Promise((resolve, reject) => {
      this.httpsServer.listen(this.httpsPort, this.host, () => {
        console.log(`[HTTPS] Flashcard MCP Server running on https://${this.host}:${this.httpsPort}`);
        resolve();
      }).on('error', reject);
    });

    this.startedAt = new Date().toISOString();
    return this.getStatus();
  }

  async stop() {
    this.isMcpActive = false;
    if (this.httpServer) {
      await new Promise(r => this.httpServer.close(r));
      this.httpServer = null;
    }
    if (this.httpsServer) {
      await new Promise(r => this.httpsServer.close(r));
      this.httpsServer = null;
    }
    console.log('[Server] Flashcard servers stopped.');
  }

  getStatus() {
    const ips = this.certManager.getAvailableIps();
    const primaryIp = ips.find(ip => ip !== '127.0.0.1' && ip !== 'localhost') || '127.0.0.1';

    return {
      status: (this.httpServer || this.httpsServer) && this.isMcpActive ? 'running' : 'stopped',
      startedAt: this.startedAt,
      httpPort: this.httpPort,
      httpsPort: this.httpsPort,
      host: this.host,
      ips,
      primaryIp,
      tlsFingerprint: this.tlsFingerprint,
      urls: {
        webHttp: `http://${primaryIp}:${this.httpPort}`,
        webHttps: `https://${primaryIp}:${this.httpsPort}`,
        localHttp: `http://localhost:${this.httpPort}`,
        localHttps: `https://localhost:${this.httpsPort}`,
        mcpSseHttps: `https://${primaryIp}:${this.httpsPort}/sse`,
        mcpJsonRpcHttps: `https://${primaryIp}:${this.httpsPort}/mcp`,
        mcpSseHttp: `http://${primaryIp}:${this.httpPort}/sse`,
        mcpJsonRpcHttp: `http://${primaryIp}:${this.httpPort}/mcp`
      },
      stats: this.db.getAnalytics()
    };
  }

  // --- CORE REQUEST ROUTER ---
  async handleRequest(req, res) {
    // Enable CORS for all origins, required for Gemini and Web MCP clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-id, mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    try {
      // 1. MCP SSE ENDPOINTS
      if ((pathname === '/sse' || pathname === '/api/sse') && req.method === 'GET') {
        return await this.handleMcpSse(req, res);
      }
      if ((pathname === '/message' || pathname === '/messages' || pathname === '/api/message' || pathname === '/api/messages') && req.method === 'POST') {
        return await this.handleMcpPostMessage(req, res, parsedUrl);
      }

      // 2. DIRECT MCP JSON-RPC 2.0 ENDPOINT (HTTP Transport)
      if ((pathname === '/mcp' || pathname === '/api/mcp' || pathname === '/api/index.js') && req.method === 'POST') {
        return await this.handleMcpDirectJsonRpc(req, res);
      }

      // Base API status check
      if ((pathname === '/api' || pathname === '/api/index.js') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStatus()));
        return;
      }

      // 3. CERTIFICATE DOWNLOADS
      if (pathname === '/cert' || pathname === '/api/mcp/cert') {
        const pem = await this.certManager.getCertificatePem();
        res.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Content-Disposition': 'attachment; filename="lumino-flashcards-ca.crt"'
        });
        res.end(pem);
        return;
      }
      if (pathname === '/cert.pem' || pathname === '/api/mcp/cert.pem') {
        const pem = await this.certManager.getCertificatePem();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(pem);
        return;
      }

      // 4. REST API ENDPOINTS
      if (pathname.startsWith('/api/')) {
        return await this.handleRestApi(req, res, pathname, parsedUrl.query);
      }

      // 5. STATIC FILES (Mobile Liquid Glass UI)
      return this.serveStatic(req, res, pathname);
    } catch (err) {
      console.error(`[Error] ${req.method} ${pathname}:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  }

  // --- MCP PROTOCOL IMPLEMENTATION ---
  async handleMcpSse(req, res) {
    if (!this.isMcpActive) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'MCP server is currently stopped in settings.' }));
      return;
    }

    console.log('[MCP] Client connected via SSE');
    // Note: transport endpoint is relative or absolute URL for incoming client POST messages
    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    this.sseTransports.set(sessionId, transport);

    req.on('close', () => {
      console.log(`[MCP] SSE client disconnected (Session: ${sessionId})`);
      this.sseTransports.delete(sessionId);
    });

    await this.mcpServer.connect(transport);
  }

  async handleMcpPostMessage(req, res, parsedUrl) {
    if (!this.isMcpActive) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'MCP server is stopped.' }));
      return;
    }

    const sessionId = parsedUrl.query.sessionId || req.headers['x-session-id'] || req.headers['mcp-session-id'];
    const transport = this.sseTransports.get(sessionId);

    if (!transport) {
      // Fallback: If no session found or client connects statelessly, handle via direct JSON-RPC
      return await this.handleMcpDirectJsonRpc(req, res);
    }

    await transport.handlePostMessage(req, res);
  }

  async handleMcpDirectJsonRpc(req, res) {
    const body = await this.readJsonBody(req);
    const { id, method, params } = body || {};

    if (!method) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: method is missing' } }));
      return;
    }

    try {
      let result = null;

      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: 'flashcard-mcp',
              version: '1.0.0'
            }
          };
          break;

        case 'notifications/initialized':
          result = {};
          break;

        case 'ping':
          result = {};
          break;

        case 'tools/list': {
          // List registered tools
          result = {
            tools: [
              {
                name: 'list_decks_and_topics',
                description: 'Browse the hierarchical taxonomy of decks, chapters, topics, card counts, and average memory health.',
                inputSchema: { type: 'object', properties: {} }
              },
              {
                name: 'create_deck',
                description: 'Create a new deck or collection for organizing flashcards.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    color: { type: 'string' },
                    icon: { type: 'string' }
                  },
                  required: ['name']
                }
              },
              {
                name: 'create_flashcard',
                description: 'Create a new flashcard with question, answer, hint, and hierarchical chapter/topic organization.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    front: { type: 'string' },
                    back: { type: 'string' },
                    hint: { type: 'string' },
                    deckName: { type: 'string' },
                    chapterName: { type: 'string' },
                    topicName: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['front', 'back']
                }
              },
              {
                name: 'batch_create_flashcards',
                description: 'Create multiple flashcards at once.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    cards: { type: 'array' }
                  },
                  required: ['cards']
                }
              },
              {
                name: 'get_flashcard',
                description: 'Retrieve a specific flashcard by ID with review history.',
                inputSchema: {
                  type: 'object',
                  properties: { cardId: { type: 'string' } },
                  required: ['cardId']
                }
              },
              {
                name: 'get_due_flashcards',
                description: 'Fetch flashcards currently due for spaced repetition review.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deckId: { type: 'string' },
                    chapterName: { type: 'string' },
                    topicName: { type: 'string' },
                    limit: { type: 'number' }
                  }
                }
              },
              {
                name: 'review_flashcard',
                description: 'Record a study review rating (again/1, hard/2, good/3, easy/4) and recalculate interval and memory health.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    cardId: { type: 'string' },
                    rating: { description: '1 (Again), 2 (Hard), 3 (Good), 4 (Easy)' },
                    timeTakenMs: { type: 'number' }
                  },
                  required: ['cardId', 'rating']
                }
              },
              {
                name: 'get_srs_analytics',
                description: 'Get retention metrics, streak, health breakdown, and due forecast.',
                inputSchema: { type: 'object', properties: {} }
              },
              {
                name: 'configure_srs_settings',
                description: 'Fine-tune adaptive SRS parameters, health sensitivity, and intervals.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    startingEase: { type: 'number' },
                    minEase: { type: 'number' },
                    easyBonus: { type: 'number' },
                    hardFactor: { type: 'number' },
                    lapsePenaltyHealth: { type: 'number' },
                    successBoostHealth: { type: 'number' },
                    healthIntervalSensitivity: { type: 'number' }
                  }
                }
              },
              {
                name: 'get_srs_settings',
                description: 'Get current SRS parameters and health weights.',
                inputSchema: { type: 'object', properties: {} }
              },
              {
                name: 'search_flashcards',
                description: 'Search flashcards across question, answer, topic, and tags.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    status: { type: 'string' }
                  },
                  required: ['query']
                }
              },
              {
                name: 'generate_study_guide',
                description: 'Compile a structured markdown study guide of cards in a topic or deck.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    deckId: { type: 'string' },
                    chapterName: { type: 'string' },
                    topicName: { type: 'string' }
                  }
                }
              }
            ]
          };
          break;
        }

        case 'tools/call': {
          const { name: toolName, arguments: args = {} } = params || {};
          let toolOutput = '';

          if (toolName === 'list_decks_and_topics') {
            toolOutput = JSON.stringify(this.db.getHierarchy(), null, 2);
          } else if (toolName === 'create_deck') {
            const d = this.db.createDeck(args.name, args.description, args.color, args.icon);
            toolOutput = JSON.stringify(d, null, 2);
          } else if (toolName === 'create_flashcard') {
            const c = this.db.addCard(args);
            toolOutput = `Card created [ID: ${c.id}] in ${c.deckName} > ${c.chapterName} > ${c.topicName}`;
          } else if (toolName === 'batch_create_flashcards') {
            const list = this.db.batchAddCards(args.cards || []);
            toolOutput = `Batch created ${list.length} cards successfully.`;
          } else if (toolName === 'get_flashcard') {
            const c = this.db.getCard(args.cardId);
            toolOutput = c ? JSON.stringify(c, null, 2) : 'Card not found.';
          } else if (toolName === 'get_due_flashcards') {
            const due = this.db.getDueCards(args);
            toolOutput = JSON.stringify(due, null, 2);
          } else if (toolName === 'review_flashcard') {
            const rev = this.db.reviewCard(args.cardId, args.rating, args.timeTakenMs || 0);
            toolOutput = `Review recorded. Rating: ${rev.reviewResult.historyEntry.ratingLabel}, Health: ${rev.card.healthScore}%, Next due: in ${rev.reviewResult.scheduledInHuman}`;
          } else if (toolName === 'get_srs_analytics') {
            toolOutput = JSON.stringify(this.db.getAnalytics(), null, 2);
          } else if (toolName === 'configure_srs_settings') {
            const updated = this.db.updateSrsSettings(args);
            toolOutput = JSON.stringify(updated, null, 2);
          } else if (toolName === 'get_srs_settings') {
            toolOutput = JSON.stringify(this.db.getSettings().srs, null, 2);
          } else if (toolName === 'search_flashcards') {
            const search = this.db.listCards({ search: args.query, status: args.status, limit: 30 });
            toolOutput = JSON.stringify(search, null, 2);
          } else if (toolName === 'generate_study_guide') {
            const { cards } = this.db.listCards(args);
            let md = `# Study Guide (${cards.length} Cards)\n\n`;
            for (const c of cards) {
              md += `### ${c.front}\n${c.back}\n*Health: ${c.healthScore}%*\n\n---\n`;
            }
            toolOutput = md;
          } else {
            throw new Error(`Unknown tool: ${toolName}`);
          }

          result = {
            content: [{ type: 'text', text: toolOutput }]
          };
          break;
        }

        case 'resources/list':
          result = {
            resources: [
              { uri: 'flashcards://decks', name: 'Decks Hierarchy', mimeType: 'application/json' },
              { uri: 'flashcards://due', name: 'Due Flashcards', mimeType: 'application/json' },
              { uri: 'flashcards://analytics', name: 'SRS Analytics', mimeType: 'application/json' },
              { uri: 'flashcards://settings', name: 'SRS Settings', mimeType: 'application/json' }
            ]
          };
          break;

        case 'resources/read': {
          const uri = params?.uri;
          let content = '';
          if (uri === 'flashcards://decks') content = JSON.stringify(this.db.getHierarchy(), null, 2);
          else if (uri === 'flashcards://due') content = JSON.stringify(this.db.getDueCards({ limit: 50 }), null, 2);
          else if (uri === 'flashcards://analytics') content = JSON.stringify(this.db.getAnalytics(), null, 2);
          else if (uri === 'flashcards://settings') content = JSON.stringify(this.db.getSettings().srs, null, 2);
          else throw new Error(`Unknown resource: ${uri}`);

          result = {
            contents: [{ uri, text: content, mimeType: 'application/json' }]
          };
          break;
        }

        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } }));
          return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message: err.message } }));
    }
  }

  // --- REST API IMPLEMENTATION ---
  async handleRestApi(req, res, pathname, query) {
    res.setHeader('Content-Type', 'application/json');

    // Hierarchy
    if (pathname === '/api/hierarchy' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(this.db.getHierarchy()));
      return;
    }

    // Decks
    if (pathname === '/api/decks' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(this.db.data.decks));
      return;
    }
    if (pathname === '/api/decks' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const deck = this.db.createDeck(body.name, body.description, body.color, body.icon);
      res.writeHead(201);
      res.end(JSON.stringify(deck));
      return;
    }

    // Cards
    if (pathname === '/api/cards' && req.method === 'GET') {
      const result = this.db.listCards({
        deckId: query.deckId,
        chapterName: query.chapterName,
        topicName: query.topicName,
        tag: query.tag,
        search: query.search,
        status: query.status || 'all',
        limit: Number(query.limit) || 100,
        offset: Number(query.offset) || 0
      });
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }
    if (pathname === '/api/cards' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const card = this.db.addCard(body);
      res.writeHead(201);
      res.end(JSON.stringify(card));
      return;
    }
    if (pathname === '/api/cards/batch' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const cards = this.db.batchAddCards(body.cards || []);
      res.writeHead(201);
      res.end(JSON.stringify({ count: cards.length, cards }));
      return;
    }

    // Single Card Operations
    const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch) {
      const cardId = cardMatch[1];
      if (req.method === 'GET') {
        const card = this.db.getCard(cardId);
        if (!card) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Card not found' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify(card));
        return;
      }
      if (req.method === 'PUT') {
        const body = await this.readJsonBody(req);
        const updated = this.db.updateCard(cardId, body);
        res.writeHead(200);
        res.end(JSON.stringify(updated));
        return;
      }
      if (req.method === 'DELETE') {
        const success = this.db.deleteCard(cardId);
        res.writeHead(success ? 200 : 404);
        res.end(JSON.stringify({ success }));
        return;
      }
    }

    // Review Card
    const reviewMatch = pathname.match(/^\/api\/cards\/([^/]+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      const cardId = reviewMatch[1];
      const body = await this.readJsonBody(req);
      const result = this.db.reviewCard(cardId, body.rating, body.timeTakenMs || 0);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // Due Cards
    if (pathname === '/api/due' && req.method === 'GET') {
      const dueCards = this.db.getDueCards({
        deckId: query.deckId,
        chapterName: query.chapterName,
        topicName: query.topicName,
        limit: Number(query.limit) || 50
      });
      res.writeHead(200);
      res.end(JSON.stringify(dueCards));
      return;
    }

    // Analytics
    if (pathname === '/api/stats' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(this.db.getAnalytics()));
      return;
    }

    // Settings
    if (pathname === '/api/settings' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(this.db.getSettings()));
      return;
    }
    if (pathname === '/api/settings/srs' && req.method === 'PUT') {
      const body = await this.readJsonBody(req);
      const updated = this.db.updateSrsSettings(body);
      res.writeHead(200);
      res.end(JSON.stringify(updated));
      return;
    }
    if (pathname === '/api/settings/server' && req.method === 'PUT') {
      const body = await this.readJsonBody(req);
      const updated = this.db.updateServerSettings(body);
      res.writeHead(200);
      res.end(JSON.stringify(updated));
      return;
    }

    // MCP Control Endpoints
    if ((pathname === '/api/status' || pathname === '/api/mcp/status') && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(this.getStatus()));
      return;
    }
    if (pathname === '/api/mcp/start' && req.method === 'POST') {
      this.isMcpActive = true;
      res.writeHead(200);
      res.end(JSON.stringify(this.getStatus()));
      return;
    }
    if (pathname === '/api/mcp/stop' && req.method === 'POST') {
      this.isMcpActive = false;
      res.writeHead(200);
      res.end(JSON.stringify(this.getStatus()));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
  }

  // --- STATIC FILE SERVER ---
  serveStatic(req, res, pathname) {
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Normalize path to prevent traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    } catch (err) {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  readJsonBody(req) {
    if (req.body) {
      if (typeof req.body === 'object') return Promise.resolve(req.body);
      if (typeof req.body === 'string') {
        try {
          return Promise.resolve(JSON.parse(req.body));
        } catch (e) {
          return Promise.resolve({});
        }
      }
    }
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) { // 5MB limit
          req.destroy();
          reject(new Error('Request entity too large'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }
}

// Standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new FlashcardServer();
  server.start().then(status => {
    console.log('Flashcard server status:', status.urls);
  }).catch(err => {
    console.error('Fatal start error:', err);
    process.exit(1);
  });
}

let serverlessInstance = null;
export default async function handler(req, res) {
  if (!serverlessInstance) {
    const db = new FlashcardDatabase();
    serverlessInstance = new FlashcardServer({ db });
  }

  // In Vercel rewrites, resolve original path
  const urlObj = new URL(req.url, 'http://localhost');
  const matchedPath = req.headers['x-matched-path'] || urlObj.searchParams.get('__route');
  if (matchedPath) {
    urlObj.searchParams.delete('__route');
    const remainingSearch = urlObj.searchParams.toString();
    req.url = matchedPath + (remainingSearch ? `?${remainingSearch}` : '');
  }

  return await serverlessInstance.handleRequest(req, res);
}


