import { popupWindow, clamp, simpleToast, defaultSyntaxColors, applySyntaxColors, resolveSyntaxColor, syntaxColorPresets, getHighlight } from '../helper.js';
import { settingsConfig, isEasterEggUnlocked } from '../core/settingsConfig.js';
import { t, setLang } from '../i18n.js';
import { appContext } from '../core/appContext.js';
import { onThemeChange } from '../core/themeManager.js';
import {
    KEYBINDING_CATEGORIES,
    KEYBINDING_DEFINITIONS,
    eventToShortcut,
    formatShortcutParts,
    formatShortcutText,
    getEffectiveShortcut,
    isShortcutCustomized,
    findConflictingAction,
    normalizeShortcut,
} from '../core/keybindings.js';

import {
    createSettingSectionTitle, createSettingRow, createSettingRangeInput,
    createSettingNumberInput, createSettingCheckbox, createSettingDropdown, createSettingColorInput,
} from './settingControls.js';

export {
    createSettingSectionTitle, createSettingRow, createSettingRangeInput,
    createSettingNumberInput, createSettingCheckbox, createSettingDropdown, createSettingColorInput,
};

/**
 * 開啟全域設定彈窗
 * @param {Object} [options={}]
 * @param {Object} [options.settings] 全域設定物件 (預設自 appContext 取得)
 * @param {Object} [options.audioManager] 音訊管理器 (預設自 appContext 取得)
 * @param {Function} [options.saveSettingsDebounce] 儲存設定防抖函數
 * @param {Function} [options.setEditorCss] 編輯器樣式套用函數
 * @param {Function} [options.draw] 畫布重繪函數
 * @param {number} [options.initialTab=0]
 */
