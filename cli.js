#!/usr/bin/env node
import { FlashcardServer } from './server.js';
import { FlashcardDatabase } from './db.js';

const cmd = process.argv[2] || 'start';

async function main() {
  const db = new FlashcardDatabase();

  switch (cmd) {
    case 'start': {
      const server = new FlashcardServer({ db });
      await server.start();
      const status = server.getStatus();
      console.log('\n======================================================');
      console.log(' ✨ LUMINO GLASS FLASHCARD MCP SERVER RUNNING');
      console.log('======================================================');
      console.log(`📱 Mobile Web App (HTTP):   ${status.urls.webHttp}`);
      console.log(`🔒 Mobile Web App (HTTPS):  ${status.urls.webHttps}`);
      console.log(`🤖 Gemini MCP SSE (HTTPS):  ${status.urls.mcpSseHttps}`);
      console.log(`⚡ Gemini MCP HTTP (HTTPS): ${status.urls.mcpJsonRpcHttps}`);
      console.log(`🛡️ TLS SHA-256:             ${status.tlsFingerprint}`);
      console.log(`📜 Download TLS Cert:       ${status.urls.webHttp}/cert`);
      console.log('======================================================\n');
      console.log('Press Ctrl+C to stop.');
      break;
    }

    case 'status': {
      const server = new FlashcardServer({ db });
      const status = server.getStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case 'due': {
      const due = db.getDueCards({ limit: 10 });
      console.log(`\n📚 ${due.length} Flashcards Due for Review:`);
      for (const c of due) {
        console.log(`• [${c.id}] ${c.deckName} > ${c.chapterName} > ${c.topicName}`);
        console.log(`  Q: ${c.front}`);
        console.log(`  Health: ${c.healthScore}% | Reps: ${c.reps}`);
      }
      break;
    }

    case 'stats': {
      const stats = db.getAnalytics();
      console.log('\n📊 Spaced Repetition Analytics:');
      console.log(JSON.stringify(stats, null, 2));
      break;
    }

    case 'help':
    default: {
      console.log('Usage: flashcard-mcp <command>');
      console.log('Commands:');
      console.log('  start    Start the HTTP & HTTPS MCP Server and Web App');
      console.log('  status   Display network URLs and TLS certificate fingerprint');
      console.log('  due      List flashcards currently due for spaced repetition');
      console.log('  stats    Display memory retention and health statistics');
      break;
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
