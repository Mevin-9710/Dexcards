import assert from 'node:assert';
import { SrsEngine, DEFAULT_SRS_SETTINGS } from '../srsEngine.js';

console.log('--- RUNNING SRS ENGINE TESTS ---');

const engine = new SrsEngine();

// Test 1: Initialize card
const card = engine.initCardSrs();
assert.strictEqual(card.healthScore, 70.0, 'Initial health should be 70.0');
assert.strictEqual(card.easeFactor, 2.50, 'Initial ease factor should be 2.50');
assert.strictEqual(card.reps, 0, 'Initial reps should be 0');
assert.strictEqual(card.lapses, 0, 'Initial lapses should be 0');
assert.strictEqual(card.state, 'new', 'Initial state should be new');
console.log('✓ Test 1: initCardSrs passed');

// Test 2: First review rating 3 (Good)
const rev1 = engine.calculateReview(card, 3);
assert.strictEqual(rev1.updatedSrs.reps, 1, 'Reps should be 1');
assert.strictEqual(rev1.updatedSrs.correctCount, 1, 'Correct count should be 1');
assert(rev1.updatedSrs.healthScore > 70.0, 'Health score should increase after Good review');
assert(rev1.updatedSrs.intervalDays > 0, 'Interval should be positive');
console.log(`✓ Test 2: First review Good passed (Health: ${rev1.updatedSrs.healthScore}%, Interval: ${rev1.scheduledInHuman})`);

// Test 3: Failure rating 1 (Again) decreases health and resets streak
const revFail = engine.calculateReview(rev1.updatedSrs, 1);
assert.strictEqual(revFail.updatedSrs.lapses, 1, 'Lapses should be 1');
assert.strictEqual(revFail.updatedSrs.consecutiveCorrect, 0, 'Streak should be 0');
assert(revFail.updatedSrs.healthScore < rev1.updatedSrs.healthScore, 'Health must decrease on failure');
assert.strictEqual(revFail.updatedSrs.incorrectCount, 1, 'Incorrect count should be 1');
console.log(`✓ Test 3: Failure review Again passed (Health dropped from ${rev1.updatedSrs.healthScore}% to ${revFail.updatedSrs.healthScore}%)`);

// Test 4: Dynamic Health Modulation Check
// Verify that a card with low health receives a shorter interval than a card with high health for the same review rating
const lowHealthCard = {
  healthScore: 20.0,
  easeFactor: 2.50,
  intervalDays: 10,
  reps: 4,
  lapses: 3,
  consecutiveCorrect: 0,
  totalReviews: 7,
  correctCount: 4,
  incorrectCount: 3,
  state: 'review'
};

const highHealthCard = {
  healthScore: 95.0,
  easeFactor: 2.50,
  intervalDays: 10,
  reps: 4,
  lapses: 0,
  consecutiveCorrect: 4,
  totalReviews: 4,
  correctCount: 4,
  incorrectCount: 0,
  state: 'review'
};

const resLow = engine.calculateReview(lowHealthCard, 3);
const resHigh = engine.calculateReview(highHealthCard, 3);

console.log(`Low health card (20%) next interval: ${resLow.updatedSrs.intervalDays} days (Health: ${resLow.updatedSrs.healthScore}%)`);
console.log(`High health card (95%) next interval: ${resHigh.updatedSrs.intervalDays} days (Health: ${resHigh.updatedSrs.healthScore}%)`);

assert(resLow.updatedSrs.intervalDays < resHigh.updatedSrs.intervalDays, 
  'Low health card must have a significantly shorter interval than high health card to reinforce memory!');
console.log('✓ Test 4: Dynamic health-based interval modulation verified');

// Test 5: Configurable settings
engine.updateSettings({
  startingEase: 2.80,
  lapsePenaltyHealth: 35.0,
  healthIntervalSensitivity: 0.90
});
const settings = engine.getSettings();
assert.strictEqual(settings.startingEase, 2.80, 'Updated starting ease factor');
assert.strictEqual(settings.lapsePenaltyHealth, 35.0, 'Updated lapse penalty');
assert.strictEqual(settings.healthIntervalSensitivity, 0.90, 'Updated sensitivity');
console.log('✓ Test 5: Custom settings update verified');

console.log('--- ALL SRS TESTS PASSED SUCCESSFULLY! ---');
