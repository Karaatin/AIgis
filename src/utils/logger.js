/*
 * AIgis - Logger Utility
 * Wraps console methods to respect the global debug setting.
 */
export const Logger = {

    isDebug: false,
    isInitialized: false,

    init(settings) {

        if (!settings || !settings.settings) {
            this.isDebug = false;
            this.isInitialized = false;
            return;
        }

        this.isDebug = !!settings.settings.debugMode;

        if (!this.isDebug) {
            this.isInitialized = false;
            return;
        }

        if (!this.isInitialized) {
            const level = settings.settings.usageProfile || 'unknown';

            console.log("%c🛡️ [AIgis] Debug Mode Enabled", "color: #10b981; font-weight: bold;");
            console.log(`%c🛡️ [AIgis] Initialized. Protection Level: ${level}`, "color: #10b981;");

            this.isInitialized = true;
        }
    },

    /**
     * standard (only debug)
     */
    info(...args) {
        if (!this.isDebug) return;
        console.log(
            "%c🛡️ [AIgis]",
            "color: #3b82f6; font-weight: bold;",
            ...args
        );
    },

    /**
     * warning (only debug)
     */
    warn(...args) {
        if (!this.isDebug) return;
        console.warn(
            "%c🛡️ [AIgis Warning]",
            "color: #f59e0b; font-weight: bold;",
            ...args
        );
    },

    /**
     * error (always visible, critical for bug reports)
     */
    error(...args) {
        console.error(
            "%c🛡️ [AIgis ERROR]",
            "color: #ef4444; font-weight: bold; font-size: 1.1em;",
            ...args
        );
    },

    /**
     * starts a grouped output (only debug)
     */
    group(label) {
        if (!this.isDebug) return;
        console.group(`🛡️ ${label}`);
    },

    /**
     * ends a group
     */
    groupEnd() {
        if (!this.isDebug) return;
        console.groupEnd();
    }
};