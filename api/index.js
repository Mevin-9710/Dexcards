import { FlashcardServer } from '../server.js';
import { FlashcardDatabase } from '../db.js';

let serverInstance = null;

function getServer() {
  if (!serverInstance) {
    const db = new FlashcardDatabase();
    serverInstance = new FlashcardServer({ db });
  }
  return serverInstance;
}

export default async function handler(req, res) {
  try {
    const server = getServer();
    return await server.handleRequest(req, res);
  } catch (err) {
    console.error('[Vercel Function Error]:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, stack: err.stack }));
    }
  }
}
