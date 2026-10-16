# 🤖 Step-by-Step Guide: Connecting Google Gemini to Lumino Flashcards MCP

This guide walks you through connecting **Google Gemini** (gemini.google.com, Google AI Studio, or Gemini CLI) directly to your **Lumino Flashcard MCP Server** running on your phone.

---

## 🌐 Server Coordinates

When Lumino Flashcard MCP is running, it exposes the following endpoints:

| Service | Protocol | Endpoint URL | Description |
|---|---|---|---|
| **Mobile Web App** | HTTP | `http://10.58.147.133:8880` | Local web dashboard & PWA |
| **Secure Web App** | HTTPS | `https://10.58.147.133:8443` | TLS encrypted web app |
| **Gemini MCP (HTTP/Stream)** | HTTPS | `https://10.58.147.133:8443/mcp` | Direct JSON-RPC 2.0 endpoint |
| **Gemini MCP (SSE Stream)** | HTTPS | `https://10.58.147.133:8443/sse` | Server-Sent Events transport |
| **Download TLS Cert** | HTTP/HTTPS | `http://10.58.147.133:8880/cert` | Download `lumino-flashcards.crt` |

*(Note: If connecting locally on the same device, replace `10.58.147.133` with `127.0.0.1` or `localhost`)*.

---

## 🔑 Step 1: Trust the Local HTTPS Certificate

Modern web browsers (including Chrome and Android WebView) enforce strict HTTPS security when communicating from `https://gemini.google.com`. Lumino automatically generates a 2048-bit RSA X.509 certificate with Subject Alternative Names (SAN) for all phone IP addresses.

### To trust the certificate:
1. Open your browser and navigate to:
   ```
   http://10.58.147.133:8880/cert
   ```
   or tap **Download TLS Cert** inside the Lumino app settings.
2. The file `lumino-flashcards-ca.crt` will be downloaded.
3. On Android:
   - Go to **Android Settings › Security › More security settings › Encryption & credentials**.
   - Tap **Install a certificate › CA Certificate**.
   - Select the downloaded `lumino-flashcards-ca.crt` file and confirm.
4. On your PC (if using Gemini from desktop):
   - Double click `lumino-flashcards-ca.crt` and click **Install Certificate › Trusted Root Certification Authorities**.

---

## ⚡ Step 2: Add Lumino to Gemini

### In Google Gemini Web / AI Studio:
1. Go to **Settings › Custom Tools / Model Context Protocol**.
2. Click **Add Server / Register Tool**.
3. Set **Server URL**:
   ```
   https://10.58.147.133:8443/mcp
   ```
   *(or `https://10.58.147.133:8443/sse` if using SSE transport)*.
4. Set **Protocol**: `Model Context Protocol (JSON-RPC 2.0)`.
5. Click **Connect**. Gemini will instantly negotiate the protocol handshake (`initialize`) and discover all 14 tools!

---

## 💬 Step 3: Example Prompts for Gemini

Once connected, you can converse naturally with Gemini about your flashcards:

### 1. Interactive Study & Quizzing
> *"Gemini, fetch my due flashcards from my Lumino server. Quiz me on them one by one. Do not reveal the answer until I submit my response. Then grade my answer and record the review rating!"*

### 2. High-Yield Flashcard Generation
> *"I'm studying the Paxos consensus algorithm. Generate 6 high-yield flashcards with front questions, detailed answers, and hints. Place them in deck 'Computer Science & Distributed Systems', chapter 'Distributed Consensus', and topic 'Paxos Protocol'."*

### 3. Memory Health & Analytics Inspection
> *"Check my Lumino spaced repetition analytics. What is my current memory health percentage, retention rate, and how many cards are due tomorrow?"*

### 4. Algorithm Parameter Tuning
> *"I want to be quizzed more aggressively on cards I get wrong. Call 'configure_srs_settings' to increase my health lapse penalty to -35% and set health interval sensitivity to 85%."*

---

## ⚙️ In-App Settings Control

In the Lumino mobile application, go to the **Settings** tab (gear icon on the bottom floating glass dock):
- Toggle the MCP server **ON/OFF** with a single tap.
- Copy your HTTPS and SSE URLs with the **Copy** button.
- Run a live latency check using the **Test MCP Connection** button.
- Fine-tune all Spaced Repetition sliders in real-time.
