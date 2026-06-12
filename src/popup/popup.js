/*
 * AIgis - Popup Script
 */
import { StorageManager } from '../utils/storage.js';
import { MODULES_UI } from '../utils/modules.js';
import { Logger } from '../utils/logger.js';
import { PatternValidator } from '../modules/patternValidator.js';

document.addEventListener('DOMContentLoaded', async () => {

    const toggleEnabled = document.getElementById('toggleEnabled');
    const togglePeekMode = document.getElementById('togglePeekMode');
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
    const appVersion = document.getElementById('appVersion');

    if (appVersion && typeof chrome !== 'undefined' && chrome.runtime) {
        appVersion.textContent = "AIgis - v" + chrome.runtime.getManifest().version;
    }

    document.body.classList.add('preload');

    let settingsData = null;
    let statsData = null;
    let effectiveData = null;

    const lockedSettings = () => (effectiveData && effectiveData.overrides && effectiveData.overrides.config.settings) || {};
    const lockedModules = () => (effectiveData && effectiveData.overrides && effectiveData.overrides.config.modules) || {};
    const managedTitle = () => effectiveData && effectiveData.overrides
        ? `🔒 Managed by subscription '${effectiveData.overrides.providerName}' — manage it in the Dashboard`
        : '';
    const setLock = (inputEl, isLocked, withGlyph = true) => {
        if (!inputEl) return;
        inputEl.disabled = isLocked;

        const wrap = inputEl.closest('label')
            || (inputEl.type === 'radio' ? inputEl.nextElementSibling : inputEl.parentElement)
            || inputEl;
        wrap.style.opacity = isLocked ? '0.5' : '';
        wrap.style.cursor = isLocked ? 'not-allowed' : '';
        wrap.title = isLocked ? managedTitle() : '';

        const row = inputEl.closest('.control-row');
        const host = (row && row.querySelector('.label')) || wrap;
        let glyph = host.querySelector('.lock-mini');
        if (isLocked && withGlyph && !glyph) {
            glyph = document.createElement('span');
            glyph.className = 'lock-mini';
            glyph.textContent = '🔒';
            glyph.title = managedTitle();
            glyph.style.cssText = 'font-size:0.7rem;margin-left:5px;opacity:0.85;';
            host.appendChild(glyph);
        } else if ((!isLocked || !withGlyph) && glyph) {
            glyph.remove();
        }
    };

    async function persistAndRender() {
        await StorageManager.saveSettings(settingsData);
        effectiveData = await StorageManager.getEffectiveSettings();
        renderAll();
    }

    try {

        settingsData = await StorageManager.getSettings();
        statsData = await StorageManager.getStats();
        effectiveData = await StorageManager.getEffectiveSettings();

        Logger.init(settingsData);

        renderAll();

        setTimeout(() => {
            document.body.classList.remove('preload');
            document.body.classList.add('loaded');
        }, 50);

    } catch (e) {

        Logger.error("Popup Init Error:", e);

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

        await persistAndRender();

    });

    togglePeekMode.addEventListener('change', async () => {
        settingsData.settings.peekMode = togglePeekMode.checked;
        await StorageManager.saveSettings(settingsData);
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

        const eff = effectiveData || settingsData;
        const locks = lockedSettings();

        const isGlobalOn = eff.settings.enabled;

        toggleEnabled.checked = isGlobalOn;
        togglePeekMode.checked = eff.settings.peekMode || false;
        setLock(toggleEnabled, 'enabled' in locks);
        setLock(togglePeekMode, 'peekMode' in locks);

        if (isGlobalOn) {
            statusBadge.innerText = "ACTIVE";
            statusBadge.className = "badge active";
        } else {
            statusBadge.innerText = "OFFLINE";
            statusBadge.className = "badge paused";
        }
        statusBadge.title = effectiveData && effectiveData.overrides ? managedTitle() : '';

        if (eff.settings.usageProfile === 'developer') modeDev.checked = true;
        else modeStrict.checked = true;

        const profileLocked = 'usageProfile' in locks;
        setLock(modeStrict, profileLocked);
        setLock(modeDev, profileLocked, false);

        statPii.textContent = statsData.piiTotal || 0;
        let saved = statsData.toon ? Math.round(statsData.toon.estimatedTokensSaved) : 0;
        statTokens.textContent = saved > 1000 ? (saved / 1000).toFixed(1) + 'k' : saved;

        renderGrid(isGlobalOn);

    }

    function renderGrid(isGlobalOn) {

        if (!modulesGrid) return;
        modulesGrid.innerHTML = '';

        const eff = effectiveData || settingsData;
        const modLocks = lockedModules();

        MODULES_UI.forEach(mod => {
            const isModOn = eff.modules[mod.id];
            const isLocked = mod.id in modLocks;

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

            if (isLocked) {
                card.style.opacity = '0.5';
                card.style.cursor = 'not-allowed';
                card.title = managedTitle();
                card.insertAdjacentHTML('beforeend',
                    '<span class="lock-mini" style="font-size:0.6rem;margin-left:auto;opacity:0.85;">🔒</span>');
            }

            card.addEventListener('click', async () => {

                if (isLocked) return;

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

                await persistAndRender();

            });

            modulesGrid.appendChild(card);
        });

    }

    btnAddWord.addEventListener('click', async () => {

        const word = inputWord.value.trim();
        if (word) {
            const isRegex = /^\/(.+)\/[a-z]*$/.test(word);
            const displayPattern = isRegex ? word.match(/^\/(.+)\/[a-z]*$/)[1] : word;

            if (isRegex) {
                const parts = word.match(/^\/(.+)\/([a-z]*)$/);
                const verdict = PatternValidator.checkPattern(parts[1], parts[2]);
                if (!verdict.ok) {
                    showFeedback(`Rejected: ${verdict.reason}`);
                    return;
                }
            }

            const exists = settingsData.customWords.some(w => w.toLowerCase() === word.toLowerCase());
            if (!exists) {
                settingsData.customWords.push(word);
                await StorageManager.saveSettings(settingsData);
                showFeedback(isRegex ? `Added "${displayPattern}" (regex) to block list` : `Added "${word}" to block list`);
            } else {
                showFeedback(isRegex ? `Regex pattern "${displayPattern}" already blocked` : `"${word}" already blocked`);
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