# ✨ Lumino — Liquid Glass Flashcard MCP

> **100% Free & Open-Source Mobile Flashcard Application with Adaptive Spaced Repetition (SRS), Liquid Glass iOS Aesthetics, and an HTTPS Model Context Protocol (MCP) Server for Google Gemini.**

---

## 🌟 Key Highlights

- **🔒 Built-in HTTPS MCP Server**: Connects directly to **Google Gemini** (Gemini Web, AI Studio, Claude Desktop, or custom MCP agents) over encrypted TLS. Features automatic multi-SAN certificate generation for `localhost`, `127.0.0.1`, Wi-Fi LAN (`10.58.147.x`), and cellular IP addresses.
- **📱 Apple iPhone Liquid Glass Aesthetic**: Translucent frosted surfaces (`backdrop-filter: blur(28px) saturate(190%)`), rounded corners (`border-radius: 28px` to `36px`), specular edge highlights, ambient glowing liquid gradients, and 3D perspective card flip with Web Audio sound synthesis and haptics.
- **🧠 Adaptive Health-Modulated Spaced Repetition**: Memory health score (0–100%) dynamically drives review intervals. Frequent mistakes compress intervals so weak memory is reinforced earlier; solid recall health earns longevity bonuses.
- **🗂️ Infinite Hierarchical Taxonomy**: Organize cards by **Decks (Folders) › Chapters (Categories) › Topics › Tags**.
- **⚙️ Configurable via In-App Settings & MCP**: Toggle the MCP server, adjust port/protocol, tune ease factors, lapse penalties, and health weighting directly in the settings UI or through MCP tool calls.
- **📦 Dual Distribution**: Run either as an installed native signed Android APK (`FlashcardMCP.apk` with foreground service keeping the server alive in the background) or as a high-performance progressive web app (PWA) on `http://localhost:8880` / `https://localhost:8443`.
- **🔍 REA Reverse-Engineered & Verified**: Inspected and verified using REA (Reverse Engineer Anything), ensuring 100% free software purity, zero proprietary telemetry, and strict integrity verification.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE GEMINI CLIENT                     │
│    (gemini.google.com / Google AI Studio / MCP Client)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
               HTTPS (TLS) / SSE JSON-RPC 2.0
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                LUMINO FLASHCARD MCP SERVER                  │
│                   (Port :8443 / :8880)                      │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  MCP Server Protocol Engine (14 Tools, Resources)   │   │
│   │  • list_decks_and_topics    • create_flashcard      │   │
│   │  • get_due_flashcards       • review_flashcard      │   │
│   │  • get_srs_analytics        • configure_srs_settings│   │
│   │  • batch_create_flashcards  • generate_study_guide  │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │  Adaptive SRS Engine (Health Score + SM-2 Algorithm)│   │
│   │  • Health Factor Decay   • Dynamic Interval Mod     │   │
│   │  • Ease Adjustment       • Lapse Penalty & Streaks  │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │  Atomic Resilient File Store (flashcards.json)      │   │
│   │  Decks › Chapters › Topics › Cards › Review History │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Mobile Liquid Glass UI & Native Android Wrapper    │   │
│   │  • 3D Flip Card Scene    • Touch Gestures (Swipes)  │   │
│   │  • Bottom Glass Dock     • Foreground Service Keep  │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Start Server via Terminal
```bash
# Start background server daemon
flashcard-mcp start

# Check active status, URLs, and TLS fingerprint
flashcard-mcp status

# View cards currently due for study
flashcard-mcp due
```

### 2. Access on Your Phone or PC
- **Mobile Web App (HTTP)**: `http://10.58.147.133:8880` (or `http://localhost:8880`)
- **Secure Web App (HTTPS)**: `https://10.58.147.133:8443` (or `https://localhost:8443`)

### 3. Install the Android APK
The signed production Android APK is ready at:
```bash
/data/data/com.termux/files/home/FlashcardMCP.apk
```
Install it directly on Android:
```bash
termux-open /data/data/com.termux/files/home/FlashcardMCP.apk
```

---

## 🤖 Connecting Google Gemini to Lumino MCP

Because web browsers enforce mixed-content security, connecting browser-based Gemini to an external server requires **HTTPS**. Lumino generates valid X.509 TLS certificates covering your local IP addresses.

### Step 1: Trust the Certificate (One-Time Setup)
1. In the app settings (or via browser), tap **Download TLS Cert** (`http://<YOUR-IP>:8880/cert`).
2. On Android: Go to **Settings › Security & Privacy › More Security Settings › Encryption & Credentials › Install a Certificate › CA Certificate** and select `lumino-flashcards.crt`.

