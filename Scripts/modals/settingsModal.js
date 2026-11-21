import { popupWindow, clamp, simpleToast, defaultSyntaxColors, applySyntaxColors, syntaxColorPresets } from '../helper.js';
import { settingsConfig, isEasterEggUnlocked } from '../core/settingsConfig.js';
import { t, setLang } from '../i18n.js';
import { idbSet } from '../indexDB.js';
import { appContext } from '../core/appContext.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
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

/**
 * 建立設定分區標題列
 * @param {string} titleText
 * @returns {HTMLDivElement}
 */
export function createSettingSectionTitle(titleText) {
    const headerEl = document.createElement('div');
    headerEl.className = 'popup-setting-section-title';
    headerEl.textContent = titleText;
    return headerEl;
}

/**
 * 建立與設定頁一致的設定列 (Row)
 * @param {string} labelText
 * @param {HTMLElement} element
 * @returns {HTMLDivElement}
 */
export function createSettingRow(labelText, element) {
    const row = document.createElement('div');
    row.className = 'popup-setting-row';

    // 1. Checkbox
    if (element.type === 'checkbox') {
        const wrapper = document.createElement('label');
        wrapper.className = 'popup-setting-wrapper';
        const text = document.createElement('span');
        text.textContent = labelText;
        text.className = 'popup-setting-text';
        wrapper.appendChild(text);
        wrapper.appendChild(element);
        row.appendChild(wrapper);
        return row;
    }

    // 2. Range (自訂 div 滑桿主容器；使用 div 避免 label 攔截雙擊數值輸入框的焦點)
    if (element.type === 'range') {
        const wrapper = document.createElement('div');
        wrapper.className = 'popup-setting-wrapper popup-setting-wrapper-range';
        const text = document.createElement('span');
        text.textContent = labelText;
        text.className = 'popup-setting-text';

        wrapper.appendChild(text);
        wrapper.appendChild(element);
        row.appendChild(wrapper);
        return row;
    }

    // 3. Object (子屬性折疊選單)
    if (element.dataset && element.dataset.type === 'object-container') {
        row.className = 'popup-setting-row popup-setting-row-object';

        const header = document.createElement('div');
        header.className = 'popup-setting-object-header';
        header.innerHTML = `<span>${labelText}</span><span class="popup-setting-arrow-icon">▼</span>`;

        const subBody = element;
        subBody.className = 'popup-setting-subbody';

        header.addEventListener('click', () => {
            const isExpanded = subBody.classList.toggle('open');
            header.querySelector('.popup-setting-arrow-icon').classList.toggle('expanded', isExpanded);
        });

        row.appendChild(header);
        row.appendChild(subBody);
        return row;
    }

    // 4. Color Wrap
    if (element.classList && element.classList.contains('popup-setting-color-wrap')) {
        const label = document.createElement('label');
        label.textContent = labelText;
        label.className = 'popup-setting-label';
        row.appendChild(label);
        row.appendChild(element);
        return row;
    }

    // 5. Button
    if (element.tagName === 'BUTTON') {
        const label = document.createElement('label');
        label.textContent = labelText;
        label.className = 'popup-setting-label';
        element.className = 'popup-setting-element';
        row.appendChild(label);
        row.appendChild(element);
        return row;
    }

    // 6. 一般 Number / Dropdown / Text
    const label = document.createElement('label');
    label.textContent = labelText;
    label.className = 'popup-setting-label';
    if (!element.classList.contains('popup-setting-dropdown') &&
        !element.classList.contains('popup-setting-input') &&
        !element.classList.contains('popup-setting-color-wrap') &&
        !element.classList.contains('popup-setting-number-wrap')) {
        element.classList.add('popup-setting-input');
    }
    row.appendChild(label);
    row.appendChild(element);
    return row;
}

/**
 * 建立與設定頁一致的 Range 滑桿元件（含即時數值與雙擊編輯）
 * @param {number} value
 * @param {number} [min=0]
 * @param {number} [max=1]
 * @param {number} [step=0.1]
 * @param {Function} [onInputCallback]
 * @param {Object} [options={}]
 * @param {string} [options.suffix=''] 顯示於數值後的單位字元（例如 '%'）
 * @returns {HTMLDivElement}
 */
