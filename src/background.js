/*
 * AIgis - Background Service Worker
 * Handles lifecycle events (Install, Update) and initialization.
 */
import { StorageManager } from './utils/storage.js';
import { Logger } from './utils/logger.js';

const initLogger = async () => {
    try {
        const data = await StorageManager.getSettings();
        Logger.init(data); 
    } catch (e) {
        console.error("Failed to init logger:", e);
    }
};

/**
 * lifecycle: ON INSTALLED / UPDATED
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    
    await initLogger();
    Logger.info(`AIgis Service Worker: Event '${details.reason}' detected.`);

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
        }
    }
    
});