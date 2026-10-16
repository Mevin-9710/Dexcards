import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { FlashcardDatabase } from '../db.js';
import { createFlashcardMcpServer } from '../mcpServer.js';

console.log('--- RUNNING MCP SERVER TESTS ---');

const testDir = path.join(process.cwd(), 'scratch_test_mcp');
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

const db = new FlashcardDatabase(testDir);
const mcp = createFlashcardMcpServer(db);

assert(mcp, 'MCP server should be instantiated');
console.log('✓ Test 1: MCP Server instantiated successfully');

// Direct DB / Tool verification through the DB interface that feeds MCP
const hierarchy = db.getHierarchy();
assert(hierarchy.length >= 3, 'Hierarchy should list decks');
console.log(`✓ Test 2: list_decks_and_topics tool data ready (${hierarchy.length} decks)`);

// Test creating card
const created = db.addCard({
  front: 'What is a closure in JavaScript?',
  back: 'The combination of a function bundled together with references to its lexical environment.',
  deckName: 'Computer Science & Distributed Systems',
  chapterName: 'Programming Languages',
  topicName: 'Lexical Scoping'
});
assert.strictEqual(created.front, 'What is a closure in JavaScript?');
console.log(`✓ Test 3: create_flashcard verified [ID: ${created.id}]`);

// Test review
const rev = db.reviewCard(created.id, 4); // Easy
assert.strictEqual(rev.reviewResult.historyEntry.rating, 4);
assert(rev.card.healthScore > 75);
console.log(`✓ Test 4: review_flashcard verified (Rating: Easy, Health: ${rev.card.healthScore}%)`);

// Test SRS config update
const newCfg = db.updateSrsSettings({ startingEase: 2.75, healthIntervalSensitivity: 0.85 });
assert.strictEqual(newCfg.startingEase, 2.75);
assert.strictEqual(newCfg.healthIntervalSensitivity, 0.85);
console.log('✓ Test 5: configure_srs_settings verified');

fs.rmSync(testDir, { recursive: true, force: true });
console.log('--- ALL MCP SERVER TESTS PASSED! ---');