export function createSettingRangeInput(value, min = 0, max = 1, step = 0.1, onInputCallback, options = {}) {
    const suffix = options.suffix || '';
    const wrap = document.createElement('div');
    wrap.className = 'popup-setting-range-wrap';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'popup-setting-range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;

    const valSpan = document.createElement('span');
    valSpan.className = 'popup-setting-range-val';
    const formatVal = (v) => {
        const num = parseFloat(v);
        if (isNaN(num)) return v;
        if (step >= 1) return Math.round(num).toString();
        const precision = step < 0.01 ? 3 : (step < 0.1 ? 2 : 1);
        return num.toFixed(precision);
    };

    const updateVisuals = () => {
        const formatted = formatVal(input.value);
        valSpan.textContent = suffix ? `${formatted}${suffix}` : formatted;
        const minNum = parseFloat(input.min);
        const maxNum = parseFloat(input.max);
        const curVal = parseFloat(input.value);
        const pct = (maxNum <= minNum) ? 0 : Math.max(0, Math.min(100, ((curVal - minNum) / (maxNum - minNum)) * 100));
        input.style.setProperty('--range-pct', `${pct}%`);
    };

    updateVisuals();

    input.addEventListener('input', () => {
        updateVisuals();
        if (onInputCallback) onInputCallback(parseFloat(input.value));
    });
    input.addEventListener('change', () => {
        updateVisuals();
    });

    let isEditing = false;
    const enterEditMode = () => {
        if (isEditing) return;
        isEditing = true;

        const editInput = document.createElement('input');
        editInput.type = 'number';
        editInput.className = 'popup-setting-range-edit';
        editInput.step = 'any';
        editInput.min = input.min;
        editInput.max = input.max;
        editInput.value = formatVal(input.value);

        let finished = false;
        const finishEdit = (commit) => {
            if (finished) return;
            finished = true;
            isEditing = false;

            if (commit) {
                const parsed = parseFloat(editInput.value);
                if (!isNaN(parsed) && Number.isFinite(parsed)) {
                    const minNum = parseFloat(input.min);
                    const maxNum = parseFloat(input.max);
                    let clamped = parsed;
                    if (Number.isFinite(minNum)) clamped = Math.max(minNum, clamped);
                    if (Number.isFinite(maxNum)) clamped = Math.min(maxNum, clamped);
                    input.value = String(clamped);
                    updateVisuals();
                    const finalNum = parseFloat(input.value);
                    if (onInputCallback && !isNaN(finalNum)) onInputCallback(finalNum);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    updateVisuals();
                }
            } else {
                updateVisuals();
            }

            if (editInput.parentNode) {
                editInput.replaceWith(valSpan);
            }
        };

        editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                finishEdit(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finishEdit(false);
            }
        });
        editInput.addEventListener('blur', () => finishEdit(true));

        valSpan.replaceWith(editInput);
        editInput.focus();
        editInput.select();
    };

    valSpan.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterEditMode();
    });

    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    valSpan.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        const now = Date.now();
        const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
        if (lastTapTime && (now - lastTapTime) <= 320 && dist <= 24) {
            lastTapTime = 0;
            e.preventDefault();
            e.stopPropagation();
            enterEditMode();
        } else {
            lastTapTime = now;
            lastTapX = e.clientX;
            lastTapY = e.clientY;
        }
    });

    wrap.type = 'range';
    Object.defineProperty(wrap, 'value', {
        get: () => input.value,
        set: (v) => {
            input.value = v;
            updateVisuals();
        }
    });
    wrap.min = min;
    wrap.max = max;
    wrap.step = step;
    wrap._updateDisplay = () => {
        updateVisuals();
    };

    wrap.appendChild(input);
    wrap.appendChild(valSpan);
    return wrap;
}

/**
 * 建立與設定頁一致的數字輸入框（手機端附帶虛擬上下箭頭）
 * @param {number} value
 * @param {number} [step=0.1]
 * @param {number} [min=-999]
 * @param {number} [max=9999]
 * @returns {HTMLDivElement}
 */
