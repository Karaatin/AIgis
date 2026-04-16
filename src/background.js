/*
 * AIgis - Background Service Worker
 * Handles lifecycle events (Install, Update) and initialization.
 */
import { StorageManager } from './utils/storage.js';
import { Logger } from './utils/logger.js';
import { ToonConverter } from './modules/toonConverter.js';

const initLogger = async () => {
    try {
        const data = await StorageManager.getSettings();
        Logger.init(data);

        // ensure icon state matches initial settings on boot
        if (data && data.settings) {
            updateIconState(data.settings.enabled);
        }
    } catch (e) {
        console.error("Failed to init logger:", e);
    }
};

const updateIconState = (isEnabled) => {
    const suffix = isEnabled ? "" : "-off";
    chrome.action.setIcon({
        path: {
            "16": `/icons/icon16${suffix}.png`,
            "48": `/icons/icon48${suffix}.png`,
            "128": `/icons/icon128${suffix}.png`
        }
    }).catch(err => console.warn("Icon update failed:", err));
};

/**
 * lifecycle: ON INSTALLED / UPDATED
 */
chrome.runtime.onInstalled.addListener(async (details) => {

    await initLogger();
    Logger.info(`AIgis Service Worker: Event '${details.reason}' detected.`);

    chrome.contextMenus.create({
        id: "decode-toon",
        title: "Decode TOON to Clipboard",
        contexts: ["selection"]
    });

    if (details.reason === 'install') {
        Logger.info("Fresh install detected. Forcing defaults.");

        const defaults = StorageManager.defaults;

        await StorageManager.saveSettings(defaults.settings);

        await new Promise(resolve => chrome.storage.local.set({ stats: defaults.stats }, resolve));

        await StorageManager.saveVault({});

        chrome.runtime.openOptionsPage();
    }

    else if (details.reason === 'update') {
        Logger.info("Update/Reload detected. Keeping existing data.");


        const currentStats = await StorageManager.getStats();

        chrome.storage.local.set({ stats: currentStats });
    }
});

/**
 * lifecycle: ON STARTUP
 */
chrome.runtime.onStartup.addListener(async () => {
    await initLogger();
    Logger.info("AIgis Service Worker started.");
});

chrome.storage.onChanged.addListener((changes, namespace) => {

    if (namespace === 'sync' && changes.settings) {

        const newSettingsObj = changes.settings.newValue;

        if (newSettingsObj) {
            Logger.init({ settings: newSettingsObj });
            Logger.info("🛡️ [AIgis Background] Debug Mode updated via Settings.");

            if (newSettingsObj.enabled !== undefined) {
                updateIconState(newSettingsObj.enabled);
            }
        }
    }

});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "decode-toon" && info.selectionText) {
        let textToDecode = info.selectionText;
        let cleanText = textToDecode.trim();

        // strip markdown if present
        if (cleanText.includes('AIgis:TOON')) {
            const parts = cleanText.split('AIgis:TOON');
            if (parts.length > 1) {
                cleanText = parts[1].trim();
            }
        }

        const decodedMsg = ToonConverter.decodeRaw(cleanText);
        if (decodedMsg) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (text) => { navigator.clipboard.writeText(text); },
                args: [decodedMsg]
            });
        }
    }
});