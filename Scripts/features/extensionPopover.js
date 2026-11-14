/**
 * @file extensionPopover.js
 * @description 復用主程式既有 popupWindow 與表單樣式的擴充程式設定視窗。
 * 支援宣告式設定欄位渲染與按擴充識別碼隔離的設定持久化。
 */

import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

const STORAGE_PREFIX = 'wmcx_ext_settings_';
const memoryFallbackStore = new Map();

let currentPopupCtx = null;
let currentExtensionId = null;

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

function resolveLabel(fallbackLabel, labelKey) {
    if (labelKey) {
        const translated = t(labelKey);
        if (translated && translated !== labelKey) {
            return translated;
        }
    }
    return fallbackLabel || '';
}

/**
 * 復用系統既有 popupWindow 開啟擴充程式設定視窗
 * @param {Object} options
 * @param {string} options.extensionId
 * @param {string} [options.title]
 * @param {Array<Object>} [options.schema=[]]
 * @param {HTMLElement|null} [options.anchorEl=null] 保留參數相容性
 * @param {Function} [options.onChange]
 * @returns {{ close: Function, getValues: Function }}
 */
export function openExtensionPopover(options) {
    const {
        extensionId,
        title,
        schema = [],
        onChange = null
    } = options || {};

    if (!extensionId) {
        throw new TypeError('[ExtensionPopover] 缺少 extensionId');
    }

    if (currentPopupCtx && !currentPopupCtx.isClosed) {
        currentPopupCtx.close();
    }

    const values = getExtensionSettings(extensionId, schema);
    const container = document.createElement('div');
    container.className = 'popup-settings-container';

    const inputRefs = [];

    for (const field of schema) {
        if (!field || !field.key) continue;

        const row = document.createElement('div');
        row.className = 'popup-setting-row';
        const inputId = `ext-pop-${extensionId}-${field.key}`;
        const labelText = resolveLabel(field.label || field.key, field.labelKey);
        const fieldType = field.type || 'string';

        let control;

        if (fieldType === 'boolean') {
            const wrapper = document.createElement('label');
            wrapper.className = 'popup-setting-wrapper';
            wrapper.setAttribute('for', inputId);

            const textSpan = document.createElement('span');
            textSpan.className = 'popup-setting-text';
            if (field.labelKey) textSpan.setAttribute('data-i18n', field.labelKey);
            textSpan.textContent = labelText;

            control = document.createElement('input');
            control.type = 'checkbox';
            control.id = inputId;
            control.checked = Boolean(values[field.key]);
            control.addEventListener('change', () => {
                values[field.key] = control.checked;
                writeStorage(extensionId, values);
                if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
            });

            wrapper.append(textSpan, control);
            row.appendChild(wrapper);
        } else {
            const labelEl = document.createElement('label');
            labelEl.className = 'popup-setting-label';
            labelEl.setAttribute('for', inputId);
            if (field.labelKey) labelEl.setAttribute('data-i18n', field.labelKey);
            labelEl.textContent = labelText;

            if (fieldType === 'select' && Array.isArray(field.options)) {
                control = document.createElement('select');
                control.id = inputId;
                control.className = 'popup-setting-dropdown';
                for (const opt of field.options) {
                    const optEl = document.createElement('option');
                    optEl.value = String(opt.value);
                    if (opt.labelKey) optEl.setAttribute('data-i18n', opt.labelKey);
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
                row.append(labelEl, control);
            } else if (fieldType === 'number') {
                control = document.createElement('input');
                control.type = 'number';
                control.id = inputId;
                control.className = 'popup-setting-input';
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
                row.append(labelEl, control);
            } else if (fieldType === 'password') {
                const wrap = document.createElement('div');
                wrap.className = 'popup-setting-password-wrap';

                control = document.createElement('input');
                control.type = 'password';
                control.id = inputId;
                control.className = 'popup-setting-input popup-setting-input-text';
                control.autocomplete = 'off';
                if (field.placeholderKey) control.setAttribute('data-i18n-placeholder', field.placeholderKey);
                if (field.placeholder || field.placeholderKey) {
                    control.placeholder = resolveLabel(field.placeholder || '', field.placeholderKey);
                }
                control.value = values[field.key] !== undefined ? String(values[field.key]) : '';
                control.addEventListener('input', () => {
                    values[field.key] = control.value;
                    writeStorage(extensionId, values);
                    if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
                });

                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'popup-setting-toggle-btn';
                toggleBtn.setAttribute('aria-label', t('extensions.togglePassword'));
                toggleBtn.setAttribute('data-i18n-aria-label', 'extensions.togglePassword');
                const iconSpan = document.createElement('span');
                iconSpan.className = 'material-symbols-outlined';
                iconSpan.setAttribute('translate', 'no');
                iconSpan.textContent = 'visibility';
                toggleBtn.appendChild(iconSpan);
                toggleBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isHidden = control.type === 'password';
                    control.type = isHidden ? 'text' : 'password';
                    iconSpan.textContent = isHidden ? 'visibility_off' : 'visibility';
                });

                wrap.append(control, toggleBtn);
                row.append(labelEl, wrap);
            } else {
                control = document.createElement('input');
                control.type = 'text';
                control.id = inputId;
                control.className = 'popup-setting-input';
                if (field.placeholderKey) control.setAttribute('data-i18n-placeholder', field.placeholderKey);
                if (field.placeholder || field.placeholderKey) {
                    control.placeholder = resolveLabel(field.placeholder || '', field.placeholderKey);
                }
                control.value = values[field.key] !== undefined ? String(values[field.key]) : '';
                control.addEventListener('input', () => {
                    values[field.key] = control.value;
                    writeStorage(extensionId, values);
                    if (typeof onChange === 'function') onChange(field.key, values[field.key], { ...values });
                });
                row.append(labelEl, control);
            }
        }

        inputRefs.push({ field, control });
        container.appendChild(row);

        if (field.notice || field.noticeKey) {
            const noticeEl = document.createElement('div');
            noticeEl.className = 'popup-setting-notice';
            if (field.noticeKey) noticeEl.setAttribute('data-i18n', field.noticeKey);
            noticeEl.textContent = resolveLabel(field.notice || '', field.noticeKey);
            container.appendChild(noticeEl);
        }
    }

    const buttons = [];
    if (schema.length > 0) {
        buttons.push({
            text: t('extensions.resetDefaults'),
            onClick: () => {
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
            }
        });
    }
    buttons.push({
        text: t('extensions.close'),
        hideOnClick: true
    });

    currentExtensionId = extensionId;
    const popupCtx = popupWindow({
        title: title || extensionId,
        customContent: container,
        width: '90%',
        maxWidth: '400px',
        buttons,
        onClose: () => {
            if (currentPopupCtx === popupCtx) {
                currentPopupCtx = null;
                currentExtensionId = null;
            }
        }
    });
    currentPopupCtx = popupCtx;

    return {
        close: () => closeExtensionPopover(extensionId),
        getValues: () => ({ ...values })
    };
}

/**
 * 若目前開啟的是指定擴充的設定視窗則將其關閉
 * @param {string} [extensionId]
 */
export function closeExtensionPopover(extensionId) {
    if (!currentPopupCtx || currentPopupCtx.isClosed) return;
    if (!extensionId || currentExtensionId === extensionId) {
        currentPopupCtx.close();
        currentPopupCtx = null;
        currentExtensionId = null;
    }
}
