/*
 * AIgis - Subscriptions UI
 * Renders the Subscriptions tab: add/remove feeds, toggles, status,
 * config-diff confirmations and the single-config-provider rule.
 */
import { StorageManager } from '../utils/storage.js';
import { SubscriptionSync } from '../modules/subscriptions/subscriptionSync.js';
import { SubscriptionSchema } from '../modules/subscriptions/subscriptionSchema.js';
import { MODULES_UI } from '../utils/modules.js';

const SETTING_LABELS = {
    enabled: 'Protection Layer',
    debugMode: 'Debug Mode',
    usageProfile: 'Sensitivity Profile',
    peekMode: 'Peek Mode',
    vaultPruneDays: 'Vault Auto-Prune (days)'
};

function esc(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
}

function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
}

async function hasOriginPermission(sub) {
    if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.contains) return true;
    try {
        return await chrome.permissions.contains({ origins: [new URL(sub.url).origin + '/*'] });
    } catch (e) {
        return true;
    }
}

const SubModal = {
    overlay: null, title: null, body: null, actions: null,

    init() {
        this.overlay = document.getElementById('subChoiceModal');
        this.title = document.getElementById('subModalTitle');
        this.body = document.getElementById('subModalBody');
        this.actions = document.getElementById('subModalActions');
    },

    open(title, bodyHTML, buttons) {
        this.title.textContent = title;
        this.body.innerHTML = bodyHTML;
        this.actions.innerHTML = '';
        this.overlay.setAttribute('aria-hidden', 'false');
        this.overlay.classList.add('open');

        return new Promise((resolve) => {
            buttons.forEach(({ label, className, value }) => {
                const btn = document.createElement('button');
                btn.className = `btn ${className}`;
                btn.textContent = label;
                btn.addEventListener('click', () => {
                    this.overlay.setAttribute('aria-hidden', 'true');
                    this.overlay.classList.remove('open');
                    resolve(value);
                });
                this.actions.appendChild(btn);
            });
        });
    }
};

function describeConfig(config) {
    const lines = [];
    for (const [key, val] of Object.entries(config.settings || {})) {
        let display = val;
        if (typeof val === 'boolean') display = val ? 'ON' : 'OFF';
        lines.push(`<li><strong>${esc(SETTING_LABELS[key] || key)}</strong> → ${esc(display)}</li>`);
    }
    for (const [key, val] of Object.entries(config.modules || {})) {
        const mod = MODULES_UI.find(m => m.id === key);
        lines.push(`<li><strong>Module: ${esc(mod ? mod.label : key)}</strong> → ${val ? 'ON' : 'OFF'}</li>`);
    }
    return lines.length ? `<ul class="sub-config-list">${lines.join('')}</ul>` : '<p>(no managed keys)</p>';
}

async function confirmConfig(sub, config) {
    const choice = await SubModal.open(
        'Apply Managed Settings?',
        `<p><strong>${esc(sub.name)}</strong> (${esc(hostOf(sub.url))}) wants to manage these settings:</p>
         ${describeConfig(config)}
         <p class="sub-modal-note">Your own settings stay saved and return unchanged when you disable this. AIgis will ask again whenever the feed changes its settings.</p>`,
        [
            { label: 'Cancel', className: 'secondary', value: false },
            { label: 'Apply Settings', className: 'primary', value: true }
        ]
    );
    return choice;
}