export function openSettingsModal(options = {}) {
    const settings = options.settings || appContext.settings;
    const audioManager = options.audioManager || appContext.audioManager;
    const saveSettingsDebounce = options.saveSettingsDebounce || appContext.get('saveSettingsDebounce') || (() => appContext.saveSettings());
    const setEditorCss = options.setEditorCss || appContext.get('setEditorCss');
    const draw = options.draw || (() => appContext.draw());
    const initialTab = options.initialTab || 0;

    const flushSettingsSave = () => {
        if (typeof saveSettingsDebounce?.flush === 'function') {
            saveSettingsDebounce.flush();
            return;
        }
        const registeredSave = appContext.get('saveSettingsDebounce');
        if (typeof registeredSave?.flush === 'function') {
            registeredSave.flush();
        }
    };
    const container = document.createElement('div');
    container.className = 'popup-setting-container';

    // 左側導覽列 (Tabs)
    const sidebar = document.createElement('div');
    sidebar.className = 'popup-setting-sidebar';

    // 右側內容區
    const contentArea = document.createElement('div');
    contentArea.className = 'popup-setting-content';

    container.appendChild(sidebar);
    container.appendChild(contentArea);

    const sections = [];
    const tabs = [];
    const categoryTabIds = [];
    let currentTabIndex = 0;

    let stopKeybindingRecording = () => { };

    const switchTab = (index) => {
        stopKeybindingRecording();
        const safeIndex = (index >= 0 && index < tabs.length) ? index : 0;
        currentTabIndex = safeIndex;
        tabs.forEach((tab, i) => {
            tab.classList.toggle('active', i === safeIndex);
        });
        sections.forEach((sec, i) => {
            sec.classList.toggle('active', i === safeIndex);
        });
    };

    const addTab = (label, categoryId = null) => {
        const index = tabs.length;
        const tab = document.createElement('div');
        tab.textContent = label;
        tab.className = 'popup-setting-tab';
        tab.addEventListener('click', () => switchTab(index));
        sidebar.appendChild(tab);
        tabs.push(tab);
        categoryTabIds.push(categoryId);

        const section = document.createElement('div');
        section.className = 'popup-setting-section';

        contentArea.appendChild(section);
        sections.push(section);

        return section;
    };

    const createRow = createSettingRow;

    const assignSettingValue = (targetRef, targetKey, value, type, fallback = {}) => {
        if (type === 'object') {
            if (!targetRef[targetKey] || typeof targetRef[targetKey] !== 'object') {
                targetRef[targetKey] = { ...fallback };
            }
            Object.assign(targetRef[targetKey], value);
            return targetRef[targetKey];
        }
        targetRef[targetKey] = value;
        return value;
    };

    const commitSetting = (targetRef, targetKey, value, item, { save = true } = {}) => {
        const committedValue = assignSettingValue(targetRef, targetKey, value, item?.type, item?.def);
        appContext.setSetting(targetKey, committedValue);
        if (item?.apply) {
            try {
                item.apply(committedValue);
            } catch (err) {
                console.error(`[settingsModal] Error applying setting "${item.id || targetKey}":`, err);
            }
        }
        if (save && saveSettingsDebounce) {
            saveSettingsDebounce();
        }
        return committedValue;
    };

    const createRangeInput = createSettingRangeInput;

    const createColorInput = createSettingColorInput;

    let stopPreviewThemeSync = () => { };

    const createNumberInput = createSettingNumberInput;

    const createCheckbox = createSettingCheckbox;

    const createDropdown = createSettingDropdown;

    const createKeybindingsEditor = (initialValue, onChange, onCleanupRegister) => {
        const panel = document.createElement('div');
        panel.className = 'popup-setting-kb-panel';

        let workingMap = { ...(initialValue || {}) };
        panel.value = { ...workingMap };

        let recordingActionId = null;
        let pendingConflict = null;
        let keydownCaptureHandler = null;
        let searchQuery = '';

        const syncValue = (notify = true) => {
            panel.value = { ...workingMap };
            if (notify && typeof onChange === 'function') {
                onChange({ ...workingMap });
            }
        };

        const setBinding = (actionId, combo) => {
            const def = KEYBINDING_DEFINITIONS.find(d => d.id === actionId);
            if (!def) return;
            const normDefault = normalizeShortcut(def.defaultShortcut || '');
            const normNext = normalizeShortcut(combo || '');
            if (normNext === normDefault) {
                delete workingMap[actionId];
            } else {
                workingMap[actionId] = normNext;
            }
            syncValue();
        };

        const stopRecording = () => {
            if (keydownCaptureHandler) {
                window.removeEventListener('keydown', keydownCaptureHandler, true);
                keydownCaptureHandler = null;
            }
            recordingActionId = null;
            delete container.dataset.recordingKeybinding;
        };

        stopKeybindingRecording = stopRecording;
        if (typeof onCleanupRegister === 'function') {
            onCleanupRegister(stopRecording);
        }

        // 頂部提示與工具列 (搜尋 + 全部重設)
        const hintEl = document.createElement('div');
        hintEl.className = 'popup-setting-kb-hint';
        hintEl.textContent = t('keybindings.hint');
        panel.appendChild(hintEl);

        const toolbarEl = document.createElement('div');
        toolbarEl.className = 'popup-setting-kb-toolbar';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'popup-setting-input popup-setting-kb-search';
        searchInput.placeholder = t('keybindings.searchPlaceholder');
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            renderList();
        });

        const resetAllBtn = document.createElement('button');
        resetAllBtn.type = 'button';
        resetAllBtn.className = 'popup-setting-sub-reset-btn popup-setting-kb-reset-all';
        resetAllBtn.textContent = t('keybindings.resetAll');
        resetAllBtn.addEventListener('click', () => {
            stopRecording();
            pendingConflict = null;
            workingMap = {};
            syncValue();
            renderConflictBanner();
            renderList();
            simpleToast({ content: t('keybindings.resetAllDone'), type: 'info', timeout: 1500 });
        });

        toolbarEl.appendChild(searchInput);
        toolbarEl.appendChild(resetAllBtn);
        panel.appendChild(toolbarEl);

        const conflictBanner = document.createElement('div');
        conflictBanner.className = 'popup-setting-kb-conflict';
        conflictBanner.style.display = 'none';
        panel.appendChild(conflictBanner);

        const listEl = document.createElement('div');
        listEl.className = 'popup-setting-kb-list';
        panel.appendChild(listEl);

        const renderConflictBanner = () => {
            conflictBanner.innerHTML = '';
            if (!pendingConflict) {
                conflictBanner.style.display = 'none';
                return;
            }

            const { actionId, combo, conflictDef } = pendingConflict;
            const textEl = document.createElement('span');
            textEl.className = 'popup-setting-kb-conflict-text';
            textEl.textContent = t('keybindings.conflictWarning', {
                action: t(conflictDef.labelKey),
                shortcut: formatShortcutText(combo)
            });

            const btnWrap = document.createElement('div');
            btnWrap.className = 'popup-setting-kb-conflict-actions';

            const overwriteBtn = document.createElement('button');
            overwriteBtn.type = 'button';
            overwriteBtn.className = 'popup-setting-kb-conflict-btn is-primary';
            overwriteBtn.textContent = t('keybindings.conflictOverwrite');
            overwriteBtn.addEventListener('click', () => {
                setBinding(conflictDef.id, '');
                setBinding(actionId, combo);
                pendingConflict = null;
                renderConflictBanner();
                renderList();
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'popup-setting-kb-conflict-btn';
            cancelBtn.textContent = t('keybindings.conflictCancel');
            cancelBtn.addEventListener('click', () => {
                pendingConflict = null;
                renderConflictBanner();
                renderList();
            });

            btnWrap.appendChild(overwriteBtn);
            btnWrap.appendChild(cancelBtn);
            conflictBanner.appendChild(textEl);
            conflictBanner.appendChild(btnWrap);
            conflictBanner.style.display = 'flex';
        };

        const startRecording = (actionId) => {
            if (recordingActionId === actionId) {
                stopRecording();
                renderList();
                return;
            }
            stopRecording();
            pendingConflict = null;
            renderConflictBanner();

            recordingActionId = actionId;
            container.dataset.recordingKeybinding = 'true';
            renderList();

            keydownCaptureHandler = (e) => {
                if (!panel.isConnected) {
                    stopRecording();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                // 單按 Escape 取消本次錄製
                if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    stopRecording();
                    renderList();
                    return;
                }

                const combo = eventToShortcut(e);
                if (!combo) return;

                const conflictDef = findConflictingAction(combo, actionId, workingMap);
                stopRecording();

                if (conflictDef) {
                    pendingConflict = { actionId, combo, conflictDef };
                    renderConflictBanner();
                    renderList();
                    return;
                }

                setBinding(actionId, combo);
                renderList();
            };

            window.addEventListener('keydown', keydownCaptureHandler, true);
        };

        const renderKeyPills = (triggerBtn, shortcutStr, isRecording) => {
            triggerBtn.innerHTML = '';
            if (isRecording) {
                const recSpan = document.createElement('span');
                recSpan.className = 'popup-setting-kb-rec-label';
                recSpan.textContent = t('keybindings.recording');
                triggerBtn.appendChild(recSpan);
                return;
            }

            const parts = formatShortcutParts(shortcutStr);
            if (parts.length === 0) {
                const emptySpan = document.createElement('span');
                emptySpan.className = 'popup-setting-kb-empty';
                emptySpan.textContent = t('keybindings.unbound');
                triggerBtn.appendChild(emptySpan);
                return;
            }

            parts.forEach((part, idx) => {
                if (idx > 0) {
                    const plus = document.createElement('span');
                    plus.className = 'popup-setting-kb-plus';
                    plus.textContent = '+';
                    triggerBtn.appendChild(plus);
                }
                const kbd = document.createElement('kbd');
                kbd.className = 'popup-setting-kb-kbd';
                kbd.textContent = part;
                triggerBtn.appendChild(kbd);
            });
        };

        const renderList = () => {
            listEl.innerHTML = '';
            let totalMatched = 0;

            KEYBINDING_CATEGORIES.forEach((category) => {
                const defs = KEYBINDING_DEFINITIONS.filter((def) => {
                    if (def.category !== category) return false;
                    if (!searchQuery) return true;
                    const labelText = t(def.labelKey).toLowerCase();
                    const keyText = formatShortcutText(getEffectiveShortcut(def.id, workingMap)).toLowerCase();
                    return labelText.includes(searchQuery) || keyText.includes(searchQuery) || def.id.toLowerCase().includes(searchQuery);
                });

                if (defs.length === 0) return;
                totalMatched += defs.length;

                const catHeader = document.createElement('div');
                catHeader.className = 'popup-setting-section-title';
                catHeader.textContent = t(`keybindings.categories.${category}`);
                listEl.appendChild(catHeader);

                defs.forEach((def) => {
                    const row = document.createElement('div');
                    row.className = 'popup-setting-kb-row';

                    const infoEl = document.createElement('div');
                    infoEl.className = 'popup-setting-kb-info';

                    const nameEl = document.createElement('span');
                    nameEl.className = 'popup-setting-kb-name';
                    nameEl.textContent = t(def.labelKey);
                    infoEl.appendChild(nameEl);

                    const customized = isShortcutCustomized(def.id, workingMap);
                    if (def.visualOnly || customized) {
                        const badges = document.createElement('div');
                        badges.className = 'popup-setting-kb-badges';
                        if (def.visualOnly) {
                            const visualBadge = document.createElement('span');
                            visualBadge.className = 'popup-setting-kb-badge is-scope';
                            visualBadge.textContent = t('keybindings.visualOnlyBadge');
                            badges.appendChild(visualBadge);
                        }
                        if (customized) {
                            const modBadge = document.createElement('span');
                            modBadge.className = 'popup-setting-kb-badge is-custom';
                            modBadge.textContent = t('keybindings.modified');
                            badges.appendChild(modBadge);
                        }
                        infoEl.appendChild(badges);
                    }

                    const controlsEl = document.createElement('div');
                    controlsEl.className = 'popup-setting-kb-controls';

                    const activeShortcut = getEffectiveShortcut(def.id, workingMap);
                    const isRecording = recordingActionId === def.id;

                    const triggerBtn = document.createElement('button');
                    triggerBtn.type = 'button';
                    triggerBtn.className = 'popup-setting-kb-trigger';
                    if (isRecording) triggerBtn.classList.add('is-recording');
                    if (!activeShortcut && !isRecording) triggerBtn.classList.add('is-unbound');
                    renderKeyPills(triggerBtn, activeShortcut, isRecording);
                    triggerBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        startRecording(def.id);
                    });
                    controlsEl.appendChild(triggerBtn);

                    if (activeShortcut) {
                        const clearBtn = document.createElement('button');
                        clearBtn.type = 'button';
                        clearBtn.className = 'popup-setting-kb-icon-btn';
                        clearBtn.title = t('keybindings.clearBtn');
                        clearBtn.setAttribute('aria-label', t('keybindings.clearBtn'));
                        clearBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">close</span>';
                        clearBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            stopRecording();
                            pendingConflict = null;
                            setBinding(def.id, '');
                            renderConflictBanner();
                            renderList();
                        });
                        controlsEl.appendChild(clearBtn);
                    }

                    if (customized) {
                        const resetBtn = document.createElement('button');
                        resetBtn.type = 'button';
                        resetBtn.className = 'popup-setting-kb-icon-btn';
                        resetBtn.title = t('keybindings.resetBtn');
                        resetBtn.setAttribute('aria-label', t('keybindings.resetBtn'));
                        resetBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">restart_alt</span>';
                        resetBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            stopRecording();
                            pendingConflict = null;
                            const defaultCombo = normalizeShortcut(def.defaultShortcut || '');
                            const conflictDef = defaultCombo ? findConflictingAction(defaultCombo, def.id, workingMap) : null;
                            if (conflictDef) {
                                pendingConflict = { actionId: def.id, combo: defaultCombo, conflictDef };
                                renderConflictBanner();
                                renderList();
                                return;
                            }
                            delete workingMap[def.id];
                            syncValue();
                            renderConflictBanner();
                            renderList();
                        });
                        controlsEl.appendChild(resetBtn);
                    }

                    row.appendChild(infoEl);
                    row.appendChild(controlsEl);
                    listEl.appendChild(row);
                });
            });

            if (totalMatched === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'popup-setting-kb-no-results';
                emptyEl.textContent = t('keybindings.noResults');
                listEl.appendChild(emptyEl);
            }
        };

        panel._updateDisplay = () => {
            workingMap = { ...(panel.value || {}) };
            pendingConflict = null;
            stopRecording();
            renderConflictBanner();
            renderList();
        };

        renderList();
        return panel;
    };

    const inputRefs = {};
    let popupCtx = null;

    const getCurrentFormValues = () => {
        const snapshot = { ...settings };
        Object.values(inputRefs).forEach((ref) => {
            if (!ref || ref.type === 'button') return;
            if (ref.type === 'checkbox') {
                snapshot[ref.key] = ref.el.checked;
            } else if (ref.type === 'dropdown') {
                snapshot[ref.key] = isNaN(ref.el.value) ? ref.el.value : parseFloat(ref.el.value);
            } else if (ref.type === 'object' || ref.type === 'color-object' || ref.type === 'keybindings') {
                snapshot[ref.key] = { ...ref.el.value };
            } else {
                snapshot[ref.key] = ref.el.value;
            }
        });
        return snapshot;
    };

    const syncConditionalRows = () => {
        const snapshot = getCurrentFormValues();
        Object.values(inputRefs).forEach((ref) => {
            if (!ref.rowEl || typeof ref.visibleWhen !== 'function') return;
            ref.rowEl.style.display = ref.visibleWhen(snapshot) ? '' : 'none';
        });
    };

    // 生成各分類與設定項
    settingsConfig.forEach((category) => {
        if (category.secret && !isEasterEggUnlocked()) {
            return;
        }
        const section = addTab(category.label === '???' ? '???' : t(category.label), category.id || null);

        if (category.html) {
            section.innerHTML += category.html;
        }

        (category.items || []).forEach(item => {
            if (item.type === 'header') {
                const headerEl = document.createElement('div');
                headerEl.className = 'popup-setting-section-title';
                headerEl.textContent = t(item.label);
                section.appendChild(headerEl);
                return;
            }

            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;

            // --- A. 處理 Checkbox ---
            if (item.type === 'checkbox') {
                el = createCheckbox(currentVal, `settings-${item.id}`);
                el.addEventListener('change', (e) => {
                    try {
                        commitSetting(targetRef, targetKey, e.target.checked, item);
                    } catch (err) { }
                    syncConditionalRows();
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // --- B. 處理 Dropdown ---
            else if (item.type === 'dropdown') {
                el = createDropdown(currentVal, item.options);
                el.addEventListener('change', async (e) => {
                    const newValue = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value);
                    if (item.id === 'lang') {
                        el.disabled = true;
                        const success = await setLang(newValue);
                        if (success) {
                            targetRef[targetKey] = newValue;
                            appContext.setSetting(targetKey, newValue);
                            if (saveSettingsDebounce) saveSettingsDebounce();
                            flushSettingsSave();
                            if (popupCtx) {
                                popupCtx.close();
                                // 重新開啟設定彈窗以應用新語系介面
                                openSettingsModal({
                                    settings,
                                    audioManager,
                                    saveSettingsDebounce,
                                    setEditorCss,
                                    draw,
                                    initialTab: currentTabIndex
                                });
                            }
                        } else {
                            el.disabled = false;
                            el.value = currentVal;
                        }
                        return;
                    }
                    try {
                        commitSetting(targetRef, targetKey, newValue, item);
                    } catch (err) { }
                    syncConditionalRows();
                });
            }
            // --- C. 處理 Range ---
            else if (item.type === 'range') {
                el = createRangeInput(currentVal, item.min, item.max, item.step, (val) => {
                    try {
                        commitSetting(targetRef, targetKey, val, item);
                    } catch (err) { }
                }, item.rangeOptions);
            }
            // --- C2. 處理單一 Color ---
            else if (item.type === 'color') {
                el = createColorInput(currentVal, (newColor) => {
                    try {
                        commitSetting(targetRef, targetKey, newColor, item);
                    } catch (err) { }
                });
            }
            // --- D. 處理 Text ---
            else if (item.type === 'text') {
                el = document.createElement('input');
                el.type = 'text';
                el.className = 'popup-setting-input popup-setting-input-text';
                el.value = currentVal ?? '';
                el.addEventListener('change', (e) => {
                    try {
                        commitSetting(targetRef, targetKey, e.target.value, item);
                    } catch (err) { }
                });
            }
            // --- E. 處理 Object (如 sfxVolumes) ---
            else if (item.type === 'object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;

                    const subSlider = createRangeInput(subCurrent, 0, 1, 0.05, (subVal) => {
                        try {
                            el.value[subKey] = subVal;
                            if (!targetRef[targetKey] || typeof targetRef[targetKey] !== 'object') {
                                targetRef[targetKey] = { ...item.def };
                            }
                            targetRef[targetKey][subKey] = subVal;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
                            if (saveSettingsDebounce) saveSettingsDebounce();
                        } catch (e) { }
                    });

                    el._subRefs[subKey] = subSlider;

                    const subLabelKey = `settings.sfxVolumeOpts.${subKey}`;
                    const subLabel = t(subLabelKey);
                    const subRow = createRow(subLabel !== subLabelKey ? subLabel : subKey, subSlider);
                    el.appendChild(subRow);
                });

                el._updateDisplay = () => {
                    Object.keys(el._subRefs).forEach(subKey => {
                        el._subRefs[subKey].value = targetRef[targetKey][subKey] ?? item.def[subKey];
                        if (el._subRefs[subKey]._updateDisplay) el._subRefs[subKey]._updateDisplay();
                    });
                };
            }
            // --- F. 處理 Color Object (如 syntaxColors) ---
            else if (item.type === 'color-object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                // 頂部色系預設組 (Presets) 與重設按鈕列
                const toolbarRow = document.createElement('div');
                toolbarRow.className = 'popup-setting-color-toolbar';

                const presetGroup = document.createElement('div');
                presetGroup.className = 'popup-setting-color-preset-group';

                const presetLabel = document.createElement('label');
                presetLabel.textContent = t('settings.syntaxColorPresets.title');

                const presetSelect = document.createElement('select');
                presetSelect.className = 'popup-setting-dropdown popup-setting-preset-dropdown';

                // 加入 Custom 選項
                const customOpt = document.createElement('option');
                customOpt.value = 'custom';
                customOpt.textContent = t('settings.syntaxColorPresets.custom');
                presetSelect.appendChild(customOpt);

                // 加入各預設組
                Object.keys(syntaxColorPresets).forEach(presetKey => {
                    const opt = document.createElement('option');
                    opt.value = presetKey;
                    opt.textContent = t(`settings.syntaxColorPresets.${presetKey}`);
                    presetSelect.appendChild(opt);
                });

                const detectMatchingPreset = (curColors) => {
                    if (!curColors) return 'custom';
                    for (const [key, preset] of Object.entries(syntaxColorPresets)) {
                        const matches = Object.keys(preset.colors).every(k =>
                            (curColors[k] || '').toLowerCase() === (preset.colors[k] || '').toLowerCase()
                        );
                        if (matches) return key;
                    }
                    return 'custom';
                };

                presetSelect.value = detectMatchingPreset(currentVal);

                presetSelect.addEventListener('change', (e) => {
                    const selected = e.target.value;
                    if (selected === 'custom' || !syntaxColorPresets[selected]) return;
                    const newColors = { ...syntaxColorPresets[selected].colors };
                    Object.assign(el.value, newColors);
                    commitSetting(targetRef, targetKey, { ...newColors }, item);
                    el._updateDisplay();
                });

                presetGroup.appendChild(presetLabel);
                presetGroup.appendChild(presetSelect);
                toolbarRow.appendChild(presetGroup);

                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'popup-setting-sub-reset-btn';
                resetBtn.textContent = t('settings.syntaxColorOpts.resetColors');
                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Object.assign(el.value, defaultSyntaxColors);
                    commitSetting(targetRef, targetKey, { ...defaultSyntaxColors }, item);
                    el._updateDisplay();
                });
                toolbarRow.appendChild(resetBtn);

                const previewSample = '|| Hello WMCX!\n(180){8}1,2b,3x,4m,\nCh[4:1]f,5^6[8:1]/7,\n,<HS*1>8,,1`2,,3`4,,\n5`6-8[1:1]*-1[1:1],';
                const codeBlock = document.createElement('pre');
                codeBlock.className = 'popup-setting-codeblock';
                const codeEl = document.createElement('code');
                codeEl.innerHTML = getHighlight(previewSample);
                codeBlock.appendChild(codeEl);

                const syncPreviewColors = (colors) => {
                    const merged = { ...defaultSyntaxColors, ...(colors || {}) };
                    Object.entries(merged).forEach(([k, color]) => {
                        const resolved = resolveSyntaxColor(k, color);
                        const cssVar = `--hl-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                        codeBlock.style.setProperty(cssVar, resolved);
                    });
                };

                el.appendChild(codeBlock);
                syncPreviewColors(el.value);
                stopPreviewThemeSync = onThemeChange(() => {
                    syncPreviewColors(el.value);
                });
                el.appendChild(toolbarRow);

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;
                    const subLabel = t(item.subLabels?.[subKey] || subKey);

                    const colorInput = createColorInput(subCurrent, (newColor) => {
                        try {
                            el.value[subKey] = newColor;
                            if (!targetRef[targetKey] || typeof targetRef[targetKey] !== 'object') {
                                targetRef[targetKey] = { ...item.def };
                            }
                            targetRef[targetKey][subKey] = newColor;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
                            presetSelect.value = detectMatchingPreset(targetRef[targetKey]);
                            syncPreviewColors(el.value);
                            if (saveSettingsDebounce) saveSettingsDebounce();
                        } catch (e) { }
                    });

                    el._subRefs[subKey] = colorInput;

                    const subRow = createRow(subLabel, colorInput);
                    el.appendChild(subRow);
                });

                el._updateDisplay = () => {
                    Object.keys(el._subRefs).forEach(subKey => {
                        const val = targetRef[targetKey]?.[subKey] ?? item.def[subKey];
                        if (el._subRefs[subKey]?.setValue) el._subRefs[subKey].setValue(val);
                    });
                    presetSelect.value = detectMatchingPreset(targetRef[targetKey]);
                    syncPreviewColors(targetRef[targetKey] ?? item.def);
                };
            }
            // --- F2. 處理自訂快速鍵面板 (Keybindings) ---
            else if (item.type === 'keybindings') {
                el = createKeybindingsEditor(currentVal, (nextMap) => {
                    commitSetting(targetRef, targetKey, nextMap, item);
                });
            }
            // --- E. 處理 Button ---
            else if (item.type === 'button') {
                el = document.createElement('button');
                el.type = 'button';
                el.textContent = t(item.btnText || 'popup.reset');
                if (item.onClick) {
                    el.addEventListener('click', item.onClick);
                }
            }
            // --- F. 一般 Number ---
            else {
                el = createNumberInput(currentVal, item.step, item.min, item.max);
                el.addEventListener('change', () => {
                    const rawVal = parseFloat(el.value);
                    const minNum = Number(el.min);
                    const maxNum = Number(el.max);
                    let finalVal;
                    if (isNaN(rawVal)) {
                        finalVal = targetRef[targetKey] ?? item.def;
                    } else {
                        finalVal = clamp(
                            rawVal,
                            Number.isFinite(minNum) ? minNum : -Infinity,
                            Number.isFinite(maxNum) ? maxNum : Infinity
                        );
                    }
                    el.value = String(finalVal);
                    try {
                        commitSetting(targetRef, targetKey, finalVal, item);
                    } catch (err) { }
                    syncConditionalRows();
                });
            }

            const rowEl = item.type === 'keybindings'
                ? el
                : createRow(t(item.label), el);

            inputRefs[item.id] = {
                el,
                rowEl,
                def: item.def,
                type: item.type,
                apply: item.apply,
                visibleWhen: item.visibleWhen,
                ref: targetRef,
                key: targetKey
            };
            section.appendChild(rowEl);
        });
    });

    syncConditionalRows();

    if (typeof initialTab === 'string') {
        const matchedIdx = categoryTabIds.indexOf(initialTab);
        currentTabIndex = matchedIdx !== -1 ? matchedIdx : 0;
    } else {
        currentTabIndex = Number.isInteger(initialTab) ? initialTab : 0;
    }
    switchTab(currentTabIndex);

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "560px",
        onClose: () => {
            stopKeybindingRecording();
            stopPreviewThemeSync();
            flushSettingsSave();
        },
        buttons: [
            {
                text: t('popup.reset'),
                onClick: () => {
                    if (!confirm(t('popup.confirmResetSettings'))) return;
                    stopKeybindingRecording();
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'button') {
                            return;
                        } else if (ref.type === 'checkbox') {
                            ref.el.checked = ref.def;
                            ref.ref[ref.key] = ref.def;
                        } else if (ref.type === 'object' || ref.type === 'color-object') {
                            ref.el.value = { ...ref.def };
                            if (!ref.ref[ref.key] || typeof ref.ref[ref.key] !== 'object') {
                                ref.ref[ref.key] = {};
                            }
                            Object.assign(ref.ref[ref.key], ref.def);
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                        } else if (ref.type === 'keybindings') {
                            const resetBindings = { ...(ref.def || {}) };
                            ref.el.value = resetBindings;
                            ref.ref[ref.key] = { ...resetBindings };
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                        } else {
                            ref.el.value = ref.def;
                            ref.ref[ref.key] = ref.def;
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                        }

                        appContext.setSetting(ref.key, ref.ref[ref.key]);
                        if (ref.apply) {
                            try {
                                ref.apply(ref.ref[ref.key]);
                            } catch (err) {
                                console.error(`[settingsModal] Error resetting setting "${ref.key}":`, err);
                            }
                        }
                    });

                    syncConditionalRows();
                    if (setEditorCss) setEditorCss();
                    if (draw) draw();
                    if (saveSettingsDebounce) saveSettingsDebounce();
                    simpleToast({ content: t('toast.restoreSaved'), type: 'info', timeout: 1500 });
                }
            }
        ]
    });
}
