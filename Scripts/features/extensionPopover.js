/**
 * @file extensionPopover.js
 * @description 基於原生 HTML Popover API 的擴充程式設定浮動面板。
 * 支援宣告式設定欄位渲染、視窗邊界防裁切定位與按擴充識別碼隔離的設定持久化。
 */

import { t } from '../i18n.js';

const STORAGE_PREFIX = 'wmcx_ext_settings_';
const memoryFallbackStore = new Map();

let popoverEl = null;
let currentExtensionId = null;
let fallbackListenersBound = false;

function hasNativePopover() {
    return typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');
}

function readStorage(extId) {
    const storageKey = `${STORAGE_PREFIX}${extId}`;
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(storageKey);
            if (raw) return JSON.parse(raw);
        }
    } catch (_) { }
    return memoryFallbackStore.get(storageKey) || {};
}

function writeStorage(extId, values) {
    const storageKey = `${STORAGE_PREFIX}${extId}`;
    memoryFallbackStore.set(storageKey, { ...values });
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(values));
        }
    } catch (_) { }
}

/**
 * 讀取並套用預設值，取得指定擴充程式的目前設定物件
 * @param {string} extId
 * @param {Array<Object>} [schema=[]]
 * @returns {Object}
 */
export function getExtensionSettings(extId, schema = []) {
    const saved = readStorage(extId);
    const result = {};
    for (const field of schema) {
        if (!field || !field.key) continue;
        result[field.key] = saved[field.key] !== undefined ? saved[field.key] : field.default;
    }
    return result;
}

function ensurePopoverElement() {
    if (popoverEl && document.body.contains(popoverEl)) {
        return popoverEl;
    }

    popoverEl = document.createElement('div');
    popoverEl.id = 'extensionSettingsPopover';
    popoverEl.className = 'extension-popover';
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-modal', 'false');

    if (hasNativePopover()) {
        popoverEl.setAttribute('popover', 'auto');
        popoverEl.addEventListener('toggle', (event) => {
            if (event.newState === 'closed') {
                currentExtensionId = null;
            }
        });
    } else if (!fallbackListenersBound) {
        fallbackListenersBound = true;
        document.addEventListener('pointerdown', (event) => {
            if (!popoverEl || !popoverEl.classList.contains('is-open')) return;
            if (!popoverEl.contains(event.target)) {
                hidePopoverElement();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && popoverEl && popoverEl.classList.contains('is-open')) {
                hidePopoverElement();
            }
        });
    }

    document.body.appendChild(popoverEl);
    return popoverEl;
}

function showPopoverElement() {
    const el = ensurePopoverElement();
    if (hasNativePopover()) {
        if (!el.matches(':popover-open')) {
            el.showPopover();
        }
    } else {
        el.classList.add('is-open');
    }
}

function hidePopoverElement() {
    if (!popoverEl) return;
    if (hasNativePopover()) {
        if (popoverEl.matches(':popover-open')) {
            popoverEl.hidePopover();
        }
    } else {
        popoverEl.classList.remove('is-open');
    }
    currentExtensionId = null;
}

/**
 * 依錨點或視窗可視區域定位 Popover，避免超出螢幕邊界
 * @param {HTMLElement} el
 * @param {HTMLElement|null} anchorEl
 */
function positionPopover(el, anchorEl) {
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 220;

    let left = Math.round((vw - width) / 2);
    let top = 64;

    if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
        const aRect = anchorEl.getBoundingClientRect();
        left = aRect.left;
        top = aRect.bottom + 8;
        if (top + height > vh - margin) {
            top = aRect.top - height - 8;
        }
    }

    left = Math.max(margin, Math.min(left, vw - width - margin));
    top = Math.max(margin, Math.min(top, vh - height - margin));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function resolveLabel(label, labelKey) {
    if (labelKey) {
        const translated = t(labelKey);
        if (translated !== labelKey) return translated;
    }
    return label || '';
}

/**
 * 開啟擴充程式的設定 Popover
 * @param {Object} options
 * @param {string} options.extensionId 擴充識別碼
 * @param {string} [options.title] 標題文字
 * @param {Array<Object>} [options.schema=[]] 設定欄位定義陣列
 * @param {HTMLElement} [options.anchorEl] 觸發定位錨點元素
 * @param {Function} [options.onChange] 單一設定變更時觸發 (key, value, allValues)
 * @returns {{ close: Function, getValues: Function }}
 */
