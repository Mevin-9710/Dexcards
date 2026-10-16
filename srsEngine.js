/**
 * Adaptive Spaced Repetition System (SRS) Engine
 * Combines SuperMemo SM-2 & FSRS principles with dynamic Card Health scoring.
 * The review intervals adapt in real-time based on recall accuracy, streak, and memory health.
 */

export const DEFAULT_SRS_SETTINGS = {
  startingEase: 2.50,
  minEase: 1.30,
  maxEase: 3.50,
  easyBonus: 1.35,
  hardFactor: 1.20,
  lapsePenaltyHealth: 25.0,
  successBoostHealth: 15.0,
  healthIntervalSensitivity: 0.65, // 0 = standard SM-2, 1 = maximum health influence
  learningStepsMinutes: [1, 10],   // Steps for new or lapsed cards
  graduatingIntervalDays: 1.0,     // First interval after graduation
  easyIntervalDays: 4.0,           // First interval if rated Easy on first try
  lapseIntervalPercentage: 0.15,   // Retain 15% of interval on lapse (0 = full reset to step)
  initialCardHealth: 70.0          // Initial health score for brand new cards (0-100)
};

export class SrsEngine {
  constructor(customSettings = {}) {
    this.settings = { ...DEFAULT_SRS_SETTINGS, ...customSettings };
  }

  /**
   * Update engine settings dynamically
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    // Validate bounds
    if (this.settings.startingEase < 1.1) this.settings.startingEase = 1.1;
    if (this.settings.minEase < 1.0) this.settings.minEase = 1.0;
    if (this.settings.healthIntervalSensitivity < 0) this.settings.healthIntervalSensitivity = 0;
    if (this.settings.healthIntervalSensitivity > 1) this.settings.healthIntervalSensitivity = 1;
    return this.settings;
  }

  getSettings() {
    return { ...this.settings };
  }

  /**
   * Initialize default SRS fields for a new card
   */
  initCardSrs() {
    const now = new Date();
    return {
      healthScore: this.settings.initialCardHealth,
      easeFactor: this.settings.startingEase,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      consecutiveCorrect: 0,
      totalReviews: 0,
      correctCount: 0,
      incorrectCount: 0,
      state: 'new', // 'new' | 'learning' | 'review' | 'relearning'
      stepIndex: 0,
      difficulty: 0.3,
      stability: 1.0,
      lastReviewDate: null,
      nextReviewDate: now.toISOString(),
      history: []
    };
  }