export function initSubscriptionsUI({ settingsData, save, onDataChanged }) {

    SubModal.init();

    const listContainer = document.getElementById('subscriptionListContainer');
    const urlInput = document.getElementById('subUrlInput');
    const addBtn = document.getElementById('subAddBtn');
    const feedbackMsg = document.getElementById('subFeedbackMsg');
    const updateAllBtn = document.getElementById('subUpdateAllBtn');
    const globalToggle = document.getElementById('subGlobalToggle');

    const subsGloballyEnabled = () => settingsData.settings.subscriptionsEnabled !== false;

    let feedbackTimer = null;
    function showFeedback(msg, isError = false) {
        clearTimeout(feedbackTimer);
        feedbackMsg.textContent = msg;
        feedbackMsg.style.color = isError ? 'var(--danger, #ef4444)' : '';
        feedbackMsg.style.opacity = '1';
        feedbackTimer = setTimeout(() => {
            feedbackMsg.style.opacity = '0';
            feedbackTimer = setTimeout(() => { feedbackMsg.textContent = ''; }, 350);
        }, 4000);
    }

    async function notifyChanged() {
        if (onDataChanged) await onDataChanged();
    }

    async function handleConfigPending(subId, result) {
        if (!result || !result.configPending) return;
        const subs = await StorageManager.getSubscriptions();
        const sub = subs.find(s => s.id === subId);
        const data = await StorageManager.getSubscriptionData();
        const cache = data[subId];
        if (!sub || !cache || !cache.config) return;

        const accepted = await confirmConfig(sub, cache.config);
        if (accepted) {
            await StorageManager.updateSubscription(subId, { acceptedConfigHash: result.configHash });
        }
    }

    async function render() {
        const subs = await StorageManager.getSubscriptions();
        const data = await StorageManager.getSubscriptionData();

        globalToggle.checked = subsGloballyEnabled();
        listContainer.classList.toggle('subs-paused', !subsGloballyEnabled());
        updateAllBtn.disabled = !subsGloballyEnabled();

        if (subs.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">No subscriptions yet. Add a feed URL above to get started.</div>';
            return;
        }

        listContainer.innerHTML = '';

        for (const sub of subs) {
            const cache = data[sub.id];
            const wordCount = cache && Array.isArray(cache.customWords) ? cache.customWords.length : 0;
            const hasConfig = !!(cache && cache.config);
            const cfgCount = hasConfig
                ? Object.keys(cache.config.settings || {}).length + Object.keys(cache.config.modules || {}).length
                : 0;
            const hasPerm = await hasOriginPermission(sub);

            const statusTitle = sub.lastStatus === 'error'
                ? `Sync failed: ${sub.lastError || 'unknown error'}`
                : (sub.lastUpdated ? `Last synced: ${new Date(sub.lastUpdated).toLocaleString()}` : 'Waiting for first sync');

            const item = document.createElement('div');
            item.className = `sub-item ${sub.enabled ? '' : 'sub-disabled'}${sub.lastStatus === 'error' ? ' sub-error' : ''}`;
            item.innerHTML = `
                <div class="sub-item-header">
                    <div class="sub-avatar" title="${esc(statusTitle)}">
                        ${esc((sub.name || '?').charAt(0).toUpperCase())}
                        <span class="status-dot ${esc(sub.lastStatus)}"></span>
                    </div>
                    <div class="sub-item-titles">
                        <strong>${esc(sub.name)}</strong>
                        <small class="sub-host">${esc(hostOf(sub.url))}</small>
                    </div>
                    <div class="sub-item-actions">
                        <button class="sub-icon-btn sub-update" title="Update now">↻</button>
                        <label class="toggle-switch toggle-switch-sm" title="Enable or disable this subscription">
                            <input type="checkbox" class="t-enabled" ${sub.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <button class="sub-icon-btn danger sub-delete" title="Delete subscription">✕</button>
                    </div>
                </div>
                ${sub.description ? `<p class="sub-desc">${esc(sub.description)}</p>` : ''}
                <div class="sub-chips">
                    <span class="sub-chip" title="Masking entries provided by this feed">📚 ${wordCount} ${wordCount === 1 ? 'entry' : 'entries'}</span>
                    ${cfgCount > 0 ? `<span class="sub-chip${sub.applyConfig ? ' accent' : ''}" title="${sub.applyConfig ? 'This feed is currently managing these settings.' : 'This feed provides settings. Check Apply Settings to use them.'}">⚙️ ${sub.applyConfig ? 'managing' : 'provides'} ${cfgCount} setting${cfgCount === 1 ? '' : 's'}</span>` : ''}
                    ${sub.rejectedPatterns > 0 ? `<span class="sub-chip warn" title="Patterns failed validation (invalid or unsafe regex) and are NOT being masked.">⚠️ ${sub.rejectedPatterns} pattern${sub.rejectedPatterns === 1 ? '' : 's'} rejected</span>` : ''}
                    ${!hasPerm ? '<button class="sub-chip warn sub-grant" title="This device has not granted AIgis access to the feed server yet (permission grants do not sync between devices). Click to grant access and sync.">🔓 grant access</button>' : ''}
                    ${sub.lastStatus === 'error' ? `<span class="sub-chip danger" title="${esc(sub.lastError || 'sync error')}">⚠️ Sync failed</span>` : ''}
                </div>
                <div class="sub-footer">
                    <div class="sub-footer-toggles">
                        <label class="sub-toggle" title="Let this feed manage extension settings. Requires confirmation; only one feed can manage settings.">
                            <input type="checkbox" class="t-config" ${sub.applyConfig ? 'checked' : ''} ${hasConfig || sub.applyConfig ? '' : 'disabled'}>
                            Apply Settings
                        </label>
                        <label class="sub-toggle" title="Execute /regex/ patterns from this feed. Only for fully trusted sources - otherwise patterns are matched as literal text.">
                            <input type="checkbox" class="t-regex" ${sub.allowRegex ? 'checked' : ''}>
                            Allow Regular Expressions
                        </label>
                    </div>
                    <span class="sub-sync-time">${sub.lastUpdated ? `Last synced ${esc(new Date(sub.lastUpdated).toLocaleString())}` : 'Not synced yet'}</span>
                </div>
            `;

            item.querySelector('.t-enabled').addEventListener('change', async (e) => {
                await StorageManager.updateSubscription(sub.id, { enabled: e.target.checked });
                if (e.target.checked && !cache) {
                    const res = await SubscriptionSync.syncOne({ ...sub, enabled: true }, { manual: true });
                    await handleConfigPending(sub.id, res);
                }
                await render();
                await notifyChanged();
            });

            item.querySelector('.t-config').addEventListener('change', async (e) => {
                const checkbox = e.target;

                if (!checkbox.checked) {
                    await StorageManager.updateSubscription(sub.id, { applyConfig: false });
                    await render();
                    await notifyChanged();
                    return;
                }

                const all = await StorageManager.getSubscriptions();
                const current = all.find(s => s.applyConfig && s.id !== sub.id);
                if (current) {
                    const switchIt = await SubModal.open(
                        'Switch Configuration Provider?',
                        `<p>Subscription <strong>${esc(current.name)}</strong> is currently applying settings overrides. Do you want to switch and apply configurations from <strong>${esc(sub.name)}</strong> instead?</p>`,
                        [
                            { label: 'Cancel', className: 'secondary', value: false },
                            { label: 'Switch Provider', className: 'primary', value: true }
                        ]
                    );
                    if (!switchIt) { checkbox.checked = false; return; }
                    await StorageManager.updateSubscription(current.id, { applyConfig: false });
                }

                const freshData = await StorageManager.getSubscriptionData();
                const freshCache = freshData[sub.id];
                if (!freshCache || !freshCache.config) {
                    showFeedback('This feed does not provide a settings block.', true);
                    checkbox.checked = false;
                    await render();
                    return;
                }

                const accepted = await confirmConfig(sub, freshCache.config);
                if (!accepted) { checkbox.checked = false; await render(); return; }

                const hash = await SubscriptionSchema.hashConfig(freshCache.config);
                await StorageManager.updateSubscription(sub.id, { applyConfig: true, acceptedConfigHash: hash });
                await render();
                await notifyChanged();
            });

            item.querySelector('.t-regex').addEventListener('change', async (e) => {
                const checkbox = e.target;
                if (checkbox.checked) {
                    const sure = await SubModal.open(
                        'Allow Regular Expressions?',
                        `<p>Regex patterns from <strong>${esc(sub.name)}</strong> will be executed by the masking engine. AIgis validates patterns (compile check, length cap, backtracking heuristic), but you should only enable this for sources you fully trust.</p>`,
                        [
                            { label: 'Cancel', className: 'secondary', value: false },
                            { label: 'Allow Regex', className: 'primary', value: true }
                        ]
                    );
                    if (!sure) { checkbox.checked = false; return; }
                }
                await StorageManager.updateSubscription(sub.id, { allowRegex: checkbox.checked });
                const updated = (await StorageManager.getSubscriptions()).find(s => s.id === sub.id);
                if (updated && updated.enabled) {
                    const res = await SubscriptionSync.syncOne(updated, { force: true });
                    await handleConfigPending(sub.id, res);
                }
                await render();
                await notifyChanged();
            });

            const grantBtn = item.querySelector('.sub-grant');
            if (grantBtn) {
                grantBtn.addEventListener('click', async () => {
                    try {
                        const origin = new URL(sub.url).origin + '/*';
                        const granted = await chrome.permissions.request({ origins: [origin] });
                        if (!granted) return;
                        const res = await SubscriptionSync.syncOne(sub, { manual: true });
                        await handleConfigPending(sub.id, res);
                        await render();
                        await notifyChanged();
                    } catch (e) {
                        showFeedback('Permission request failed.', true);
                    }
                });
            }

            item.querySelector('.sub-update').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.classList.add('spinning');
                btn.disabled = true;
                const res = await SubscriptionSync.syncOne(sub, { manual: true });
                if (res.status === 'skipped') {
                    showFeedback('Just updated - please wait a moment before trying again.');
                } else if (res.status === 'error') {
                    showFeedback(`Update failed: ${res.error}`, true);
                }
                await handleConfigPending(sub.id, res);
                await render();
                await notifyChanged();
            });

            item.querySelector('.sub-delete').addEventListener('click', async () => {
                const choice = await SubModal.open(
                    'Delete Subscription',
                    `<p>Delete <strong>${esc(sub.name)}</strong>?</p>
                     <p>Do you want to permanently delete all custom entries associated with this subscription, or import them into your local Custom List?</p>`,
                    [
                        { label: 'Cancel', className: 'secondary', value: 'cancel' },
                        { label: 'Keep Local Copy', className: 'primary', value: 'import' },
                        { label: 'Delete Entries', className: 'danger', value: 'delete' }
                    ]
                );
                if (choice === 'cancel') return;
                await StorageManager.removeSubscription(sub.id, { importWords: choice === 'import' });
                if (choice === 'import') {
                    showFeedback(wordCount > 0
                        ? `${wordCount} feed entr${wordCount === 1 ? 'y' : 'ies'} imported into your local Custom List.`
                        : 'Subscription removed - it had no entries to import.');
                }
                await render();
                await notifyChanged();
            });

            listContainer.appendChild(item);
        }
    }

    addBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        if (!url.toLowerCase().startsWith('https://')) {
            showFeedback('Subscription URLs must use HTTPS.', true);
            return;
        }

        if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
            try {
                const origin = new URL(url).origin + '/*';
                const granted = await chrome.permissions.request({ origins: [origin] });
                if (!granted) {
                    showFeedback('Permission for this host was declined.', true);
                    return;
                }
            } catch (e) {
                showFeedback('Invalid URL.', true);
                return;
            }
        }

        // allowRegex always starts OFF; it can be enabled per subscription
        // afterwards (with its own warning dialog)
        const res = await StorageManager.addSubscription({ url });
        if (res.error) {
            showFeedback(res.error, true);
            return;
        }

        urlInput.value = '';
        showFeedback('Subscribed. Fetching feed…');

        const syncRes = await SubscriptionSync.syncOne(res.subscription, { force: true });
        if (syncRes.status === 'error') {
            showFeedback(`Subscribed, but the first sync failed: ${syncRes.error}`, true);
        } else {
            showFeedback('Feed synced successfully.');
        }
        await render();
        await notifyChanged();
    });

    urlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBtn.click(); });

    // global master switch: pauses words, overlays and scheduled syncs at
    // once; each subscription keeps its own enabled state for later
    globalToggle.addEventListener('change', async () => {
        settingsData.settings.subscriptionsEnabled = globalToggle.checked;
        await save();
        await render();
        await notifyChanged();
    });

    updateAllBtn.addEventListener('click', async () => {
        updateAllBtn.disabled = true;
        updateAllBtn.textContent = 'Updating…';
        const subs = await StorageManager.getSubscriptions();
        for (const sub of subs.filter(s => s.enabled)) {
            const res = await SubscriptionSync.syncOne(sub, { manual: true });
            await handleConfigPending(sub.id, res);
        }
        updateAllBtn.disabled = false;
        updateAllBtn.textContent = 'Update All Now';
        await render();
        await notifyChanged();
    });

    render();
    return { render };
}

/**
 * Word entries of all enabled subscriptions for the unified dictionary view.
 * @returns {Promise<Array<{word: string, subId: string, subName: string}>>}
 */
export async function getSubscriptionWordEntries() {
    const subs = await StorageManager.getSubscriptions();
    const data = await StorageManager.getSubscriptionData();
    const entries = [];
    for (const sub of subs.filter(s => s.enabled)) {
        const cache = data[sub.id];
        if (!cache || !Array.isArray(cache.customWords)) continue;
        for (const word of cache.customWords) {
            entries.push({ word, subId: sub.id, subName: sub.name });
        }
    }
    return entries;
}