export function createSettingNumberInput(value, step = 0.1, min = -999, max = 9999) {
    const wrap = document.createElement('div');
    wrap.className = 'popup-setting-number-wrap';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'popup-setting-input popup-setting-number-input';
    input.step = step;
    input.min = min;
    input.max = max;
    input.value = value;

    const spinners = document.createElement('div');
    spinners.className = 'popup-setting-number-spinners';

    const createSpinButton = (dirClass, iconName, ariaLabel) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `popup-setting-spin-btn ${dirClass}`;
        btn.setAttribute('aria-label', ariaLabel);
        btn.innerHTML = `<span class="material-symbols-outlined" translate="no">${iconName}</span>`;
        return btn;
    };

    const upBtn = createSpinButton('is-up', 'keyboard_arrow_up', 'Increase');
    const downBtn = createSpinButton('is-down', 'keyboard_arrow_down', 'Decrease');

    const countDecimals = (n) => {
        const str = String(n);
        if (str.includes('e-')) {
            const [, exp] = str.split('e-');
            return parseInt(exp, 10) || 0;
        }
        const dotIdx = str.indexOf('.');
        return dotIdx === -1 ? 0 : str.length - dotIdx - 1;
    };

    const getBounds = () => {
        const minNum = Number(input.min);
        const maxNum = Number(input.max);
        return {
            hasMin: input.min !== '' && Number.isFinite(minNum),
            hasMax: input.max !== '' && Number.isFinite(maxNum),
            minNum,
            maxNum,
        };
    };

    const updateSpinDisabledState = () => {
        const cur = parseFloat(input.value);
        const { hasMin, hasMax, minNum, maxNum } = getBounds();
        if (!Number.isFinite(cur)) {
            upBtn.disabled = false;
            downBtn.disabled = false;
            return;
        }
        upBtn.disabled = hasMax && cur >= maxNum;
        downBtn.disabled = hasMin && cur <= minNum;
    };

    const stepValue = (direction) => {
        const parsedStep = Number(input.step);
        const stepNum = (Number.isFinite(parsedStep) && parsedStep > 0) ? parsedStep : 1;
        const rawCur = parseFloat(input.value);
        const fallbackBase = Number.isFinite(Number(value)) ? Number(value) : 0;
        const current = Number.isFinite(rawCur) ? rawCur : fallbackBase;

        const decimals = Math.min(8, Math.max(countDecimals(stepNum), countDecimals(current)));
        let next = Number((current + direction * stepNum).toFixed(decimals));

        const { hasMin, hasMax, minNum, maxNum } = getBounds();
        if (hasMin) next = Math.max(minNum, next);
        if (hasMax) next = Math.min(maxNum, next);

        input.value = String(next);
        updateSpinDisabledState();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const bindSpinButton = (btn, direction) => {
        let repeatDelayTimer = null;
        let repeatIntervalTimer = null;
        let resetClickGuardTimer = null;
        let suppressNextClick = false;
        let activePointerId = null;
        let startX = 0;
        let startY = 0;

        const stopRepeat = () => {
            if (repeatDelayTimer !== null) {
                clearTimeout(repeatDelayTimer);
                repeatDelayTimer = null;
            }
            if (repeatIntervalTimer !== null) {
                clearInterval(repeatIntervalTimer);
                repeatIntervalTimer = null;
            }
            activePointerId = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopRepeat);
            window.removeEventListener('pointercancel', stopRepeat);
            if (suppressNextClick) {
                if (resetClickGuardTimer !== null) clearTimeout(resetClickGuardTimer);
                resetClickGuardTimer = setTimeout(() => {
                    suppressNextClick = false;
                    resetClickGuardTimer = null;
                }, 80);
            }
        };

        const onPointerMove = (e) => {
            if (e.pointerId !== activePointerId) return;
            if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
                stopRepeat();
            }
        };

        btn.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (btn.disabled) return;
            e.preventDefault();
            stopRepeat();
            if (resetClickGuardTimer !== null) {
                clearTimeout(resetClickGuardTimer);
                resetClickGuardTimer = null;
            }
            suppressNextClick = true;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            stepValue(direction);

            repeatDelayTimer = setTimeout(() => {
                repeatDelayTimer = null;
                repeatIntervalTimer = setInterval(() => {
                    if (!btn.isConnected || btn.disabled) {
                        stopRepeat();
                        return;
                    }
                    stepValue(direction);
                }, 75);
            }, 400);

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', stopRepeat);
            window.addEventListener('pointercancel', stopRepeat);
        });

        btn.addEventListener('click', () => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            if (!btn.disabled) {
                stepValue(direction);
            }
        });
    };

    bindSpinButton(upBtn, 1);
    bindSpinButton(downBtn, -1);

    input.addEventListener('input', updateSpinDisabledState);
    input.addEventListener('change', updateSpinDisabledState);
    updateSpinDisabledState();

    spinners.appendChild(upBtn);
    spinners.appendChild(downBtn);
    wrap.appendChild(input);
    wrap.appendChild(spinners);

    Object.defineProperty(wrap, 'value', {
        get: () => input.value,
        set: (v) => {
            input.value = v;
            updateSpinDisabledState();
        }
    });
    Object.defineProperty(wrap, 'min', {
        get: () => input.min,
        set: (v) => {
            input.min = v;
            updateSpinDisabledState();
        }
    });
    Object.defineProperty(wrap, 'max', {
        get: () => input.max,
        set: (v) => {
            input.max = v;
            updateSpinDisabledState();
        }
    });
    Object.defineProperty(wrap, 'step', {
        get: () => input.step,
        set: (v) => {
            input.step = v;
        }
    });
    wrap._updateDisplay = updateSpinDisabledState;

    return wrap;
}

