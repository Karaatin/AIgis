# <img src="public/icons/icon128.png" alt="AIgis Icon" width="25" /> AIgis

> **Secure your AI interactions.**
> A browser extension that masks secrets and optimizes tokens in prompts locally before sending them to LLMs.

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Status](https://img.shields.io/badge/Status-In%20Development-orange)
![Platform](https://img.shields.io/badge/Platform-Based_on_Chromium-lightgrey)

---

## What is AIgis?

**AIgis** (pronounced like *Aegis*, the mythological shield) is a "Client-Side Privacy Firewall" for Large Language Models.

Many companies and individuals hesitate to use tools like ChatGPT, Claude, or Gemini due to data privacy concerns ("Shadow AI"). **AIgis solves this by intercepting your prompt directly in the browser.** It sanitizes sensitive data (PII) and optimizes data structures to save tokens *before* the request ever leaves your device.

**Your data stays yours. The LLM provider only sees what you want them to see.**

## Features

### 🔒 1. Privacy & Sanitization
* **PII Detection:** Automatically detects and masks emails, IBANs, paths, IP addresses and more.
* **Custom Dictionaries:** Define your own "forbidden words" (e.g., internal project names like `Project Apollo`) that get replaced with  placeholders (`CUSTOM_X`).
* **Local Processing:** All logic runs in your browser. No data is sent to any 3rd party server for verification.

### ⚡ 2. Token Optimization (TOON)
* **JSON to TOON:** AIgis automatically detects bulky JSON inputs and converts them into TOON (Token-Oriented Object Notation) before sending.
* **30-60% Savings:** TOON strips away redundant syntax (brackets, quotes) to drastically reduce token usage and API costs without losing structural integrity.
* **Lossless & Reversible:** Fully round-trip capable. Data converted to TOON is semantically identical to the original JSON, ensuring the LLM understands it perfectly.

### 🔄 3. Restoration
* **Context Restoration:** AIgis re-injects the original data into the LLM's response, so you see the real data while the LLM only saw the placeholders.

---

## 🛠️ How it Works

AIgis operates as a browser extension injecting a content script into supported LLM interfaces.

```mermaid
sequenceDiagram
    participant User
    participant AIgis (Browser)
    participant LLM (Cloud)

    User->>AIgis (Browser): Types Prompt ("Email to foo@bar.com...")
    Note over AIgis (Browser): 1. Intercept Submit<br/>2. Detect PII (foo@bar.com) and/or JSON<br/>3. Replace with [EMAIL_1] and/or TOON<br/>4. Save PII-Mapping locally
    AIgis (Browser)->>LLM (Cloud): Sends Sanitized Prompt ("Email to [EMAIL_1]...")
    LLM (Cloud)-->>AIgis (Browser): Returns Answer ("Email for [EMAIL_1]...")
    Note over AIgis (Browser): 5. Reverse PII-Mapping and TOON <br/>Replace [EMAIL_1] / TOON -> foo@bar.com / JSON
    AIgis (Browser)-->>User: Displays Final Answer
