/*
 * AIgis - Content Script
 * Intercepts prompts, sanitizes them locally, and manages the UI feedback.
 */
import { PiiDetector } from './modules/piiDetector.js';
import { ToonConverter } from './modules/toonConverter.js';
import { DomObserver } from './utils/domObserver.js';
import { ResponseHandler } from './modules/responseHandler.js';
import { StorageManager } from './utils/storage.js';
import { Logger } from './utils/logger.js';

const detector = new PiiDetector();
let isProcessing = false;
let settings = null;

(async () => {
    try {
        settings = await StorageManager.getSettings();
        Logger.init(settings);
        await detector.init();

        const vault = await StorageManager.getVault();
        ResponseHandler.updateVault(vault);

        if (settings.settings.enabled) {
            ResponseHandler.init();
            Logger.info("🛡️ [AIgis] Response Observer active.");
        }
        
        Logger.info("AIgis Content Script loaded & ready.");
    } catch (e) {
        console.error("AIgis Init Error:", e);
    }
})();

chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'sync') {

        Logger.info("🛡️ [AIgis] Sync Storage changed.");

        if (changes.settings) {
            const newSettings = changes.settings.newValue;
            
            if (settings) {
                settings.settings = { ...settings.settings, ...newSettings };
            } else {
                settings = { settings: newSettings };
            }
            
            Logger.init(settings);
            
            if (settings.settings.enabled) {
                Logger.info("🛡️ [AIgis] Re-activating Response Observer.");
                ResponseHandler.startObserver();
            } else {
                Logger.info("🛡️ [AIgis] Deactivating Response Observer (Global Switch OFF).");
                ResponseHandler.stopObserver();
            }
            
            detector.initialized = false; 
        }

        if (changes.modules || changes.customWords) {
            if (changes.modules && settings) {
                settings.modules = changes.modules.newValue;
            }
            detector.initialized = false;
        }

    }

    else if (namespace === 'local') {
        
        if (changes.vault) {
             Logger.info("🛡️ [AIgis] Vault updated. Syncing ResponseHandler cache.");
             const newVault = changes.vault.newValue;
             ResponseHandler.updateVault(newVault);
        }

    }
});

document.addEventListener('keydown', async (e) => {
    if (DomObserver.isReleasing) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        const input = DomObserver.findChatInput(e.target);
        if (input) {
            e.preventDefault();
            e.stopImmediatePropagation();
            await handleInteraction("ENTER", input, e);
        }
    }
}, true);

document.addEventListener('click', async (e) => {
    if (DomObserver.isReleasing) return;
    if (DomObserver.isSendButton(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        DomObserver.captureClick(e);
        await handleInteraction("CLICK", e.target, e);
    }
}, true);

async function handleInteraction(sourceType, target, originalEvent) {

    if (isProcessing) return;
    
    if (!settings || !settings.settings.enabled) {
        release(sourceType, target);
        return;
    }

    const inputEl = DomObserver.findChatInput(target);
    if (!inputEl) {
        release(sourceType, target);
        return;
    }

    isProcessing = true;

    if (settings.settings.debugMode) {
        DomObserver.highlight(inputEl, "#f59e0b", 500);
    }

    try {
        const originalText = DomObserver.readText(inputEl);
        
        if (!originalText || originalText.trim().length === 0) {
            isProcessing = false;
            release(sourceType, inputEl);
            return;
        }

        Logger.group("Processing Prompt");
        Logger.info("Original:", originalText);

        // pipeline
        let currentText = originalText;
        let toonSavings = 0;
        const statsDiff = { piiCounts: {} };

        // 1. pii
        const piiResult = await detector.sanitize(currentText);
        currentText = piiResult.sanitizedText;
        statsDiff.piiCounts = piiResult.piiCounts;

        const textAfterPii = currentText; 

        // 2. toon
        if (settings.modules.toon) {
            currentText = ToonConverter.convert(currentText);
            
            const lengthDiff = textAfterPii.length - currentText.length;
            if (lengthDiff > 0) {
                toonSavings = lengthDiff; 
            }
        }
        
        statsDiff.toonSavings = toonSavings;

        Logger.info("Sanitized:", currentText);
        Logger.groupEnd();
        // pipeline end

        if (currentText !== originalText) {
            DomObserver.writeText(inputEl, currentText);
            
            if (settings.settings.debugMode) {
                DomObserver.highlight(inputEl, "#10b981", 1000);
            }
        }
        
        StorageManager.updateStats(statsDiff);

        setTimeout(() => {
            isProcessing = false;
            release(sourceType, inputEl);
        }, 50);

    } catch (err) {
        Logger.error("Error during processing:", err);
        isProcessing = false;
        release(sourceType, inputEl);
    }
}

function release(sourceType, element) {
    if (sourceType === "CLICK") {
        DomObserver.releaseClick();
    } else if (sourceType === "ENTER") {
        DomObserver.releaseEnter(element);
    }
}