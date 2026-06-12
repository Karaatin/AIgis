/*
 * AIgis - Options Script
 */
import { StorageManager } from '../utils/storage.js';
import { MODULES_UI } from '../utils/modules.js';
import { Logger } from '../utils/logger.js';
import { initSubscriptionsUI, getSubscriptionWordEntries } from './subscriptionsUi.js';
import { PatternValidator } from '../modules/patternValidator.js';

// modal helpers
const Modal = {
    overlay: document.getElementById('appModal'),
    title: document.getElementById('modalTitle'),
    msg: document.getElementById('modalMessage'),
    inputContainer: document.getElementById('modalInputContainer'),
    input: document.getElementById('modalInput'),
    btnConfirm: document.getElementById('modalConfirm'),
    btnCancel: document.getElementById('modalCancel'),

    resolvePromise: null,

    init() {
        this.btnCancel.addEventListener('click', () => this.close(false));
        this.btnConfirm.addEventListener('click', () => this.close(true));
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.close(true);
        });
    },

    /**
     * @param {string} title 
     * @param {string} message 
     * @param {string} type - 'confirm' | 'prompt' | 'danger'
     * @param {string} [defaultValue] - For prompt
     */
    async open(title, message, type = 'confirm', defaultValue = '') {
        this.title.textContent = title;
        this.msg.textContent = message;

        this.btnConfirm.className = 'btn primary';
        this.btnConfirm.textContent = 'Confirm';

        this.overlay.setAttribute('aria-hidden', 'false');

        if (type === 'danger') {
            this.btnConfirm.className = 'btn danger';
            this.btnConfirm.textContent = 'Delete';
            this.inputContainer.classList.add('hidden');
        } else if (type === 'prompt') {
            this.inputContainer.classList.remove('hidden');
            this.input.value = defaultValue;
        } else {
            this.inputContainer.classList.add('hidden');
        }

        this.overlay.classList.add('open');

        setTimeout(() => {
            if (type === 'prompt') this.input.focus();
            else this.btnConfirm.focus();
        }, 100);

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    },

    close(isConfirmed) {

        this.overlay.setAttribute('aria-hidden', 'true');
        this.overlay.classList.remove('open');
        const value = this.input.value.trim();

        if (this.resolvePromise) {
            if (isConfirmed && !this.inputContainer.classList.contains('hidden')) {
                this.resolvePromise(value);
            } else {
                this.resolvePromise(isConfirmed);
            }
        }
        this.resolvePromise = null;
    }
};