### Step 2: Configure Gemini / AI Studio
1. In Google Gemini or Google AI Studio, navigate to **Custom Tools / Model Context Protocol**.
2. Select **Add Server**.
3. Choose **Transport: Server-Sent Events (SSE)** or **HTTP JSON-RPC**:
   - **Gemini HTTPS URL (Stream)**: `https://<YOUR-IP>:8443/mcp`
   - **Gemini SSE Stream URL**: `https://<YOUR-IP>:8443/sse`
4. Click **Connect**. Gemini will query `tools/list` and gain full control of your flashcards!

### Sample Prompts for Gemini:
> *"What flashcards are currently due in my Lumino app? Quiz me on them one by one."*

> *"Generate 5 high-yield flashcards on Raft Consensus in my Computer Science deck under chapter 'Distributed Systems' and topic 'Consensus'."*

> *"Check my memory retention analytics and tell me which topics I am struggling with."*

---

## 🧠 Adaptive Health-Modulated SRS Algorithm

Unlike static SuperMemo implementations, Lumino modulates review intervals based on your **Memory Health Score**:

$$\text{Health}_{\text{new}} = \text{Health}_{\text{prev}} + \Delta_{\text{health}}$$

- **When you get a card wrong (Rating 1: Again)**:
  - Streak resets to 0.
  - Health drops by the configured lapse penalty (default -25%).
  - The card is sent to the re-learning queue with a compressed interval.
- **When you get a card right (Rating 3: Good or 4: Easy)**:
  - Streak increments.
  - Health increases with diminishing returns as it approaches 100%.
  - Ease factor increases.
- **Dynamic Interval Modulation**:
  $$\text{Interval}_{\text{effective}} = \text{Interval}_{\text{nominal}} \times \left(1 + (\text{HealthFactor} - 1) \times \text{Sensitivity}\right)$$
  - Cards with **low health (< 50%)** receive significantly compressed intervals (forcing earlier recall).
  - Cards with **high health (> 80%)** earn a stability bonus stretching future intervals.

---

## 🛠️ MCP Tools Reference

| Tool Name | Description | Key Arguments |
|---|---|---|
| `list_decks_and_topics` | Browse the hierarchical tree of decks, chapters, and topics. | None |
| `create_deck` | Create a new deck collection. | `name`, `description`, `color` |
| `create_flashcard` | Add a card with question, answer, hint, and taxonomy. | `front`, `back`, `hint`, `deckName`, `chapterName`, `topicName`, `tags` |
| `batch_create_flashcards` | Bulk create cards from AI-generated lists. | `cards` (array) |
| `get_flashcard` | Get card details and full review history. | `cardId` |
| `get_due_flashcards` | Fetch cards currently due for review. | `deckId`, `chapterName`, `topicName`, `limit` |
| `review_flashcard` | Record study rating and update SRS metrics. | `cardId`, `rating` (1-4), `timeTakenMs` |
| `get_srs_analytics` | Retrieve retention stats, streak, and health breakdown. | None |
| `configure_srs_settings` | Adjust SRS weights, ease factors, and health sensitivity. | `startingEase`, `lapsePenaltyHealth`, `successBoostHealth`, `healthIntervalSensitivity` |
| `get_srs_settings` | Read current SRS parameters. | None |
| `search_flashcards` | Full-text search across cards, topics, and tags. | `query`, `status` |
| `generate_study_guide` | Compile structured markdown study guide of a deck/topic. | `deckId`, `chapterName`, `topicName` |

---

## 📱 Mobile Native & Apple Liquid Glass Design

- **Frosted Translucent Surfaces**: `backdrop-filter: blur(28px) saturate(190%)` with 1px specular highlight borders.
- **Smooth Curvature**: `border-radius: 28px` to `36px` on main cards and sheets.
- **3D Card Flip**: Realistic 3D perspective flip with ambient lighting and Web Audio synthesized sound effects.
- **Touch Gestures**:
  - **Swipe Left**: Again (Failed, Red glow)
  - **Swipe Down**: Hard (Struggled, Amber glow)
  - **Swipe Right**: Good (Pass, Emerald glow)
  - **Swipe Up**: Easy (Effortless, Cyan glow)
- **Dynamic Island Status**: Top pill displays real-time MCP status, active port, and due count.
- **Floating Bottom Dock**: Liquid glass dock for quick navigation between Study, Decks, Create, Analytics, and Settings.

---

## 📜 License & Free Software Guarantee

Lumino Flashcard MCP is released under the **MIT License**. It is 100% free software, standalone, and respects user privacy with zero cloud telemetry.