/**
 * 建立與設定頁一致的核取方塊
 * @param {boolean} checked
 * @param {string} [id]
 * @returns {HTMLInputElement}
 */
export function createSettingCheckbox(checked, id) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'popup-setting-checkbox';
    if (id) input.id = id;
    input.checked = !!checked;
    return input;
}

/**
 * 建立與設定頁一致的下拉選單
 * @param {string|number} value
 * @param {Array|Function} [rawOpts=[]]
 * @param {string} [extraClassName='']
 * @returns {HTMLSelectElement}
 */
export function createSettingDropdown(value, rawOpts = [], extraClassName = '') {
    const options = typeof rawOpts === 'function' ? rawOpts() : rawOpts;
    const select = document.createElement('select');
    select.className = extraClassName ? `popup-setting-dropdown ${extraClassName}` : 'popup-setting-dropdown';
    (options || []).forEach(opt => {
        const o = document.createElement('option');
        if (opt && typeof opt === 'object' && ('value' in opt || 'label' in opt)) {
            o.value = opt.value != null ? String(opt.value) : String(opt.label ?? '');
            const rawLabel = opt.label != null ? String(opt.label) : String(opt.value ?? '');
            o.textContent = rawLabel.startsWith('settings.') ? t(rawLabel) : rawLabel;
            if (opt.value == value) o.selected = true;
        } else {
            o.value = o.textContent = String(opt);
            if (opt == value) o.selected = true;
        }
        select.appendChild(o);
    });
    return select;
}

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
    const saveSettingsDebounce = options.saveSettingsDebounce || (() => appContext.saveSettings());
    const setEditorCss = options.setEditorCss || appContext.get('setEditorCss');
    const draw = options.draw || (() => appContext.draw());
    const initialTab = options.initialTab || 0;
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

    let stopKeybindingRecording = () => {};

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

    const applySettings = () => {
        const values = {};

        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            let finalVal;

            if (config.type === 'button') {
                return;
            } else if (config.type === 'checkbox') {
                finalVal = config.el.checked;
            } else if (config.type === 'dropdown') {
                finalVal = isNaN(config.el.value) ? config.el.value : parseFloat(config.el.value);
            } else if (config.type === 'text' || config.type === 'color') {
                finalVal = config.el.value;
            } else if (config.type === 'object' || config.type === 'color-object' || config.type === 'keybindings') {
                // 直接複製子選單同步完的物件結果
                finalVal = { ...config.el.value };
            } else {
                const rawVal = parseFloat(config.el.value);
                finalVal = isNaN(rawVal) ? config.def : clamp(rawVal, Number(config.el.min), Number(config.el.max));
            }

            values[id] = finalVal;

            // 深度指派物件結構，避免直接蓋掉引用
            if (config.type === 'object') {
                Object.assign(config.ref[config.key], finalVal);
            } else {
                config.ref[config.key] = finalVal;
            }
        });

        // 透過 appContext 同步並派發變更事件
        Object.keys(values).forEach(id => {
            appContext.setSetting(id, values[id]);
        });

        Object.keys(inputRefs).forEach(id => {
            if (inputRefs[id].apply) {
                try {
                    inputRefs[id].apply(values[id], values);
                } catch (err) {
                    console.error(`[settingsModal] Error applying setting "${id}":`, err);
                }
            }
        });

        eventBus.emit(EVENTS.SETTINGS_SAVED, { allSettings: settings });
        if (saveSettingsDebounce) saveSettingsDebounce();
        if (setEditorCss) setEditorCss();
        if (draw) draw();
        simpleToast({ content: t('toast.settingsSaved'), type: 'success', timeout: 1500 });
    };

    const createRangeInput = createSettingRangeInput;

    const createColorInput = (value, onInputCallback, previewText = '') => {
        const wrap = document.createElement('div');
        wrap.className = 'popup-setting-color-wrap';

        const preview = document.createElement('span');
        preview.className = 'popup-setting-color-preview';
        preview.textContent = previewText;
        if (previewText) {
            preview.style.color = value;
        } else {
            preview.style.backgroundColor = value;
        }

        const hexText = document.createElement('span');
        hexText.className = 'popup-setting-color-hex';
        hexText.textContent = (value || '').toUpperCase();

        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'popup-setting-color-input';
        input.value = value;

        const updateColor = (newVal) => {
            input.value = newVal;
            if (previewText) {
                preview.style.color = newVal;
            } else {
                preview.style.backgroundColor = newVal;
            }
            hexText.textContent = (newVal || '').toUpperCase();
        };

        input.addEventListener('input', () => {
            updateColor(input.value);
            if (onInputCallback) onInputCallback(input.value);
        });

        wrap.setValue = (newVal) => {
            updateColor(newVal);
        };
        Object.defineProperty(wrap, 'value', {
            get: () => input.value,
            set: (newVal) => updateColor(newVal)
        });
        wrap._updateDisplay = () => {
            updateColor(input.value);
        };

        wrap.appendChild(preview);
        wrap.appendChild(hexText);
        wrap.appendChild(input);
        return wrap;
    };

    const createNumberInput = createSettingNumberInput;

    const createCheckbox = createSettingCheckbox;

    function applyAudioSettings(s) {
        if (!audioManager || !s) return;
        if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
        if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
        if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
        if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
    }

    const createDropdown = createSettingDropdown;

    const createKeybindingsEditor = (initialValue, onCleanupRegister) => {
        const panel = document.createElement('div');
        panel.className = 'popup-setting-kb-panel';

        let workingMap = { ...(initialValue || {}) };
        panel.value = { ...workingMap };

        let recordingActionId = null;
        let pendingConflict = null;
        let keydownCaptureHandler = null;
        let searchQuery = '';

        const syncValue = () => {
            panel.value = { ...workingMap };
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
                        const checked = e.target.checked;
                        targetRef[targetKey] = checked;
                        appContext.setSetting(targetKey, checked);
                        if (item.apply) item.apply(checked);
                    } catch (err) { }
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // --- B. 處理 Dropdown ---
            else if (item.type === 'dropdown') {
                el = createDropdown(currentVal, item.options);
                el.addEventListener('change', async (e) => {
                    const newValue = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value);
                    try {
                        targetRef[targetKey] = newValue;
                        appContext.setSetting(targetKey, newValue);
                    } catch (err) { }
                    if (item.id === 'lang') {
                        el.disabled = true;
                        const success = await setLang(newValue);
                        if (success) {
                            idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
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
                    }
                });
            }
            // --- C. 處理 Range ---
            else if (item.type === 'range') {
                el = createRangeInput(currentVal, item.min, item.max, item.step, (val) => {
                    try {
                        targetRef[targetKey] = val;
                        appContext.setSetting(targetKey, val);
                        if (item.apply) item.apply(val);
                    } catch (err) { }
                }, item.rangeOptions);
            }
            // --- C2. 處理單一 Color ---
            else if (item.type === 'color') {
                el = createColorInput(currentVal, (newColor) => {
                    try {
                        targetRef[targetKey] = newColor;
                        appContext.setSetting(targetKey, newColor);
                        if (item.apply) item.apply(newColor);
                    } catch (err) { }
                }, item.previewText || '');
            }
            // --- D. 處理 Text ---
            else if (item.type === 'text') {
                el = document.createElement('input');
                el.type = 'text';
                el.className = 'popup-setting-input popup-setting-input-text';
                el.value = currentVal ?? '';
                el.addEventListener('input', (e) => {
                    try {
                        targetRef[targetKey] = e.target.value;
                        appContext.setSetting(targetKey, e.target.value);
                        if (item.apply) item.apply(e.target.value);
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
                            targetRef[targetKey][subKey] = subVal;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
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
                    targetRef[targetKey] = { ...newColors };
                    appContext.setSetting(targetKey, targetRef[targetKey]);
                    if (item.apply) item.apply(targetRef[targetKey]);
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
                    targetRef[targetKey] = { ...defaultSyntaxColors };
                    appContext.setSetting(targetKey, targetRef[targetKey]);
                    if (item.apply) item.apply(targetRef[targetKey]);
                    el._updateDisplay();
                });
                toolbarRow.appendChild(resetBtn);
                el.appendChild(toolbarRow);

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;
                    const subLabel = t(item.subLabels?.[subKey] || subKey);
                    const previewText = item.subPreviews?.[subKey] || '';

                    const colorInput = createColorInput(subCurrent, (newColor) => {
                        try {
                            el.value[subKey] = newColor;
                            targetRef[targetKey][subKey] = newColor;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
                            presetSelect.value = detectMatchingPreset(targetRef[targetKey]);
                        } catch (e) { }
                    }, previewText);

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
                };
            }
            // --- F2. 處理自訂快速鍵面板 (Keybindings) ---
            else if (item.type === 'keybindings') {
                el = createKeybindingsEditor(currentVal);
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
            }

            inputRefs[item.id] = {
                el,
                def: item.def,
                type: item.type,
                apply: item.apply,
                ref: targetRef,
                key: targetKey
            };
            if (item.type === 'keybindings') {
                section.appendChild(el);
            } else {
                section.appendChild(createRow(t(item.label), el));
            }
        });
    });

    if (typeof initialTab === 'string') {
        const matchedIdx = categoryTabIds.indexOf(initialTab);
        currentTabIndex = matchedIdx !== -1 ? matchedIdx : 0;
    } else {
        currentTabIndex = Number.isInteger(initialTab) ? initialTab : 0;
    }
    switchTab(currentTabIndex);

    const oldAudioSettings = {
        globalVolume: settings.globalVolume,
        musicVolume: settings.musicVolume,
        SfxVolume: settings.SfxVolume,
        sfxVolumes: settings.sfxVolumes ? { ...settings.sfxVolumes } : null
    };

    const oldSyntaxColors = settings.syntaxColors ? { ...settings.syntaxColors } : null;

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "560px",
        onClose: () => {
            stopKeybindingRecording();
        },
        buttons: [
            {
                text: t('popup.save'),
                onClick: () => {
                    stopKeybindingRecording();
                    applySettings();
                },
                hideOnClick: true
            },
            {
                text: t('popup.apply'),
                onClick: () => {
                    stopKeybindingRecording();
                    applySettings();
                }
            },
            {
                text: t('popup.cancel'),
                onClick: () => {
                    stopKeybindingRecording();
                    applyAudioSettings(oldAudioSettings);
                    if (oldSyntaxColors) {
                        applySyntaxColors(oldSyntaxColors);
                        if (settings) settings.syntaxColors = { ...oldSyntaxColors };
                    }
                },
                hideOnClick: true
            },
            {
                text: t('popup.reset'),
                onClick: () => {
                    stopKeybindingRecording();
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'button') {
                            return;
                        } else if (ref.type === 'checkbox') {
                            ref.el.checked = ref.def;
                            ref.ref[ref.key] = ref.def;
                        } else if (ref.type === 'object' || ref.type === 'color-object') {
                            ref.el.value = { ...ref.def };
                            Object.assign(ref.ref[ref.key], ref.def);
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                            if (ref.apply) ref.apply(ref.ref[ref.key]);
                        } else if (ref.type === 'keybindings') {
                            ref.el.value = { ...(ref.def || {}) };
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                        } else {
                            ref.el.value = ref.def;
                            ref.ref[ref.key] = ref.def;
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                            if (ref.apply) ref.apply(ref.def);
                        }
                    });

                    if (draw) draw();
                    simpleToast({ content: t('toast.restoreSaved'), type: 'info', timeout: 1500 });
                }
            },
        ]
    });
}