document.addEventListener('DOMContentLoaded', async () => {

    Modal.init();

    // load data from storage
    const settingsData = await StorageManager.getSettings();
    const statsData = await StorageManager.getStats();
    const save = async () => await StorageManager.saveSettings(settingsData);

    Logger.init(settingsData);

    let effectiveData = await StorageManager.getEffectiveSettings();
    let subscriptionEntries = await getSubscriptionWordEntries();

    const escHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    };
    const lockedSettings = () => (effectiveData.overrides && effectiveData.overrides.config.settings) || {};
    const lockedModules = () => (effectiveData.overrides && effectiveData.overrides.config.modules) || {};
    const lockBadgeHTML = () => {
        const o = effectiveData.overrides;
        return `<span class="locked-badge" title="Managed by the subscription '${escHtml(o.providerName)}' (${escHtml(o.providerHost)}). Disable 'Apply Settings' on that subscription to regain control.">🔒 Managed by ${escHtml(o.providerName)}</span>`;
    };
    function setRowLock(inputEl, isLocked) {
        if (!inputEl) return;
        inputEl.disabled = isLocked;
        const row = inputEl.closest('.setting-row') || inputEl.closest('.card');
        const h3 = row ? row.querySelector('h3') : null;
        if (!h3) return;
        const existing = h3.querySelector('.locked-badge');
        if (isLocked && !existing) h3.insertAdjacentHTML('beforeend', lockBadgeHTML());
        if (!isLocked && existing) existing.remove();
    }

    // version badge
    try {
        const manifest = chrome.runtime.getManifest();
        const v = manifest.version;
        const b1 = document.querySelector('.version-badge');
        const b2 = document.querySelector('.build-badge');
        if (b1) b1.textContent = `v${v}`;
        if (b2) b2.textContent = `Version ${v}`;
    } catch (e) { Logger.warn("Version badge update failed:", e); }

    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.tab-content');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === btn.dataset.tab) sec.classList.add('active');
            });
            if (btn.dataset.tab === 'dictionary') {
                renderVaultView();
            }
        });
    });

    // general settings
    const optEnabled = document.getElementById('optEnabled');
    const optDebug = document.getElementById('optDebug');
    const optPeekMode = document.getElementById('optPeekMode');

    const modulesGrid = document.getElementById('modulesGrid');
    function renderModulesGrid() {
        if (!modulesGrid) return;
        modulesGrid.innerHTML = '';
        const isGlobalOn = effectiveData.settings.enabled;
        const modLocks = lockedModules();
        MODULES_UI.forEach(mod => {
            const isModOn = effectiveData.modules[mod.id];
            const isLocked = mod.id in modLocks;
            let stateClass = !isGlobalOn ? 'disabled-view' : (isModOn ? 'active' : 'inactive');
            const card = document.createElement('div');
            card.className = `module-card ${stateClass}${isLocked ? ' locked' : ''}`;
            if (isLocked && effectiveData.overrides) {
                card.title = `Managed by '${effectiveData.overrides.providerName}' (${effectiveData.overrides.providerHost})`;
            }
            card.innerHTML = `<span class="module-icon">${mod.icon}</span><span class="module-label">${mod.label}</span>${isLocked ? '<span class="module-lock">🔒</span>' : ''}`;
            card.addEventListener('click', async () => {
                if (isLocked) return;
                if (!isGlobalOn) {
                    settingsData.settings.enabled = true;
                    for (let key in settingsData.modules) settingsData.modules[key] = false;
                    settingsData.modules[mod.id] = true;
                } else {
                    settingsData.modules[mod.id] = !settingsData.modules[mod.id];
                    if (!Object.values(settingsData.modules).some(v => v)) settingsData.settings.enabled = false;
                }
                await save();
                renderMainToggles();
            });
            modulesGrid.appendChild(card);
        });
    }

    const renderMainToggles = () => {
        const locks = lockedSettings();

        optEnabled.checked = effectiveData.settings.enabled;
        optDebug.checked = effectiveData.settings.debugMode;
        optPeekMode.checked = effectiveData.settings.peekMode;
        setRowLock(optEnabled, 'enabled' in locks);
        setRowLock(optDebug, 'debugMode' in locks);
        setRowLock(optPeekMode, 'peekMode' in locks);

        const radioStrict = document.getElementById('modeStrict');
        const radioDev = document.getElementById('modeDev');
        const profileLocked = 'usageProfile' in locks;
        if (radioStrict && radioDev) {
            if (effectiveData.settings.usageProfile === 'strict') radioStrict.checked = true; else radioDev.checked = true;
            radioStrict.disabled = profileLocked;
            radioDev.disabled = profileLocked;
            setRowLock(radioStrict, profileLocked);
            document.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('locked', profileLocked));
        }

        const pruneInput = document.getElementById('vaultPruneDays');
        if (pruneInput) {
            const pruneLocked = 'vaultPruneDays' in locks;
            pruneInput.disabled = pruneLocked;
            pruneInput.value = pruneLocked
                ? effectiveData.settings.vaultPruneDays
                : (settingsData.settings.vaultPruneDays || 30);

            const pruneLabel = pruneInput.closest('.prune-label');
            if (pruneLabel) {
                const existing = pruneLabel.querySelector('.locked-badge');
                if (pruneLocked && !existing) pruneLabel.insertAdjacentHTML('beforeend', lockBadgeHTML());
                if (!pruneLocked && existing) existing.remove();
            }
        }

        renderModulesGrid();
    };
    renderMainToggles();

    optEnabled.addEventListener('change', () => {
        settingsData.settings.enabled = optEnabled.checked;
        if (settingsData.settings.enabled && !Object.values(settingsData.modules).some(v => v)) {
            for (let key in settingsData.modules) settingsData.modules[key] = true;
        }
        save();
        renderMainToggles();
    });
    optDebug.addEventListener('change', () => { settingsData.settings.debugMode = optDebug.checked; save(); });
    optPeekMode.addEventListener('change', () => { settingsData.settings.peekMode = optPeekMode.checked; save(); });

    const modeStrict = document.getElementById('modeStrict');
    const modeDev = document.getElementById('modeDev');
    const handleMode = (e) => { if (e.target.checked) { settingsData.settings.usageProfile = e.target.value; save(); } };
    modeStrict.addEventListener('change', handleMode);
    modeDev.addEventListener('change', handleMode);


    const dictInput = document.getElementById('dictInput');
    const dictAddBtn = document.getElementById('dictAddBtn');
    const wordListContainer = document.getElementById('wordListContainer');
    const btnClearDictionary = document.getElementById('btnClearDictionary');

    const btnBulkDeleteDict = document.getElementById('btnBulkDeleteDict');
    const countDictSpan = document.getElementById('countDict');
    const checkAllDict = document.getElementById('checkAllDict');
    let selectedDictWords = new Set();

    let dictSearchQuery = '';
    let dictSortDir = 'asc';
    const DICT_ITEMS_PER_PAGE = 50;
    let dictCurrentPage = 1;

    const dictSearch = document.getElementById('dictSearch');
    const sortDictWord = document.getElementById('sortDictWord');
    const dictPrevBtn = document.getElementById('dictPrevBtn');
    const dictNextBtn = document.getElementById('dictNextBtn');
    const dictPageInfo = document.getElementById('dictPageInfo');

    dictSearch.addEventListener('input', (e) => {
        dictSearchQuery = e.target.value.toLowerCase();
        dictCurrentPage = 1;
        renderDictionary();
    });

    const dictSourceFilterEl = document.getElementById('dictSourceFilter');
    const dictSubFilterEl = document.getElementById('dictSubFilter');
    let dictSourceFilterValue = 'all';
    let dictSubFilterValue = 'all';

    function populateSubFilter() {
        const seen = new Map();
        subscriptionEntries.forEach(e => seen.set(e.subId, e.subName));
        const current = dictSubFilterEl.value;
        dictSubFilterEl.innerHTML = '<option value="all">All Subscriptions</option>';
        for (const [id, name] of seen) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            dictSubFilterEl.appendChild(opt);
        }
        dictSubFilterEl.value = [...seen.keys()].includes(current) ? current : 'all';
        dictSubFilterValue = dictSubFilterEl.value;
    }

    dictSourceFilterEl.addEventListener('change', () => {
        dictSourceFilterValue = dictSourceFilterEl.value;
        dictSubFilterEl.classList.toggle('hidden', dictSourceFilterValue !== 'subscriptions');
        dictSubFilterValue = 'all';
        dictSubFilterEl.value = 'all';
        dictCurrentPage = 1;
        renderDictionary();
    });

    dictSubFilterEl.addEventListener('change', () => {
        dictSubFilterValue = dictSubFilterEl.value;
        dictCurrentPage = 1;
        renderDictionary();
    });

    dictPrevBtn.addEventListener('click', () => { if (dictCurrentPage > 1) { dictCurrentPage--; renderDictionary(); } });
    dictNextBtn.addEventListener('click', () => { dictCurrentPage++; renderDictionary(); });

    sortDictWord.addEventListener('click', () => {
        dictSortDir = dictSortDir === 'asc' ? 'desc' : 'asc';
        sortDictWord.querySelector('.sort-icon').textContent = dictSortDir === 'asc' ? '↓' : '↑';
        renderDictionary();
    });

    function renderDictionary() {
        wordListContainer.innerHTML = '';
        selectedDictWords.clear();
        updateDictBulkUI();
        checkAllDict.checked = false;

        let entries = [];
        if (dictSourceFilterValue !== 'subscriptions') {
            entries = (settingsData.customWords || []).map(w => ({ word: w, source: 'local', subId: null, subName: null }));
        }
        if (dictSourceFilterValue !== 'local') {
            let subEntries = subscriptionEntries;
            if (dictSourceFilterValue === 'subscriptions' && dictSubFilterValue !== 'all') {
                subEntries = subEntries.filter(e => e.subId === dictSubFilterValue);
            }
            entries = entries.concat(subEntries.map(e => ({ word: e.word, source: 'sub', subId: e.subId, subName: e.subName })));
        }

        if (dictSearchQuery) {
            entries = entries.filter(e => e.word.toLowerCase().includes(dictSearchQuery));
        }

        entries.sort((a, b) => {
            const comp = a.word.localeCompare(b.word);
            return dictSortDir === 'asc' ? comp : -comp;
        });

        if (entries.length === 0) {
            wordListContainer.innerHTML = dictSearchQuery
                ? '<div class="empty-state">No entries match your search.</div>'
                : '<div class="empty-state">No custom entries defined yet.</div>';

            dictPageInfo.textContent = `Page 1 of 1`;
            dictPrevBtn.disabled = true;
            dictNextBtn.disabled = true;
            return;
        }

        const totalPages = Math.ceil(entries.length / DICT_ITEMS_PER_PAGE);
        if (dictCurrentPage > totalPages) dictCurrentPage = totalPages;

        dictPageInfo.textContent = `Page ${dictCurrentPage} of ${totalPages}`;
        dictPrevBtn.disabled = dictCurrentPage === 1;
        dictNextBtn.disabled = dictCurrentPage === totalPages;

        const paginatedList = entries.slice((dictCurrentPage - 1) * DICT_ITEMS_PER_PAGE, dictCurrentPage * DICT_ITEMS_PER_PAGE);

        const fragment = document.createDocumentFragment();

        paginatedList.forEach(entry => {
            const word = entry.word;
            const row = document.createElement('div');
            row.className = `list-item${entry.source === 'sub' ? ' sub-entry' : ''}`;

            const isRegex = /^\/(.+)\/[a-z]*$/.test(word);
            let displayHTML = escHtml(word);

            if (isRegex) {
                const match = word.match(/^\/(.+)\/([a-z]*)$/);
                const pattern = match ? match[1] : word;
                const flags = match && match[2] ? ` <span class="regex-flags">/${escHtml(match[2])}</span>` : '';
                displayHTML = `<code class="regex-code">${escHtml(pattern)}${flags}</code><span class="badge badge-regex">REGEX</span>`;
            }

            if (entry.source === 'sub') {
                displayHTML += `<span class="badge badge-source" title="Provided by subscription - read-only. Manage it in the Subscriptions tab.">${escHtml(entry.subName)}</span>`;
                row.innerHTML = `
                    <div class="col-check"></div>
                    <span class="item-word col-1">${displayHTML}</span>
                    <div class="item-actions"><span class="sub-readonly" title="Read-only subscription entry">🔒</span></div>`;
                fragment.appendChild(row);
                return;
            }

            row.innerHTML = `
                <div class="col-check"><input type="checkbox" class="item-check" value="${escHtml(word)}"></div>
                <span class="item-word col-1">${displayHTML}</span>
                <div class="item-actions">
                    <button class="action-icon-btn edit" title="Edit">✎</button>
                    <button class="action-icon-btn delete" title="Delete">✕</button>
                </div>`;

            row.querySelector('.delete').addEventListener('click', async () => {
                const modalTitle = isRegex ? 'Delete Regex Pattern' : 'Delete Word';
                const displayPattern = isRegex ? word.match(/^\/(.+)\/[a-z]*$/)[1] : word;
                const modalText = isRegex ? `Remove regex pattern "${displayPattern}" from custom dictionary?` : `Remove "${word}" from custom dictionary?`;

                const confirm = await Modal.open(modalTitle, modalText, 'danger');
                if (confirm) {
                    settingsData.customWords = settingsData.customWords.filter(w => w !== word);
                    await save();
                    renderDictionary();
                }
            });

            row.querySelector('.edit').addEventListener('click', async () => {
                const newWord = await Modal.open('Edit Word', 'Change the blocked word:', 'prompt', word);
                if (newWord && newWord !== word) {
                    settingsData.customWords = settingsData.customWords.filter(w => w !== word);
                    settingsData.customWords.push(newWord);
                    await save();
                    renderDictionary();
                }
            });

            const cb = row.querySelector('.item-check');
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedDictWords.add(word);
                    row.classList.add('selected');
                } else {
                    selectedDictWords.delete(word);
                    row.classList.remove('selected');
                }
                updateDictBulkUI();
            });

            fragment.appendChild(row);
        });

        wordListContainer.appendChild(fragment);
    }

    function updateDictBulkUI() {
        const count = selectedDictWords.size;
        countDictSpan.textContent = count;
        if (count > 0) btnBulkDeleteDict.classList.remove('hidden');
        else btnBulkDeleteDict.classList.add('hidden');
    }

    checkAllDict.addEventListener('change', (e) => {
        const checkboxes = wordListContainer.querySelectorAll('.item-check');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            cb.dispatchEvent(new Event('change'));
        });
    });

    btnBulkDeleteDict.addEventListener('click', async () => {
        const confirm = await Modal.open('Delete Selected', `Remove ${selectedDictWords.size} custom entries?`, 'danger');
        if (confirm) {
            settingsData.customWords = settingsData.customWords.filter(w => !selectedDictWords.has(w));
            await save();
            renderDictionary();
        }
    });

    const dictFeedbackMsg = document.getElementById('dictFeedbackMsg');

    function showDictFeedback(msg) {
        if (!dictFeedbackMsg) return;
        dictFeedbackMsg.textContent = msg;
        dictFeedbackMsg.style.opacity = '1';
        setTimeout(() => dictFeedbackMsg.style.opacity = '0', 2000);
    }

    dictAddBtn.addEventListener('click', async () => {
        const word = dictInput.value.trim();
        if (word) {
            const isRegex = /^\/(.+)\/[a-z]*$/.test(word);
            const displayPattern = isRegex ? word.match(/^\/(.+)\/[a-z]*$/)[1] : word;

            // regex entries pass the same safety pipeline as subscription
            // feeds: invalid or ReDoS-prone patterns are rejected up front
            if (isRegex) {
                const parts = word.match(/^\/(.+)\/([a-z]*)$/);
                const verdict = PatternValidator.checkPattern(parts[1], parts[2]);
                if (!verdict.ok) {
                    showDictFeedback(`Rejected: ${verdict.reason}`);
                    return;
                }
            }

            const exists = settingsData.customWords.some(w => w.toLowerCase() === word.toLowerCase());
            if (!exists) {
                settingsData.customWords.push(word);
                await save();
                renderDictionary();
                showDictFeedback(isRegex ? `Added "${displayPattern}" (regex) to block list` : `Added "${word}" to block list`);
            } else {
                showDictFeedback(isRegex ? `Regex pattern "${displayPattern}" already blocked` : `"${word}" already blocked`);
            }
            dictInput.value = '';
        }
    });
    dictInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') dictAddBtn.click(); });

    btnClearDictionary.addEventListener('click', async () => {
        const confirm = await Modal.open('Clear Dictionary', 'Really delete ALL custom dictionary entries?', 'danger');
        if (confirm) {
            settingsData.customWords = [];
            await save();
            dictCurrentPage = 1;
            renderDictionary();
        }
    });
    renderDictionary();
    populateSubFilter();

    const refreshSubscriptionViews = async () => {
        const fresh = await StorageManager.getSettings();
        settingsData.settings = fresh.settings;
        settingsData.modules = fresh.modules;
        settingsData.customWords = fresh.customWords;

        effectiveData = await StorageManager.getEffectiveSettings();
        subscriptionEntries = await getSubscriptionWordEntries();
        populateSubFilter();
        renderMainToggles();
        renderDictionary();
    };

    const subscriptionsUI = initSubscriptionsUI({ settingsData, save, onDataChanged: refreshSubscriptionViews });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(async (changes, namespace) => {
            if ((namespace === 'local' && changes.subscriptionData) ||
                (namespace === 'sync' && changes.subscriptions)) {
                await refreshSubscriptionViews();
                subscriptionsUI.render();
            }
        });
    }

    // statistics logic
    const btnClearStats = document.getElementById('btnClearStats');
    function renderStats() {
        const statPii = document.getElementById('totalPii');
        const statTokens = document.getElementById('totalTokens');
        const statPrompts = document.getElementById('totalPrompts');
        const statsBody = document.getElementById('statsTableBody');

        statPii.textContent = statsData.piiTotal || 0;
        statPrompts.textContent = statsData.totalPrompts || 0;

        const toonStats = statsData.toon || { conversions: 0, originalChars: 0, optimizedChars: 0, estimatedTokensSaved: 0 };
        let saved = Math.round(toonStats.estimatedTokensSaved || 0);
        statTokens.textContent = saved > 1000 ? (saved / 1000).toFixed(1) + 'k' : saved;

        statsBody.innerHTML = '';

        // pii
        const piiHeader = document.createElement('tr');
        piiHeader.innerHTML = '<td colspan="2" class="group-header">PII MASKING STATS</td>';
        statsBody.appendChild(piiHeader);

        const piiCategories = ['email', 'iban', 'phone', 'address', 'ip', 'url', 'path', 'secret', 'custom'];
        piiCategories.forEach(key => {
            const val = statsData.piiBreakdown[key] || 0;
            const dimClass = val > 0 ? '' : 'txt-dimmed';
            const row = document.createElement('tr');
            row.innerHTML = `<td class="txt-cap font-medium ${dimClass}">${key.toUpperCase()} Masking</td><td class="txt-mono ${dimClass}">${val}</td>`;
            statsBody.appendChild(row);
        });

        // toon
        const toonHeader = document.createElement('tr');
        toonHeader.innerHTML = '<td colspan="2" class="group-header" style="padding-top:20px;">TOKEN OPTIMIZATION (TOON)</td>';
        statsBody.appendChild(toonHeader);

        const toonItems = [
            { label: 'Conversions Performed', val: toonStats.conversions },
            { label: 'Original Characters', val: toonStats.originalChars },
            { label: 'Optimized Characters', val: toonStats.optimizedChars },
            { label: 'Estimated Tokens Saved', val: Math.round(toonStats.estimatedTokensSaved) }
        ];

        toonItems.forEach(item => {
            const dimClass = item.val > 0 ? '' : 'txt-dimmed';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="font-medium ${dimClass}">${item.label}</td>
                <td class="txt-mono ${dimClass}">${item.val}</td>
            `;
            statsBody.appendChild(row);
        });
    }
    renderStats();

    btnClearStats.addEventListener('click', async () => {
        const confirm = await Modal.open('Reset Statistics', 'Reset all impact statistics? This does NOT delete the vault.', 'danger');
        if (confirm) {
            chrome.storage.local.set({ stats: StorageManager.defaults.stats }, () => location.reload());
        }
    });


    // vault logic
    const vaultPruneDaysInput = document.getElementById('vaultPruneDays');
    if (vaultPruneDaysInput) {
        vaultPruneDaysInput.addEventListener('change', async (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) { val = 1; e.target.value = 1; }
            settingsData.settings.vaultPruneDays = val;
            await StorageManager.saveSettings(settingsData);
        });
    }

    const vaultListContainer = document.getElementById('vaultListContainer');
    const btnClearVault = document.getElementById('btnClearVault');
    const btnExportVault = document.getElementById('btnExportVault');
    const btnImportVault = document.getElementById('btnImportVault');
    const fileImportVault = document.getElementById('fileImportVault');

    const btnBulkDeleteVault = document.getElementById('btnBulkDeleteVault');
    const countVaultSpan = document.getElementById('countVault');
    const checkAllVault = document.getElementById('checkAllVault');
    let selectedVaultItems = new Set();

    let vaultSearchQuery = '';
    let vaultSortBy = 'placeholder';
    let vaultSortDir = 'desc';
    const VAULT_ITEMS_PER_PAGE = 50;
    let vaultCurrentPage = 1;

    const vaultSearch = document.getElementById('vaultSearch');
    const sortVaultPlaceholder = document.getElementById('sortVaultPlaceholder');
    const sortVaultOriginal = document.getElementById('sortVaultOriginal');
    const vaultPrevBtn = document.getElementById('vaultPrevBtn');
    const vaultNextBtn = document.getElementById('vaultNextBtn');
    const vaultPageInfo = document.getElementById('vaultPageInfo');

    vaultSearch.addEventListener('input', (e) => {
        vaultSearchQuery = e.target.value.toLowerCase();
        vaultCurrentPage = 1;
        renderVaultView();
    });

    vaultPrevBtn.addEventListener('click', () => { if (vaultCurrentPage > 1) { vaultCurrentPage--; renderVaultView(); } });
    vaultNextBtn.addEventListener('click', () => { vaultCurrentPage++; renderVaultView(); });

    const handleVaultSort = (colId) => {
        if (vaultSortBy === colId) {
            vaultSortDir = vaultSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            vaultSortBy = colId;
            vaultSortDir = 'asc';
        }

        sortVaultPlaceholder.classList.remove('active-sort');
        sortVaultOriginal.classList.remove('active-sort');
        sortVaultPlaceholder.querySelector('.sort-icon').textContent = '↕';
        sortVaultOriginal.querySelector('.sort-icon').textContent = '↕';

        const activeElem = colId === 'placeholder' ? sortVaultPlaceholder : sortVaultOriginal;
        activeElem.classList.add('active-sort');
        activeElem.querySelector('.sort-icon').textContent = vaultSortDir === 'asc' ? '↓' : '↑';

        renderVaultView();
    };

    sortVaultPlaceholder.addEventListener('click', () => handleVaultSort('placeholder'));
    sortVaultOriginal.addEventListener('click', () => handleVaultSort('original'));

    async function renderVaultView() {
        selectedVaultItems.clear();
        updateVaultBulkUI();
        checkAllVault.checked = false;

        const vaultData = await StorageManager.getVault();
        const mappings = vaultData.mappings || {};
        let entries = Object.entries(mappings);

        if (vaultSearchQuery) {
            entries = entries.filter(([placeholder, entry]) => {
                const original = entry?.val || entry;
                return placeholder.toLowerCase().includes(vaultSearchQuery) ||
                    (original && original.toLowerCase().includes(vaultSearchQuery));
            });
        }

        entries.sort((a, b) => {
            let valA = vaultSortBy === 'placeholder' ? a[0] : (a[1]?.val || a[1]);
            let valB = vaultSortBy === 'placeholder' ? b[0] : (b[1]?.val || b[1]);

            valA = (valA || '').toLowerCase();
            valB = (valB || '').toLowerCase();

            const comp = valA.localeCompare(valB);
            return vaultSortDir === 'asc' ? comp : -comp;
        });

        vaultListContainer.innerHTML = '';
        if (entries.length === 0) {
            vaultListContainer.innerHTML = vaultSearchQuery
                ? '<div class="empty-state">No vault items match your search.</div>'
                : '<div class="empty-state">Vault is empty. No sensitive data stored.</div>';

            vaultPageInfo.textContent = `Page 1 of 1`;
            vaultPrevBtn.disabled = true;
            vaultNextBtn.disabled = true;
            return;
        }

        const totalPages = Math.ceil(entries.length / VAULT_ITEMS_PER_PAGE);
        if (vaultCurrentPage > totalPages) vaultCurrentPage = totalPages;

        vaultPageInfo.textContent = `Page ${vaultCurrentPage} of ${totalPages}`;
        vaultPrevBtn.disabled = vaultCurrentPage === 1;
        vaultNextBtn.disabled = vaultCurrentPage === totalPages;

        const paginatedEntries = entries.slice((vaultCurrentPage - 1) * VAULT_ITEMS_PER_PAGE, vaultCurrentPage * VAULT_ITEMS_PER_PAGE);

        const fragment = document.createDocumentFragment();

        paginatedEntries.forEach(([placeholder, entry]) => {
            const row = document.createElement('div');
            row.className = 'list-item';

            const original = entry?.val || entry;
            let expirationText = '';

            if (entry?.expiresAt) {
                const daysRemaining = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
                const dateStr = new Date(entry.expiresAt).toLocaleDateString();
                const colorClass = daysRemaining < 3 ? 'txt-danger' : 'txt-dimmed';
                expirationText = `<div class="prune-date ${colorClass}" style="font-size: 0.75rem; margin-top: 4px;">Prunes on ${dateStr} (${daysRemaining}d)</div>`;
            }

            row.innerHTML = `
                <div class="col-check"><input type="checkbox" class="vault-check" value="${placeholder}"></div>
                <div class="col-1">
                    <span class="mono-accent">${placeholder}</span>
                    ${expirationText}
                </div>
                <span class="col-2" title="${original}">${original}</span>
                <div class="item-actions text-right" style="width: 80px; justify-content: flex-end;">
                    <button class="action-icon-btn btn-renew" data-ph="${placeholder}" title="Renew Expiration">↻</button>
                    <button class="action-icon-btn delete" title="Delete">✕</button>
                </div>
            `;

            const cb = row.querySelector('.vault-check');
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedVaultItems.add(placeholder);
                    row.classList.add('selected');
                } else {
                    selectedVaultItems.delete(placeholder);
                    row.classList.remove('selected');
                }
                updateVaultBulkUI();
            });

            row.querySelector('.delete').addEventListener('click', async () => {
                const confirm = await Modal.open('Delete Entry', `Permanently delete placeholder "${placeholder}" with value "${original}" from Vault?`, 'danger');
                if (confirm) {
                    await StorageManager.removeVaultItems([placeholder]);
                    renderVaultView();
                }
            });

            const renewBtn = row.querySelector('.btn-renew');
            if (renewBtn) {
                renewBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await StorageManager.renewMapping(placeholder);
                    renderVaultView();
                });
            }

            fragment.appendChild(row);
        });

        vaultListContainer.appendChild(fragment);
    }

    function updateVaultBulkUI() {
        const count = selectedVaultItems.size;
        countVaultSpan.textContent = count;
        if (count > 0) btnBulkDeleteVault.classList.remove('hidden');
        else btnBulkDeleteVault.classList.add('hidden');
    }

    checkAllVault.addEventListener('change', (e) => {
        const checkboxes = vaultListContainer.querySelectorAll('.vault-check');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            cb.dispatchEvent(new Event('change'));
        });
    });

    btnBulkDeleteVault.addEventListener('click', async () => {
        const confirm = await Modal.open('Delete Selected', `Permanently delete ${selectedVaultItems.size} entries from Vault?`, 'danger');
        if (confirm) {
            await StorageManager.removeVaultItems(Array.from(selectedVaultItems));
            renderVaultView();
        }
    });

    btnClearVault.addEventListener('click', async () => {
        const confirm = await Modal.open('Clear Vault', 'Clear ALL restoration data? This action cannot be undone.', 'danger');
        if (confirm) {
            await StorageManager.clearVault();
            renderVaultView();
        }
    });

    document.getElementById('btnExportConfig').addEventListener('click', () => StorageManager.exportConfig());
    document.getElementById('btnExportDictionary').addEventListener('click', () => StorageManager.exportDictionary());
    document.getElementById('btnExportVault').addEventListener('click', () => StorageManager.exportVault());

    const fileImportSettings = document.getElementById('fileImportSettings');
    document.getElementById('btnImportSettings').addEventListener('click', () => fileImportSettings.click());
    fileImportSettings.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const res = await StorageManager.importData(ev.target.result);
            if (res === "vault") {
                alert('Vault imported successfully!');
                renderVaultView();
            } else if (res === "dictionary") {
                alert('Dictionary imported and merged successfully!');
                renderDictionary();
            } else if (res === "configuration" || res === "settings") {
                alert('Configuration imported! Reloading...');
                location.reload();
            } else {
                alert('Import failed. Invalid file format.');
            }
            fileImportSettings.value = "";
        };
        reader.readAsText(file);
    });
    const updateBtn = document.getElementById('btnUpdateCheck');
    const updateStatus = document.getElementById('updateStatus');
    const GITHUB_REPO = "Karaatin/AIgis";

    function isNewerVersion(current, remote) {
        const cParts = current.split('.').map(Number);
        const rParts = remote.split('.').map(Number);
        for (let i = 0; i < Math.max(cParts.length, rParts.length); i++) {
            const c = cParts[i] || 0;
            const r = rParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    }

    if (updateBtn) {
        updateBtn.addEventListener('click', async () => {
            updateStatus.innerHTML = "Checking GitHub...";
            updateStatus.style.color = "#666";

            try {
                const currentVer = chrome.runtime.getManifest().version;

                const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);

                if (!response.ok) {
                    if (response.status === 404) throw new Error("No releases found.");
                    if (response.status === 403) throw new Error("API rate limit. Try later.");
                    throw new Error("GitHub API Error");
                }

                const data = await response.json();

                const remoteVer = data.tag_name.replace(/^v/, '');

                if (isNewerVersion(currentVer, remoteVer)) {
                    updateStatus.innerHTML = `
                        <span style="color: #ea580c; font-weight: bold;">Update available: v${remoteVer}</span><br>
                        <a href="${data.html_url}" target="_blank" style="color: #0369a1; text-decoration: underline; font-size: 0.9em;">Download from GitHub</a>
                    `;
                } else {
                    updateStatus.innerHTML = `<span style="color: #16a34a; font-weight: bold;">You are up to date (v${currentVer}).</span>`;
                }

            } catch (error) {
                Logger.error("Update check failed:", error);
                updateStatus.textContent = `Error: ${error.message}`;
                updateStatus.style.color = "#dc2626";
            }
        });
    }
});