  /**
   * Calculate next review schedule and updated card statistics
   * @param {Object} card Current card state
   * @param {number|string} rating 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
   * @param {number} timeTakenMs Optional time taken to answer in milliseconds
   */
  calculateReview(card, rating, timeTakenMs = 0) {
    const numRating = typeof rating === 'string' ? this.parseRating(rating) : rating;
    if (numRating < 1 || numRating > 4) {
      throw new Error(`Invalid rating: ${rating}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
    }

    const srs = {
      healthScore: card.healthScore ?? this.settings.initialCardHealth,
      easeFactor: card.easeFactor ?? this.settings.startingEase,
      intervalDays: card.intervalDays ?? 0,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
      consecutiveCorrect: card.consecutiveCorrect ?? 0,
      totalReviews: card.totalReviews ?? 0,
      correctCount: card.correctCount ?? 0,
      incorrectCount: card.incorrectCount ?? 0,
      state: card.state ?? 'new',
      stepIndex: card.stepIndex ?? 0,
      difficulty: card.difficulty ?? 0.3,
      stability: card.stability ?? 1.0,
      lastReviewDate: card.lastReviewDate,
      nextReviewDate: card.nextReviewDate,
      history: Array.isArray(card.history) ? [...card.history] : []
    };

    const healthBefore = srs.healthScore;
    const intervalBefore = srs.intervalDays;
    const now = new Date();
    srs.totalReviews += 1;

    // 1. UPDATE HEALTH SCORE
    // Health is driven directly by success vs failure frequency and current streak
    if (numRating === 1) { // Again (Wrong)
      srs.incorrectCount += 1;
      srs.lapses += 1;
      srs.consecutiveCorrect = 0;
      // Exponential penalty when repeatedly failing
      const penalty = this.settings.lapsePenaltyHealth * (1.0 + Math.min(2.0, srs.lapses * 0.15));
      srs.healthScore = Math.max(5.0, srs.healthScore - penalty);
      srs.difficulty = Math.min(1.0, srs.difficulty + 0.15);
    } else { // Correct (Hard, Good, Easy)
      srs.correctCount += 1;
      srs.reps += 1;
      srs.consecutiveCorrect += (numRating === 4 ? 2 : 1);

      // Higher boost for Easy, moderate for Good, minor for Hard
      const ratingMultiplier = numRating === 4 ? 1.4 : (numRating === 3 ? 1.0 : 0.4);
      // Diminishing returns formula as health approaches 100%
      const healthHeadroom = (100.0 - srs.healthScore) / 100.0;
      const boost = this.settings.successBoostHealth * ratingMultiplier * (0.4 + 0.6 * healthHeadroom);
      srs.healthScore = Math.min(100.0, srs.healthScore + boost);
      
      // Decrease difficulty gradually on success
      const diffReduction = numRating === 4 ? 0.08 : (numRating === 3 ? 0.03 : -0.02);
      srs.difficulty = Math.max(0.1, Math.min(1.0, srs.difficulty - diffReduction));
    }

    // 2. UPDATE EASE FACTOR (SuperMemo formula)
    // Rating 1 -> 1, 2 -> 2, 3 -> 3, 4 -> 4
    // Standard SM-2 formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    // where q is 0-5. Mapping: 1 -> 0, 2 -> 3, 3 -> 4, 4 -> 5
    const qMap = { 1: 0, 2: 3, 3: 4, 4: 5 };
    const q = qMap[numRating];
    let newEase = srs.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    newEase = Math.max(this.settings.minEase, Math.min(this.settings.maxEase, newEase));
    srs.easeFactor = Number(newEase.toFixed(3));

    // 3. COMPUTE BASE INTERVAL (Days)
    let nextIntervalDays = 0;
    const learningSteps = this.settings.learningStepsMinutes;

    if (numRating === 1) { // Lapsed / Wrong
      srs.state = srs.totalReviews > 1 ? 'relearning' : 'learning';
      srs.stepIndex = 0;
      if (this.settings.lapseIntervalPercentage > 0 && srs.reps > 2) {
        nextIntervalDays = Math.max(learningSteps[0] / 1440, srs.intervalDays * this.settings.lapseIntervalPercentage);
      } else {
        nextIntervalDays = learningSteps[0] / 1440; // in fraction of day
      }
    } else if (srs.state === 'learning' || srs.state === 'relearning') {
      if (numRating === 4) { // Easy graduates immediately
        srs.state = 'review';
        nextIntervalDays = this.settings.easyIntervalDays;
      } else if (srs.stepIndex < learningSteps.length - 1) {
        srs.stepIndex += 1;
        nextIntervalDays = learningSteps[srs.stepIndex] / 1440;
      } else {
        // Graduate to review
        srs.state = 'review';
        nextIntervalDays = this.settings.graduatingIntervalDays;
      }
    } else { // Normal Review Mode
      if (srs.intervalDays <= 0) {
        nextIntervalDays = this.settings.graduatingIntervalDays;
      } else if (srs.reps === 1) {
        nextIntervalDays = numRating === 4 ? this.settings.easyIntervalDays : this.settings.graduatingIntervalDays * 2.5;
      } else {
        let multiplier = srs.easeFactor;
        if (numRating === 2) { // Hard
          multiplier = this.settings.hardFactor;
        } else if (numRating === 4) { // Easy
          multiplier = srs.easeFactor * this.settings.easyBonus;
        }
        nextIntervalDays = srs.intervalDays * multiplier;
      }
    }

    // 4. DYNAMIC HEALTH-BASED INTERVAL MODULATION (User's Core Requirement)
    // "The space repetition for that time setting thing should be based off of how often I get correct health and I get it wrong."
    // Health is between 0 and 100. Average healthy card is ~75.
    // If health is low (e.g. 20%), the interval is compressed up to 60%, forcing earlier review.
    // If health is high (e.g. 95%), the interval gets a memory stability boost (up to +25%).
    const healthRatio = srs.healthScore / 100.0;
    let healthFactor = 1.0;
    if (healthRatio < 0.5) {
      // Fragile memory: compress interval
      healthFactor = Math.max(0.35, 0.45 + 1.1 * healthRatio);
    } else if (healthRatio > 0.8) {
      // Solid memory: bonus stretch
      healthFactor = 1.0 + (healthRatio - 0.8) * 0.8;
    } else {
      // Neutral range (50% - 80%)
      healthFactor = 0.85 + (healthRatio - 0.5) * 0.5;
    }

    // Blend using healthIntervalSensitivity setting (0 to 1)
    const sensitivity = this.settings.healthIntervalSensitivity;
    const modulatedInterval = nextIntervalDays * (1.0 + (healthFactor - 1.0) * sensitivity);

    // Ensure non-zero positive interval
    const minInterval = (learningSteps[0] || 1) / 1440;
    srs.intervalDays = Math.max(minInterval, Number(modulatedInterval.toFixed(3)));

    // 5. COMPUTE EXACT NEXT REVIEW TIMESTAMP
    const intervalMs = Math.round(srs.intervalDays * 24 * 60 * 60 * 1000);
    const nextDate = new Date(now.getTime() + intervalMs);
    srs.lastReviewDate = now.toISOString();
    srs.nextReviewDate = nextDate.toISOString();
    srs.healthScore = Number(srs.healthScore.toFixed(1));

    // Append to review history (keep last 50 for analytics)
    const historyEntry = {
      timestamp: now.toISOString(),
      rating: numRating,
      ratingLabel: this.getRatingLabel(numRating),
      timeTakenMs,
      intervalBefore: Number(intervalBefore.toFixed(3)),
      intervalAfter: srs.intervalDays,
      healthBefore: Number(healthBefore.toFixed(1)),
      healthAfter: srs.healthScore,
      easeFactor: srs.easeFactor
    };
    srs.history.unshift(historyEntry);
    if (srs.history.length > 50) srs.history.pop();

    return {
      updatedSrs: srs,
      historyEntry,
      scheduledInHuman: this.formatIntervalHuman(srs.intervalDays)
    };
  }

  parseRating(label) {
    const l = String(label).toLowerCase().trim();
    if (l === '1' || l === 'again' || l === 'fail' || l === 'wrong') return 1;
    if (l === '2' || l === 'hard') return 2;
    if (l === '3' || l === 'good' || l === 'pass' || l === 'correct') return 3;
    if (l === '4' || l === 'easy') return 4;
    return 3;
  }

  getRatingLabel(num) {
    switch (num) {
      case 1: return 'Again';
      case 2: return 'Hard';
      case 3: return 'Good';
      case 4: return 'Easy';
      default: return 'Good';
    }
  }

  /**
   * Check if a card is currently due for review
   */
  isCardDue(card, referenceDate = new Date()) {
    if (!card.nextReviewDate) return true;
    const dueTime = new Date(card.nextReviewDate).getTime();
    return dueTime <= referenceDate.getTime();
  }

  /**
   * Human readable interval string (e.g. '10 min', '2 days', '3 months')
   */
  formatIntervalHuman(days) {
    if (days < 1 / 24) {
      const minutes = Math.max(1, Math.round(days * 24 * 60));
      return `${minutes} min`;
    }
    if (days < 1) {
      const hours = Math.round(days * 24);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (days < 30) {
      const d = Math.round(days * 10) / 10;
      return `${d} day${d !== 1 ? 's' : ''}`;
    }
    if (days < 365) {
      const months = Math.round((days / 30) * 10) / 10;
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    const years = Math.round((days / 365) * 10) / 10;
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
}
