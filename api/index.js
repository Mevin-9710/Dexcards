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
  const server = getServer();
  return await server.handleRequest(req, res);
}