export function openExtensionPopover(options) {
    const {
        extensionId,
        title,
        schema = [],
        anchorEl = null,
        onChange = null
    } = options || {};

    if (!extensionId) {
        throw new TypeError('[ExtensionPopover] 缺少 extensionId');
    }

    const el = ensurePopoverElement();
    currentExtensionId = extensionId;
    el.textContent = '';

    const values = getExtensionSettings(extensionId, schema);

    const header = document.createElement('div');
    header.className = 'extension-popover-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'extension-popover-title';
    titleEl.textContent = title || extensionId;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'extension-popover-close';
    closeBtn.setAttribute('aria-label', t('extensions.close'));
    const closeIcon = document.createElement('span');
    closeIcon.className = 'material-symbols-outlined';
    closeIcon.setAttribute('translate', 'no');
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', () => hidePopoverElement());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    el.appendChild(header);

    const form = document.createElement('form');
    form.className = 'extension-popover-body';
    form.addEventListener('submit', (e) => e.preventDefault());

    const inputRefs = [];

    for (const field of schema) {
        if (!field || !field.key) continue;

        const row = document.createElement('div');
        row.className = 'extension-popover-row';

        const inputId = `ext-pop-${extensionId}-${field.key}`;
        const labelEl = document.createElement('label');
        labelEl.className = 'extension-popover-label';
        labelEl.setAttribute('for', inputId);
        labelEl.textContent = resolveLabel(field.label || field.key, field.labelKey);

        let control;
        const fieldType = field.type || 'string';

        if (fieldType === 'boolean') {
            row.classList.add('is-toggle');
            control = document.createElement('input');
            control.type = 'checkbox';
            control.id = inputId;
            control.checked = Boolean(values[field.key]);
            control.addEventListener('change', () => {
                values[field.key] = control.checked;
                writeStorage(extensionId, values);
                if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
            });
        } else if (fieldType === 'select' && Array.isArray(field.options)) {
            control = document.createElement('select');
            control.id = inputId;
            control.className = 'extension-popover-input';
            for (const opt of field.options) {
                const optEl = document.createElement('option');
                optEl.value = String(opt.value);
                optEl.textContent = resolveLabel(opt.label ?? opt.value, opt.labelKey);
                if (String(values[field.key]) === String(opt.value)) {
                    optEl.selected = true;
                }
                control.appendChild(optEl);
            }
            control.addEventListener('change', () => {
                values[field.key] = control.value;
                writeStorage(extensionId, values);
                if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
            });
        } else if (fieldType === 'number') {
            control = document.createElement('input');
            control.type = 'number';
            control.id = inputId;
            control.className = 'extension-popover-input';
            if (field.min !== undefined) control.min = String(field.min);
            if (field.max !== undefined) control.max = String(field.max);
            if (field.step !== undefined) control.step = String(field.step);
            control.value = values[field.key] !== undefined ? String(values[field.key]) : '0';
            control.addEventListener('input', () => {
                const num = Number(control.value);
                if (!Number.isNaN(num)) {
                    values[field.key] = num;
                    writeStorage(extensionId, values);
                    if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
                }
            });
        } else {
            control = document.createElement('input');
            control.type = 'text';
            control.id = inputId;
            control.className = 'extension-popover-input';
            control.value = values[field.key] !== undefined ? String(values[field.key]) : '';
            control.addEventListener('input', () => {
                values[field.key] = control.value;
                writeStorage(extensionId, values);
                if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
            });
        }

        inputRefs.push({ field, control });
        row.appendChild(labelEl);
        row.appendChild(control);
        form.appendChild(row);
    }

    el.appendChild(form);

    if (schema.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'extension-popover-footer';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'extension-popover-reset';
        resetBtn.textContent = t('extensions.resetDefaults');
        resetBtn.addEventListener('click', () => {
            for (const { field, control } of inputRefs) {
                values[field.key] = field.default;
                if (control.type === 'checkbox') {
                    control.checked = Boolean(field.default);
                } else {
                    control.value = field.default !== undefined ? String(field.default) : '';
                }
                if (typeof onChange === 'function') {
                    onChange(field.key, values[field.key], { ...values });
                }
            }
            writeStorage(extensionId, values);
        });

        footer.appendChild(resetBtn);
        el.appendChild(footer);
    }

    showPopoverElement();
    positionPopover(el, anchorEl);

    return {
        close: () => closeExtensionPopover(extensionId),
        getValues: () => ({ ...values })
    };
}

/**
 * 若目前開啟的是指定擴充的 Popover 則將其關閉
 * @param {string} [extensionId]
 */
export function closeExtensionPopover(extensionId) {
    if (!popoverEl) return;
    if (!extensionId || currentExtensionId === extensionId) {
        hidePopoverElement();
    }
}

