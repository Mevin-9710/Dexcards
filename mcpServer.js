import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function createFlashcardMcpServer(db) {
  const server = new McpServer({
    name: 'flashcard-mcp',
    version: '1.0.0',
    description: 'Mobile Liquid Glass Flashcard MCP Server with Adaptive Spaced Repetition & Card Health'
  });

  // 1. Tool: list_decks_and_topics
  server.tool(
    'list_decks_and_topics',
    'Browse the hierarchical taxonomy of decks, chapters, topics, card counts, and average memory health.',
    {},
    async () => {
      const hierarchy = db.getHierarchy();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(hierarchy, null, 2)
          }
        ]
      };
    }
  );

  // 2. Tool: create_deck
  server.tool(
    'create_deck',
    'Create a new deck or collection for organizing flashcards.',
    {
      name: z.string().describe('Name of the deck'),
      description: z.string().optional().describe('Deck purpose or syllabus description'),
      color: z.string().optional().describe('Hex color code (e.g. #6366f1)'),
      icon: z.string().optional().describe('Icon identifier')
    },
    async ({ name, description, color, icon }) => {
      const deck = db.createDeck(name, description, color, icon);
      return {
        content: [
          {
            type: 'text',
            text: `Deck created successfully:\n${JSON.stringify(deck, null, 2)}`
          }
        ]
      };
    }
  );

  // 3. Tool: create_flashcard
  server.tool(
    'create_flashcard',
    'Create a new flashcard with question, answer, hint, and hierarchical chapter/topic organization.',
    {
      front: z.string().describe('The question or prompt on the front of the card'),
      back: z.string().describe('The answer or explanation on the back of the card'),
      hint: z.string().optional().describe('Optional hint for recall assistance'),
      deckId: z.string().optional().describe('ID of existing deck'),
      deckName: z.string().optional().describe('Name of deck (creates if not existing)'),
      chapterName: z.string().optional().describe('Chapter or category name'),
      topicName: z.string().optional().describe('Specific topic name within the chapter'),
      tags: z.array(z.string()).optional().describe('Tags for indexing'),
      initialDifficulty: z.number().min(0.1).max(1.0).optional().describe('Initial difficulty rating (0.1 to 1.0)')
    },
    async (args) => {
      const card = db.addCard(args);
      return {
        content: [
          {
            type: 'text',
            text: `Flashcard created successfully [ID: ${card.id}]:\n• Deck: ${card.deckName}\n• Chapter: ${card.chapterName}\n• Topic: ${card.topicName}\n• Front: ${card.front}\n• Health: ${card.healthScore}%\n• Due: ${card.nextReviewDate}`
          }
        ]
      };
    }
  );

  // 4. Tool: batch_create_flashcards
  server.tool(
    'batch_create_flashcards',
    'Create multiple flashcards at once. Ideal for generating study materials from source documents or lectures.',
    {
      cards: z.array(
        z.object({
          front: z.string(),
          back: z.string(),
          hint: z.string().optional(),
          deckId: z.string().optional(),
          deckName: z.string().optional(),
          chapterName: z.string().optional(),
          topicName: z.string().optional(),
          tags: z.array(z.string()).optional()
        })
      ).describe('Array of flashcard objects to create')
    },
    async ({ cards }) => {
      const created = db.batchAddCards(cards);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created ${created.length} flashcards across decks.`
          }
        ]
      };
    }
  );

  // 5. Tool: get_flashcard
  server.tool(
    'get_flashcard',
    'Retrieve a specific flashcard by ID, including its full SRS review history and memory health.',
    {
      cardId: z.string().describe('ID of the flashcard')
    },
    async ({ cardId }) => {
      const card = db.getCard(cardId);
      if (!card) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Flashcard with ID '${cardId}' not found.` }]
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(card, null, 2) }]
      };
    }
  );

  // 6. Tool: update_flashcard
  server.tool(
    'update_flashcard',
    'Update the content, hint, chapter, topic, or tags of an existing flashcard.',
    {
      cardId: z.string().describe('ID of the card to update'),
      front: z.string().optional().describe('Updated question text'),
      back: z.string().optional().describe('Updated answer text'),
      hint: z.string().optional().describe('Updated hint'),
      chapterName: z.string().optional().describe('Updated chapter'),
      topicName: z.string().optional().describe('Updated topic'),
      tags: z.array(z.string()).optional().describe('Updated tags')
    },
    async ({ cardId, ...updates }) => {
      try {
        const card = db.updateCard(cardId, updates);
        return {
          content: [{ type: 'text', text: `Card ${cardId} updated successfully.\n${JSON.stringify(card, null, 2)}` }]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }]
        };
      }
    }
  );

  // 7. Tool: delete_flashcard
  server.tool(
    'delete_flashcard',
    'Delete a flashcard by ID.',
    {
      cardId: z.string().describe('ID of the flashcard to delete')
    },
    async ({ cardId }) => {
      const success = db.deleteCard(cardId);
      return {
        content: [
          {
            type: 'text',
            text: success ? `Flashcard ${cardId} deleted.` : `Flashcard ${cardId} not found.`
          }
        ]
      };
    }
  );

  // 8. Tool: get_due_flashcards
  server.tool(
    'get_due_flashcards',
    'Fetch flashcards currently due for review according to the adaptive spaced repetition schedule.',
    {
      deckId: z.string().optional().describe('Filter by deck ID'),
      chapterName: z.string().optional().describe('Filter by chapter name'),
      topicName: z.string().optional().describe('Filter by topic name'),
      limit: z.number().optional().describe('Maximum cards to return (default 20)')
    },
    async ({ deckId, chapterName, topicName, limit = 20 }) => {
      const dueCards = db.getDueCards({ deckId, chapterName, topicName, limit });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${dueCards.length} cards due for study:\n\n${JSON.stringify(dueCards, null, 2)}`
          }
        ]
      };
    }
  );

  // 9. Tool: review_flashcard
  server.tool(
    'review_flashcard',
    'Record a study review rating for a card. Calculates updated interval, ease factor, and health score.',
    {
      cardId: z.string().describe('ID of the reviewed card'),
      rating: z.union([z.string(), z.number()]).describe('Rating: "again"/1 (wrong), "hard"/2, "good"/3 (correct), "easy"/4 (effortless)'),
      timeTakenMs: z.number().optional().describe('Time in milliseconds taken to recall the answer')
    },
    async ({ cardId, rating, timeTakenMs = 0 }) => {
      try {
        const { card, reviewResult } = db.reviewCard(cardId, rating, timeTakenMs);
        const { updatedSrs, historyEntry, scheduledInHuman } = reviewResult;
        return {
          content: [
            {
              type: 'text',
              text: `Review recorded for card ${cardId}:\n• Rating: ${historyEntry.ratingLabel} (${historyEntry.rating})\n• Health Score: ${historyEntry.healthBefore}% ➔ ${historyEntry.healthAfter}%\n• Ease Factor: ${updatedSrs.easeFactor}\n• Consecutive Streak: ${updatedSrs.consecutiveCorrect}\n• Next Review: In ${scheduledInHuman} (${updatedSrs.nextReviewDate})`
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }]
        };
      }
    }
  );

  // 10. Tool: get_srs_analytics
  server.tool(
    'get_srs_analytics',
    'Get overall retention metrics, streak, health breakdown (struggling vs mastered), and upcoming due forecast.',
    {},
    async () => {
      const stats = db.getAnalytics();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    }
  );

  // 11. Tool: configure_srs_settings
  server.tool(
    'configure_srs_settings',
    'Configure adaptive Spaced Repetition System (SRS) weights and health sensitivity parameters.',
    {
      startingEase: z.number().min(1.1).max(3.5).optional().describe('Default ease factor for new cards'),
      minEase: z.number().min(1.0).max(2.5).optional().describe('Floor for ease factor'),
      easyBonus: z.number().min(1.1).max(2.0).optional().describe('Interval multiplier bonus for Easy rating'),
      hardFactor: z.number().min(1.0).max(1.5).optional().describe('Interval multiplier for Hard rating'),
      lapsePenaltyHealth: z.number().min(5.0).max(50.0).optional().describe('Health points lost on failure/Again rating'),
      successBoostHealth: z.number().min(5.0).max(40.0).optional().describe('Health points gained on successful review'),
      healthIntervalSensitivity: z.number().min(0.0).max(1.0).optional().describe('Weight (0.0 to 1.0) of health in compressing or expanding intervals'),
      graduatingIntervalDays: z.number().min(0.1).optional().describe('Interval in days upon graduating learning phase'),
      easyIntervalDays: z.number().min(1.0).optional().describe('Interval in days when first review is Easy')
    },
    async (args) => {
      const updated = db.updateSrsSettings(args);
      return {
        content: [
          {
            type: 'text',
            text: `SRS settings updated successfully:\n${JSON.stringify(updated, null, 2)}`
          }
        ]
      };
    }
  );

  // 12. Tool: get_srs_settings
  server.tool(
    'get_srs_settings',
    'Get current Spaced Repetition System (SRS) parameters and health weights.',
    {},
    async () => {
      const settings = db.getSettings();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(settings.srs, null, 2)
          }
        ]
      };
    }
  );

  // 13. Tool: search_flashcards
  server.tool(
    'search_flashcards',
    'Search flashcards across front, back, hint, topic, chapter, deck, and tags.',
    {
      query: z.string().describe('Search query text'),
      deckId: z.string().optional().describe('Filter by deck ID'),
      status: z.enum(['all', 'due', 'new', 'struggling', 'mastered']).optional().describe('Filter by card status')
    },
    async ({ query, deckId, status }) => {
      const res = db.listCards({ search: query, deckId, status, limit: 30 });
      return {
        content: [
          {
            type: 'text',
            text: `Found ${res.total} matching cards:\n\n${JSON.stringify(res.cards, null, 2)}`
          }
        ]
      };
    }
  );

  // 14. Tool: generate_study_guide
  server.tool(
    'generate_study_guide',
    'Compile a structured markdown study guide of all cards in a deck, chapter, or topic.',
    {
      deckId: z.string().optional().describe('Deck ID to compile'),
      chapterName: z.string().optional().describe('Chapter to compile'),
      topicName: z.string().optional().describe('Topic to compile')
    },
    async ({ deckId, chapterName, topicName }) => {
      const { cards } = db.listCards({ deckId, chapterName, topicName, limit: 200 });
      let markdown = `# Study Guide: ${topicName || chapterName || 'Deck Review'}\n\n`;
      markdown += `*Generated with ${cards.length} flashcards*\n\n---\n\n`;

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        markdown += `### ${i + 1}. ${c.front}\n`;
        markdown += `**Answer:**\n${c.back}\n\n`;
        if (c.hint) markdown += `*Hint:* ${c.hint}\n\n`;
        markdown += `> **Metadata**: Chapter: \`${c.chapterName}\` | Topic: \`${c.topicName}\` | Health: **${c.healthScore}%** | Reps: ${c.reps}\n\n---\n\n`;
      }

      return {
        content: [{ type: 'text', text: markdown }]
      };
    }
  );

  // RESOURCES
  server.resource(
    'decks',
    'flashcards://decks',
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(db.getHierarchy(), null, 2),
          mimeType: 'application/json'
        }
      ]
    })
  );

  server.resource(
    'due',
    'flashcards://due',
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(db.getDueCards({ limit: 50 }), null, 2),
          mimeType: 'application/json'
        }
      ]
    })
  );

  server.resource(
    'analytics',
    'flashcards://analytics',
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(db.getAnalytics(), null, 2),
          mimeType: 'application/json'
        }
      ]
    })
  );

  server.resource(
    'settings',
    'flashcards://settings',
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(db.getSettings().srs, null, 2),
          mimeType: 'application/json'
        }
      ]
    })
  );

  // PROMPTS
  server.prompt(
    'study_coach',
    {
      deckName: z.string().optional().describe('Deck to study')
    },
    ({ deckName }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are my personalized AI Study Coach using Lumino Spaced Repetition.\n` +
                  `First, call the 'get_due_flashcards' tool${deckName ? ` for deck "${deckName}"` : ''}.\n` +
                  `Then, present one flashcard question at a time. Wait for my answer.\n` +
                  `Evaluate my recall and reasoning. Then call 'review_flashcard' with the appropriate rating ('again', 'hard', 'good', or 'easy') and explain any nuances I missed.`
          }
        }
      ]
    })
  );

  server.prompt(
    'generate_deck_from_topic',
    {
      topic: z.string().describe('Subject matter or document to extract flashcards from')
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the subject "${topic}". Extract 5-10 high-yield, conceptually rich flashcards.\n` +
                  `Organize them logically into chapters and subtopics.\n` +
                  `Call 'batch_create_flashcards' to insert them directly into the flashcard database.`
          }
        }
      ]
    })
  );

  return server;
}
