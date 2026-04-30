# AIgis Privacy Policy

*Last Updated: April 2026*

AIgis ("we", "our", or "us") is an open-source browser extension designed from the ground up to protect your privacy and secure your interactions with large language models (LLMs). This Privacy Policy explains how our extension operates and clearly outlines our strict zero-data-collection infrastructure.

## 1. Zero Data Collection
**We do not collect, transmit, store, or sell any of your personal data.** 
AIgis operates 100% locally within your web browser. There are no external servers, no telemetry, no analytics, and no "phone home" mechanics built into the extension.

## 2. How AIgis Processes Data
The core function of AIgis is to intercept your text input, mask sensitive information, and decode responses.
* **Local Processing Only:** All text scanning, masking, and Token Optimization Object Notation (TOON) decoding happens exclusively in your browser's local memory.
* **No Network Transmission:** The original sensitive data (PII, secrets, keys) that AIgis masks is **never** sent to the LLM (like ChatGPT or Claude) and is **never** sent to us. Only the sanitized, placeholder versions (e.g., `[EMAIL_1]`) leave your computer.

## 3. Local Storage
AIgis utilizes your browser's native storage APIs (`chrome.storage.local` and `chrome.storage.sync`) solely to:
1. Save your dashboard configuration preferences (e.g., Active Modules, Sensitivity Profile).
2. Temporarily store your Custom Dictionary and the "Vault" (the mapping between your real data and the generic placeholders) so that it can successfully unmask the LLM's response when it arrives. To further protect your privacy, Vault data is automatically pruned and permanently deleted from local storage after a user-configurable period (default 30 days) to minimize forensic risk.
This data never leaves your device.

## 4. Permissions Explained
To function correctly, AIgis requests the following browser permissions:
* **`activeTab` & `scripting`**: Required to read the text you type into chat boxes and to visually overlay the secure badges on the webpage.
* **`storage`**: Required to save your settings and the local Vault mappings.
* **`contextMenus`**: Required to add the right-click "Decode TOON to Clipboard" utility.
* **Host Permissions (e.g., `https://chatgpt.com/*`)**: AIgis only runs on the specific, explicit LLM platforms listed in our manifest. It cannot and does not monitor your browsing activity on any other websites.

## 5. Changes to This Policy
Because AIgis is open-source and local-first, the fundamental nature of our zero-data infrastructure will not change. However, if we add new features that require additional permissions, we will update this policy accordingly.

## 6. Contact & Source Code
AIgis is fully open-source. You can independently verify every line of our code, report issues, or contribute by visiting our [GitHub Repository](https://github.com/Karaatin/AIgis).

## 7. Limitation of Liability and Disclaimer
While AIgis is built to detect and mask Personally Identifiable Information (PII) before it leaves your device, **no detection system is 100% flawless.** Edge cases, misspelled words, or obfuscated formats may not be caught by our detection engine. AIgis is provided "as is" and its developers are not responsible for any data leaks, privacy breaches, or damages resulting from the use or failure of this extension. You are ultimately responsible for reviewing the data you submit to LLMs.
