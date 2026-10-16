import assert from 'node:assert';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { FlashcardServer } from '../server.js';
import { FlashcardDatabase } from '../db.js';

console.log('--- RUNNING FULL SERVER INTEGRATION TESTS ---');

const testDir = path.join(process.cwd(), 'scratch_test_server_db');
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

const db = new FlashcardDatabase(testDir);
// Use ports 8088 and 8448 for isolated testing
const server = new FlashcardServer({
  db,
  httpPort: 8088,
  httpsPort: 8448,
  host: '127.0.0.1'
});

await server.start();
console.log('✓ Server started on test ports 8088 (HTTP) & 8448 (HTTPS)');

// Helper for HTTP GET
function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

// Helper for HTTPS POST (rejectUnauthorized: false for self-signed cert)
function httpsPostJson(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const postData = JSON.stringify(payload);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Test 1: Static file serving (PWA index.html)
const indexRes = await httpGet('http://127.0.0.1:8088/');
assert.strictEqual(indexRes.statusCode, 200, 'Index should return 200 OK');
assert(indexRes.body.includes('Lumino — Liquid Glass Flashcard MCP'), 'Index should contain app title');
console.log('✓ Test 1: Static HTML served successfully');

// Test 2: REST API /api/hierarchy
const hierRes = await httpGet('http://127.0.0.1:8088/api/hierarchy');
assert.strictEqual(hierRes.statusCode, 200);
const hierarchy = JSON.parse(hierRes.body);
assert(hierarchy.length >= 3, 'Should return 3 decks');
console.log(`✓ Test 2: /api/hierarchy returned ${hierarchy.length} decks`);

// Test 3: REST API /api/due
const dueRes = await httpGet('http://127.0.0.1:8088/api/due');
assert.strictEqual(dueRes.statusCode, 200);
const dueCards = JSON.parse(dueRes.body);
assert(dueCards.length > 0, 'Should return due cards');
console.log(`✓ Test 3: /api/due returned ${dueCards.length} due cards`);

// Test 4: Direct MCP JSON-RPC 2.0 over HTTPS!
const mcpRes = await httpsPostJson('https://127.0.0.1:8448/mcp', {
  jsonrpc: '2.0',
  id: 42,
  method: 'tools/list'
});
assert.strictEqual(mcpRes.statusCode, 200, 'MCP HTTPS should return 200 OK');
const mcpData = JSON.parse(mcpRes.body);
assert.strictEqual(mcpData.jsonrpc, '2.0');
assert.strictEqual(mcpData.id, 42);
assert(Array.isArray(mcpData.result.tools), 'Result should contain tools array');
assert(mcpData.result.tools.some(t => t.name === 'create_flashcard'), 'Should include create_flashcard tool');
assert(mcpData.result.tools.some(t => t.name === 'review_flashcard'), 'Should include review_flashcard tool');
console.log(`✓ Test 4: HTTPS MCP endpoint validated! (${mcpData.result.tools.length} MCP tools listed)`);

// Test 5: Tool execution over HTTPS (create_flashcard tool call)
const callRes = await httpsPostJson('https://127.0.0.1:8448/mcp', {
  jsonrpc: '2.0',
  id: 43,
  method: 'tools/call',
  params: {
    name: 'create_flashcard',
    arguments: {
      front: 'What is Raft Consensus?',
      back: 'A consensus algorithm designed to be understandable, based on leader election, log replication, and safety invariants.',
      chapterName: 'Distributed Systems',
      topicName: 'Consensus Protocols'
    }
  }
});
assert.strictEqual(callRes.statusCode, 200);
const callData = JSON.parse(callRes.body);
assert(callData.result.content[0].text.includes('Card created'), 'Should report card created');
console.log('✓ Test 5: MCP Tool Call over HTTPS executed successfully');

// Test 6: Certificate download endpoint
const certRes = await httpGet('http://127.0.0.1:8088/api/mcp/cert');
assert.strictEqual(certRes.statusCode, 200);
assert(certRes.body.includes('BEGIN CERTIFICATE'), 'Should return valid X.509 certificate');
console.log('✓ Test 6: TLS certificate download verified');

await server.stop();
fs.rmSync(testDir, { recursive: true, force: true });
console.log('--- ALL SERVER INTEGRATION TESTS PASSED PERFECTLY! ---');
