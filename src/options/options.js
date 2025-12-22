/*
 * AIgis - Options Script
 */
import { StorageManager } from '../utils/storage.js';

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

const MODULES_UI = [
    { id: 'email', icon: '✉️', label: 'Mail' },
    { id: 'iban', icon: '💳', label: 'IBAN' },
    { id: 'phone', icon: '📞', label: 'Phone' },
    { id: 'address', icon: '🏠', label: 'Address' },
    { id: 'ip', icon: '🌐', label: 'IP' },
    { id: 'url', icon: '🔗', label: 'URL' },
    { id: 'path', icon: '📁', label: 'Path' },
    { id: 'custom', icon: '🛡️', label: 'Custom' },
    { id: 'toon', icon: '⚡', label: 'Toon' }
];

document.addEventListener('DOMContentLoaded', async () => {

    Modal.init();

    // version badge
    try {
        const manifest = chrome.runtime.getManifest();
        const v = manifest.version;
        const b1 = document.querySelector('.version-badge');
        const b2 = document.querySelector('.build-badge');
        if (b1) b1.textContent = `v${v}`;
        if (b2) b2.textContent = `Version ${v}`;
    } catch (e) { console.warn(e); }

    // load data from storage
    const settingsData = await StorageManager.getSettings();
    const statsData = await StorageManager.getStats();
    const save = async () => await StorageManager.saveSettings(settingsData);

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
            if (btn.dataset.tab === 'data') renderVaultView();
        });
    });

    // general settings
    const optEnabled = document.getElementById('optEnabled');
    const optDebug = document.getElementById('optDebug');
    
    const modulesGrid = document.getElementById('modulesGrid');
    function renderModulesGrid() {
        if (!modulesGrid) return;
        modulesGrid.innerHTML = '';
        const isGlobalOn = settingsData.settings.enabled;
        MODULES_UI.forEach(mod => {
            const isModOn = settingsData.modules[mod.id];
            let stateClass = !isGlobalOn ? 'disabled-view' : (isModOn ? 'active' : 'inactive');
            const card = document.createElement('div');
            card.className = `module-card ${stateClass}`;
            card.innerHTML = `<span class="module-icon">${mod.icon}</span><span class="module-label">${mod.label}</span>`;
            card.addEventListener('click', async () => {
                if (!isGlobalOn) {
                    settingsData.settings.enabled = true;
                    for (let key in settingsData.modules) settingsData.modules[key] = false;
                    settingsData.modules[mod.id] = true;
                } else {
                    settingsData.modules[mod.id] = !settingsData.modules[mod.id];
                    if (!Object.values(settingsData.modules).some(v=>v)) settingsData.settings.enabled = false;
                }
                await save();
                renderMainToggles();
            });
            modulesGrid.appendChild(card);
        });
    }

    const renderMainToggles = () => {
        optEnabled.checked = settingsData.settings.enabled;
        optDebug.checked = settingsData.settings.debugMode;
        renderModulesGrid();
    };
    renderMainToggles();

    optEnabled.addEventListener('change', () => {
        settingsData.settings.enabled = optEnabled.checked;
        if(settingsData.settings.enabled && !Object.values(settingsData.modules).some(v=>v)) {
            for (let key in settingsData.modules) settingsData.modules[key] = true;
        }
        save();
        renderMainToggles();
    });
    optDebug.addEventListener('change', () => { settingsData.settings.debugMode = optDebug.checked; save(); });

    // mode switch (strict / dev)
    const modeStrict = document.getElementById('modeStrict');
    const modeDev = document.getElementById('modeDev');
    if (settingsData.settings.usageProfile === 'strict') modeStrict.checked = true; else modeDev.checked = true;
    const handleMode = (e) => { if (e.target.checked) { settingsData.settings.usageProfile = e.target.value; save(); } };
    modeStrict.addEventListener('change', handleMode);
    modeDev.addEventListener('change', handleMode);


    const dictInput = document.getElementById('dictInput');
    const dictAddBtn = document.getElementById('dictAddBtn');
    const wordListContainer = document.getElementById('wordListContainer');
    const btnDeleteAllDict = document.getElementById('btnDeleteAllDict');
    
    const btnBulkDeleteDict = document.getElementById('btnBulkDeleteDict');
    const countDictSpan = document.getElementById('countDict');
    const checkAllDict = document.getElementById('checkAllDict');
    let selectedDictWords = new Set();

    function renderDictionary() {
        wordListContainer.innerHTML = '';
        selectedDictWords.clear();
        updateDictBulkUI();
        checkAllDict.checked = false;

        if (!settingsData.customWords || settingsData.customWords.length === 0) {
            wordListContainer.innerHTML = '<div class="empty-state">No custom words defined yet.</div>';
            return;
        }
        const list = [...settingsData.customWords].reverse();
        
        list.forEach(word => {
            const row = document.createElement('div');
            row.className = 'list-item';
            row.innerHTML = `
                <div class="col-check"><input type="checkbox" class="item-check" value="${word}"></div>
                <span class="item-word col-1">${word}</span>
                <div class="item-actions">
                    <button class="action-icon-btn edit" title="Edit">✎</button>
                    <button class="action-icon-btn delete" title="Delete">✕</button>
                </div>`;
            
            row.querySelector('.delete').addEventListener('click', async () => {
                const confirm = await Modal.open('Delete Word', `Remove "${word}" from custom dictionary?`, 'danger');
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

            wordListContainer.appendChild(row);
        });
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
        const confirm = await Modal.open('Delete Selected', `Remove ${selectedDictWords.size} custom words?`, 'danger');
        if (confirm) {
            settingsData.customWords = settingsData.customWords.filter(w => !selectedDictWords.has(w));
            await save();
            renderDictionary();
        }
    });

    dictAddBtn.addEventListener('click', async () => {
        const word = dictInput.value.trim();
        if (word && !settingsData.customWords.includes(word)) {
            settingsData.customWords.push(word);
            await save();
            renderDictionary();
            dictInput.value = '';
        }
    });
    dictInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') dictAddBtn.click(); });
    
    btnDeleteAllDict.addEventListener('click', async () => {
        const confirm = await Modal.open('Delete All', 'Really delete ALL custom dictionary entries?', 'danger');
        if (confirm) {
            settingsData.customWords = [];
            await save();
            renderDictionary();
        }
    });
    renderDictionary();


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

        const piiCategories = ['email', 'iban', 'phone', 'address', 'ip', 'url', 'path', 'custom'];
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
    const vaultListContainer = document.getElementById('vaultListContainer');
    const btnClearVault = document.getElementById('btnClearVault');
    const btnExportVault = document.getElementById('btnExportVault');
    const btnImportVault = document.getElementById('btnImportVault');
    const fileImportVault = document.getElementById('fileImportVault');
    
    const btnBulkDeleteVault = document.getElementById('btnBulkDeleteVault');
    const countVaultSpan = document.getElementById('countVault');
    const checkAllVault = document.getElementById('checkAllVault');
    let selectedVaultItems = new Set();

    async function renderVaultView() {
        vaultListContainer.innerHTML = '<div class="empty-state">Loading vault...</div>';
        selectedVaultItems.clear();
        updateVaultBulkUI();
        checkAllVault.checked = false;

        const vaultData = await StorageManager.getVault(); 
        const mappings = vaultData.mappings || {};
        const entries = Object.entries(mappings);

        vaultListContainer.innerHTML = '';
        if (entries.length === 0) {
            vaultListContainer.innerHTML = '<div class="empty-state">Vault is empty. No sensitive data stored.</div>';
            return;
        }

        entries.sort().reverse().forEach(([placeholder, original]) => {
            const row = document.createElement('div');
            row.className = 'list-item';
            row.innerHTML = `
                <div class="col-check"><input type="checkbox" class="vault-check" value="${placeholder}"></div>
                <span class="col-1 mono-accent">${placeholder}</span>
                <span class="col-2" title="${original}">${original}</span>
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

            vaultListContainer.appendChild(row);
        });
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
        const confirm = await Modal.open('Delete Selected', `Permanently delete ${selectedVaultItems.size} items from Vault?`, 'danger');
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

    btnExportVault.addEventListener('click', () => StorageManager.exportVault());
    btnImportVault.addEventListener('click', () => fileImportVault.click());
    fileImportVault.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const res = await StorageManager.importData(ev.target.result);
            if (res === "vault") {
                alert('Vault imported successfully!'); 
                renderVaultView();
            } else alert('Import failed.');
        };
        reader.readAsText(file);
    });

    // settings import/export
    document.getElementById('btnExportSettings').addEventListener('click', () => StorageManager.exportData());
    const fileImportSettings = document.getElementById('fileImportSettings');
    document.getElementById('btnImportSettings').addEventListener('click', () => fileImportSettings.click());
    fileImportSettings.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const res = await StorageManager.importData(ev.target.result);
            if (res === "settings") {
                alert('Settings imported! Reloading...'); location.reload();
            } else alert('Import failed.');
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
                console.error(error);
                updateStatus.textContent = `Error: ${error.message}`;
                updateStatus.style.color = "#dc2626";
            }
        });
    }
});