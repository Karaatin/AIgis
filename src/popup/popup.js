/*
 * AIgis - Popup Script
 */
import { StorageManager } from '../utils/storage.js';

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

    const toggleEnabled = document.getElementById('toggleEnabled');
    const statusBadge = document.getElementById('statusBadge');
    const modeDev = document.getElementById('modeDev');
    const modeStrict = document.getElementById('modeStrict');
    const modulesGrid = document.getElementById('modulesGrid');
    const inputWord = document.getElementById('inputWord');
    const btnAddWord = document.getElementById('btnAddWord');
    const feedbackMsg = document.getElementById('feedbackMsg');
    const btnOptions = document.getElementById('btnOptions');
    const statPii = document.getElementById('statPii');
    const statTokens = document.getElementById('statTokens');

    document.body.classList.add('preload');

    let settingsData = null;
    let statsData = null;

    try {

        settingsData = await StorageManager.getSettings();
        statsData = await StorageManager.getStats();

        renderAll();

        setTimeout(() => {
            document.body.classList.remove('preload');
            document.body.classList.add('loaded');
        }, 50);

    } catch (e) {

        console.error("Popup Init Error:", e);

    }

    toggleEnabled.addEventListener('change', async () => {

        const isEnabled = toggleEnabled.checked;
        settingsData.settings.enabled = isEnabled;
        
        if (isEnabled) {

            const anyModOn = Object.values(settingsData.modules).some(val => val === true);
            
            if (!anyModOn) {
                for (let key in settingsData.modules) {
                    settingsData.modules[key] = true;
                }
            }
        }

        await StorageManager.saveSettings(settingsData);
        renderAll();

    });

    const handleModeChange = async (e) => {

        if (e.target.checked) {
            settingsData.settings.usageProfile = e.target.value;
            await StorageManager.saveSettings(settingsData);
        }

    };

    modeDev.addEventListener('change', handleModeChange);
    modeStrict.addEventListener('change', handleModeChange);

    function renderAll() {

        if (!settingsData) return;

        const isGlobalOn = settingsData.settings.enabled;
        
        toggleEnabled.checked = isGlobalOn;
        if (isGlobalOn) {
            statusBadge.innerText = "ACTIVE";
            statusBadge.className = "badge active";
        } else {
            statusBadge.innerText = "OFFLINE";
            statusBadge.className = "badge paused";
        }

        if (settingsData.settings.usageProfile === 'developer') modeDev.checked = true;
        else modeStrict.checked = true;

        statPii.textContent = statsData.piiTotal || 0;
        let saved = statsData.toon ? Math.round(statsData.toon.estimatedTokensSaved) : 0;
        statTokens.textContent = saved > 1000 ? (saved / 1000).toFixed(1) + 'k' : saved;

        renderGrid(isGlobalOn);

    }

    function renderGrid(isGlobalOn) {

        if (!modulesGrid) return;
        modulesGrid.innerHTML = '';

        MODULES_UI.forEach(mod => {
            const isModOn = settingsData.modules[mod.id];
            
            let stateClass = '';
            if (!isGlobalOn) {
                stateClass = 'disabled-view';
            } else {
                stateClass = isModOn ? 'active' : 'inactive';
            }

            const card = document.createElement('div');
            card.className = `module-card ${stateClass}`;
            
            card.innerHTML = `
                <span class="module-icon">${mod.icon}</span>
                <span class="module-label">${mod.label}</span>
            `;

            card.addEventListener('click', async () => {
                
                if (!isGlobalOn) {
                    settingsData.settings.enabled = true;
                    for (let key in settingsData.modules) settingsData.modules[key] = false;
                    settingsData.modules[mod.id] = true;

                } else {

                    settingsData.modules[mod.id] = !settingsData.modules[mod.id];

                    const anyStillOn = Object.values(settingsData.modules).some(val => val === true);
                    if (!anyStillOn) {
                        settingsData.settings.enabled = false;
                    }
                }

                await StorageManager.saveSettings(settingsData);
                renderAll();

            });

            modulesGrid.appendChild(card);
        });

    }

    btnAddWord.addEventListener('click', async () => {

        const word = inputWord.value.trim();
        if (word) {
            const newSet = new Set(settingsData.customWords);
            if (!newSet.has(word)) {
                newSet.add(word);
                settingsData.customWords = [...newSet];
                await StorageManager.saveSettings(settingsData);
                showFeedback(`Blocked "${word}"`);
            } else {
                showFeedback(`Exists`);
            }
            inputWord.value = '';
        }

    });

    inputWord.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnAddWord.click(); });
    
    btnOptions.addEventListener('click', () => {

        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('src/options/options.html'));

    });

    function showFeedback(msg) {

        if (!feedbackMsg) return;
        feedbackMsg.textContent = msg;
        feedbackMsg.style.opacity = '1';
        setTimeout(() => feedbackMsg.style.opacity = '0', 2000);

    }
    
});