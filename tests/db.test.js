import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { FlashcardDatabase } from '../db.js';

console.log('--- RUNNING DATABASE & HIERARCHY TESTS ---');

const testDir = path.join(process.cwd(), 'scratch_test_db');
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

const db = new FlashcardDatabase(testDir);

// Test 1: Seed verification
assert(db.data.decks.length >= 3, 'Should seed at least 3 starter decks');
assert(db.data.cards.length >= 6, 'Should seed at least 6 starter cards');
console.log(`✓ Test 1: Seeded ${db.data.decks.length} decks and ${db.data.cards.length} cards`);

// Test 2: Hierarchy exploration
const hierarchy = db.getHierarchy();
assert(Array.isArray(hierarchy), 'Hierarchy should be an array of decks');
assert(hierarchy.length >= 3, 'Hierarchy should have 3 decks');
assert(hierarchy[0].chapters.length > 0, 'Deck should contain chapters');
assert(hierarchy[0].chapters[0].topics.length > 0, 'Chapter should contain topics');
console.log(`✓ Test 2: Hierarchy verified with ${hierarchy[0].chapters[0].topics.length} topics in chapter`);

// Test 3: Add card to specific topic and chapter
const newCard = db.addCard({
  front: 'What is WebAssembly (Wasm)?',
  back: 'A binary instruction format for a stack-based virtual machine designed as a portable compilation target.',
  hint: 'Stack-based bytecode in browsers.',
  deckName: 'Computer Science & Distributed Systems',
  chapterName: 'Web & Runtime Engines',
  topicName: 'WebAssembly Architecture',
  tags: ['wasm', 'web', 'low-level']
});
assert.strictEqual(newCard.chapterName, 'Web & Runtime Engines');
assert.strictEqual(newCard.topicName, 'WebAssembly Architecture');
assert.strictEqual(newCard.healthScore, 70.0);
console.log(`✓ Test 3: Card added with ID ${newCard.id}`);

// Test 4: Review the card
const rev = db.reviewCard(newCard.id, 3);
assert(rev.card.reps === 1, 'Card should have 1 rep');
assert(rev.card.history.length === 1, 'Card should have 1 history entry');
console.log(`✓ Test 4: Card reviewed successfully (New Health: ${rev.card.healthScore}%)`);

// Test 5: Search and Filtering
const searchRes = db.listCards({ search: 'WebAssembly' });
assert.strictEqual(searchRes.cards.length, 1, 'Should find 1 card for WebAssembly');
assert.strictEqual(searchRes.cards[0].id, newCard.id);

const chapterFilter = db.listCards({ chapterName: 'Web & Runtime Engines' });
assert.strictEqual(chapterFilter.cards.length, 1);
console.log('✓ Test 5: Search and chapter filtering verified');

// Test 6: Analytics
const stats = db.getAnalytics();
assert(stats.totalCards >= 7, 'Should reflect total cards');
assert(stats.totalReviews >= 1, 'Should reflect total reviews');
console.log(`✓ Test 6: Analytics verified: Total Cards=${stats.totalCards}, Avg Health=${stats.averageHealth}%, Retention=${stats.retentionRate}%`);

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });
console.log('--- ALL DATABASE TESTS PASSED! ---');
