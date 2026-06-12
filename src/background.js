/*
 * AIgis - Background Service Worker
 * Handles lifecycle events (Install, Update) and initialization.
 */
import { StorageManager } from './utils/storage.js';
import { Logger } from './utils/logger.js';
import { ToonConverter } from './modules/toonConverter.js';
import { SubscriptionSync } from './modules/subscriptions/subscriptionSync.js';

const initLogger = async () => {
    try {
        const data = await StorageManager.getEffectiveSettings();
        Logger.init(data);

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].url) {
            await evaluateIconState(tabs[0].id, tabs[0].url);
        } else if (data && data.settings) {
            updateIconState(null, data.settings.enabled);
        }
    } catch (e) {
        console.error("Failed to init logger:", e);
    }
};

const updateIconState = (tabId, isEnabled) => {
    const suffix = isEnabled ? "" : "-off";
    const options = {
        path: {
            "16": `/icons/icon16${suffix}.png`,
            "48": `/icons/icon48${suffix}.png`,
            "128": `/icons/icon128${suffix}.png`
        }
    };
    if (tabId) options.tabId = tabId;

    chrome.action.setIcon(options).catch(err => Logger.warn("Icon update failed:", err));
};

function isSupportedUrl(url) {
    if (!url) return false;
    try {
        const manifest = chrome.runtime.getManifest();
        const matches = manifest.content_scripts?.[0]?.matches || [];

        const hostname = new URL(url).hostname;

        return matches.some(pattern => {
            // extract domain from match pattern (e.g. "https://chatgpt.com/*" -> "chatgpt.com")
            const match = pattern.match(/:\/\/(?:\*\.)?([^/]+)/);
            if (match && match[1]) {
                const domain = match[1];
                return hostname === domain || hostname.endsWith('.' + domain);
            }
            return false;
        });
    } catch { return false; }
}

async function evaluateIconState(tabId, url) {
    try {
        const data = await StorageManager.getEffectiveSettings();
        const isGlobalEnabled = data?.settings?.enabled ?? true;

        if (!isGlobalEnabled) {
            updateIconState(tabId, false);
            return;
        }

        updateIconState(tabId, isSupportedUrl(url));
    } catch (e) {
        Logger.warn("evaluateIconState failed:", e);
    }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) await evaluateIconState(tab.id, tab.url);
    } catch (e) { }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    await evaluateIconState(tabId, tab.url);
});

/**
 * lifecycle: ON INSTALLED / UPDATED
 */
chrome.runtime.onInstalled.addListener(async (details) => {

    await initLogger();
    Logger.info(`AIgis Service Worker: Event '${details.reason}' detected.`);

    // cleanup expired vault entries
    await StorageManager.pruneVault();

    await SubscriptionSync.ensureAlarm();
    SubscriptionSync.syncAll();

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

    await SubscriptionSync.ensureAlarm();
    SubscriptionSync.syncAll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SubscriptionSync.ALARM_NAME) {
        SubscriptionSync.syncAll();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {

    if (namespace === 'sync' && changes.subscriptions) {
        SubscriptionSync.syncMissing();
    }

    if (namespace === 'sync' && changes.settings) {

        const newSettingsObj = changes.settings.newValue;

        if (newSettingsObj) {
            StorageManager.getEffectiveSettings().then(eff => Logger.init(eff));
            Logger.info("Background: Debug Mode updated via Settings.");

            if (newSettingsObj.enabled !== undefined) {
                chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
                    if (tabs.length > 0 && tabs[0].url) {
                        await evaluateIconState(tabs[0].id, tabs[0].url);
                    } else {
                        updateIconState(null, newSettingsObj.enabled);
                    }
                });
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