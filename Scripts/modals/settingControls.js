import { t } from '../i18n.js';
import { normalizeHexColor } from '../core/themeManager.js';

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
 * 建立與設定頁一致的顏色選擇器（含可點擊編輯之 Hex 顯示與即時預覽）
 * @param {string} value
 * @param {Function} [onInputCallback]
 * @returns {HTMLDivElement}
 */
export function createSettingColorInput(value, onInputCallback) {
    const initialColor = normalizeHexColor(value, '#000000');
    const wrap = document.createElement('div');
    wrap.className = 'popup-setting-color-wrap';

    const hexText = document.createElement('span');
    hexText.className = 'popup-setting-color-hex';
    hexText.textContent = initialColor.toUpperCase();
    hexText.tabIndex = 0;
    hexText.setAttribute('role', 'button');

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'popup-setting-color-input';
    input.value = initialColor;

    const updateColor = (newVal) => {
        const normalized = normalizeHexColor(newVal, input.value || '#000000');
        input.value = normalized;
        hexText.textContent = normalized.toUpperCase();
    };

    input.addEventListener('input', () => {
        updateColor(input.value);
    });
    input.addEventListener('change', () => {
        updateColor(input.value);
        if (onInputCallback) onInputCallback(input.value);
    });

    let isEditingHex = false;
    const enterHexEditMode = () => {
        if (isEditingHex) return;
        isEditingHex = true;

        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.className = 'popup-setting-color-hex-edit';
        editInput.maxLength = 7;
        editInput.spellcheck = false;
        editInput.value = (input.value || '').toUpperCase();

        let finished = false;
        const finishEdit = (commit) => {
            if (finished) return;
            finished = true;
            isEditingHex = false;

            if (commit) {
                const normalized = normalizeHexColor(editInput.value, null);
                if (normalized) {
                    updateColor(normalized);
                    if (onInputCallback) onInputCallback(normalized);
                }
            }

            if (editInput.parentNode) {
                editInput.replaceWith(hexText);
            }
        };

        editInput.addEventListener('click', (e) => e.stopPropagation());
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

        hexText.replaceWith(editInput);
        editInput.focus();
        editInput.select();
    };

    hexText.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterHexEditMode();
    });
    hexText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            enterHexEditMode();
        }
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

    wrap.appendChild(hexText);
    wrap.appendChild(input);
    return wrap;
}
