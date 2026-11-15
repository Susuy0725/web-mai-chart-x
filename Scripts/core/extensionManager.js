/**
 * @file extensionManager.js
 * @description 擴充程式生命週期與權限門面管理器。
 * 負責依擴充描述宣告的權限組裝最小化上下文，隔離執行錯誤並追蹤資源回收。
 */

import { appContext } from './appContext.js';
import { commandRegistry } from './commandRegistry.js';
import { eventBus, EVENTS } from './eventBus.js';
import { renderOverlayRegistry } from './renderOverlayRegistry.js';
import { extensionOverrideRegistry } from './extensionOverrideRegistry.js';
import {
    getExtensionData,
    setExtensionData,
    removeExtensionData,
    clearExtensionData,
    listExtensionDataKeys
} from './extensionStorage.js';
import { registerTranslations, t } from '../i18n.js';

export const EXTENSION_API_VERSION = 1;

const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/i;

export const EXTENSION_PERMISSIONS = Object.freeze({
    EDITOR_READ: 'editor:read',
    EDITOR_WRITE: 'editor:write',
    CHART_READ: 'chart:read',
    VIEW_READ: 'view:read',
    PLAYBACK_READ: 'playback:read',
    PLAYBACK_SEEK: 'playback:seek',
    RENDER_OVERLAY: 'render:overlay',
    COMMANDS_REGISTER: 'commands:register',
    EVENTS_SUBSCRIBE: 'events:subscribe',
    SETTINGS_READ: 'settings:read',
    SETTINGS_OVERRIDE: 'settings:override',
    ASSETS_READ: 'assets:read',
    ASSETS_OVERRIDE: 'assets:override',
    UI_TOAST: 'ui:toast',
    UI_MENU: 'ui:menu',
    UI_POPOVER: 'ui:popover',
    UI_OVERLAY: 'ui:overlay',
    I18N_REGISTER: 'i18n:register',
    STORAGE: 'storage'
});

const ALLOWED_PERMISSION_SET = new Set(Object.values(EXTENSION_PERMISSIONS));

const SUBSCRIBABLE_EVENTS = new Set([
    EVENTS.APP_READY,
    EVENTS.PROJECT_LOADED,
    EVENTS.MAIDATA_CHANGED,
    EVENTS.CHART_DECODED,
    EVENTS.VIEW_MODE_CHANGED,
    EVENTS.PLAYBACK_STATE_CHANGED,
    EVENTS.PLAYBACK_SEEK,
    EVENTS.CANVAS_REDRAW,
    EVENTS.SETTINGS_CHANGED
]);

/**
 * 驗證擴充描述檔格式、權限白名單與 API 版本相容性
 * @param {Object} manifest
 */
export function validateExtensionManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        throw new TypeError('[ExtensionManager] 擴充描述必須為物件');
    }
    if (!manifest.id || typeof manifest.id !== 'string' || !EXTENSION_ID_PATTERN.test(manifest.id)) {
        throw new TypeError(t('extensions.errInvalidIdFormat'));
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
        throw new TypeError(t('extensions.errMissingRequiredFields'));
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
        throw new TypeError(t('extensions.errMissingRequiredFields'));
    }
    if (manifest.apiVersion !== undefined && manifest.apiVersion !== null) {
        if (typeof manifest.apiVersion !== 'number' || !Number.isInteger(manifest.apiVersion) || manifest.apiVersion < 1 || manifest.apiVersion > EXTENSION_API_VERSION) {
            throw new TypeError(t('extensions.errUnsupportedApiVersion', {
                version: String(manifest.apiVersion),
                supported: String(EXTENSION_API_VERSION)
            }));
        }
    }
    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    for (const perm of permissions) {
        if (!ALLOWED_PERMISSION_SET.has(perm)) {
            throw new TypeError(t('extensions.errInvalidPermission', { permission: String(perm) }));
        }
    }
    const runtime = manifest.runtime || 'trusted';
    if (runtime !== 'trusted' && runtime !== 'worker') {
        throw new TypeError(t('extensions.errUnsupportedRuntime', { runtime: String(runtime) }));
    }
    for (const urlField of ['homepage', 'termsUrl', 'privacyUrl']) {
        const raw = manifest[urlField];
        if (raw === undefined || raw === null || raw === '') continue;
        if (typeof raw !== 'string') {
            throw new TypeError(t('extensions.errInvalidUrl', { field: urlField }));
        }
        try {
            const parsed = new URL(raw);
            if (parsed.protocol !== 'https:') {
                throw new TypeError(t('extensions.errInvalidUrl', { field: urlField }));
            }
        } catch (_) {
            throw new TypeError(t('extensions.errInvalidUrl', { field: urlField }));
        }
    }
}

class ExtensionManager {
    constructor() {
        /** @type {Map<string, Object>} */
        this.extensions = new Map();
        this._isReady = false;
        this._uiBridge = null;
    }

    /**
     * 注入 UI 橋接器，避免核心層反向依賴瀏覽器 DOM 與 Canvas 模組
     * @param {Object} bridge
     */
    setUiBridge(bridge) {
        this._uiBridge = bridge || null;
    }

    /**
     * 驗證擴充描述資訊，防止缺失識別碼或無效權限造成不可預期行為
     * @param {Object} manifest
     */
    _validateManifest(manifest) {
        validateExtensionManifest(manifest);
    }

    /**
     * 依權限清單建構受限的擴充上下文，避免直接暴露 appContext 或內部儲存層
     * @param {Object} record
     * @returns {Object}
     */
    _createScopedContext(record) {
        const permSet = new Set(record.manifest.permissions);
        const disposables = record.disposables;
        const extId = record.manifest.id;
        const expectedGen = record.activationGen;
        const isContextActive = () => record.status === 'active' && record.activationGen === expectedGen;

        const scoped = {
            apiVersion: EXTENSION_API_VERSION,
            extensionId: extId,
            hasPermission: (perm) => permSet.has(perm)
        };

        if (permSet.has(EXTENSION_PERMISSIONS.EDITOR_READ) || permSet.has(EXTENSION_PERMISSIONS.EDITOR_WRITE)) {
            const editorApi = {};
            if (permSet.has(EXTENSION_PERMISSIONS.EDITOR_READ)) {
                editorApi.getText = () => appContext.getEditorText();
                editorApi.getSelection = () => appContext.getEditorSelection();
                editorApi.on = (eventName, handler) => {
                    if (typeof handler !== 'function' || !isContextActive()) return () => { };
                    const off = appContext.onEditorEvent(eventName, (payload) => {
                        try {
                            handler(payload);
                        } catch (err) {
                            console.error(`[Extension:${extId}] editor.on(${eventName}) 處理失敗:`, err);
                        }
                    });
                    let disposed = false;
                    const cleanup = () => {
                        if (disposed) return;
                        disposed = true;
                        off();
                    };
                    disposables.push(cleanup);
                    return cleanup;
                };
            }
            if (permSet.has(EXTENSION_PERMISSIONS.EDITOR_WRITE)) {
                editorApi.replaceSelection = (replacement, start, end) =>
                    appContext.replaceEditorSelection(replacement, start, end);
            }
            scoped.editor = Object.freeze(editorApi);
        }

        const hasPlaybackRead = permSet.has(EXTENSION_PERMISSIONS.PLAYBACK_READ);
        const hasPlaybackSeek = permSet.has(EXTENSION_PERMISSIONS.PLAYBACK_SEEK);

        if (hasPlaybackRead || hasPlaybackSeek) {
            const playbackApi = {};
            if (hasPlaybackRead) {
                playbackApi.getState = () => appContext.getPlaybackState();
                playbackApi.getDuration = () => appContext.getDuration();
            }
            if (hasPlaybackSeek) {
                playbackApi.seek = (targetTime) => {
                    const num = Number(targetTime);
                    if (Number.isNaN(num)) return false;
                    const max = appContext.getDuration();
                    const clamped = max > 0 ? Math.max(0, Math.min(num, max)) : Math.max(0, num);
                    return appContext.seekToTime(clamped);
                };
                playbackApi.nudge = (deltaSeconds) => {
                    const delta = Number(deltaSeconds);
                    if (Number.isNaN(delta)) return false;
                    const current = appContext.getPlaybackState().realTime || 0;
                    const max = appContext.getDuration();
                    const next = max > 0
                        ? Math.max(0, Math.min(current + delta, max))
                        : Math.max(0, current + delta);
                    return appContext.seekToTime(next);
                };
            }
            scoped.playback = Object.freeze(playbackApi);
        }

        if (permSet.has(EXTENSION_PERMISSIONS.CHART_READ)) {
            scoped.chart = Object.freeze({
                getSnapshot: () => appContext.getChartSnapshot(),
                getCoverImageUrl: () => appContext.getCoverImageUrl()
            });
        }

        if (permSet.has(EXTENSION_PERMISSIONS.VIEW_READ)) {
            scoped.view = Object.freeze({
                getMode: () => appContext.getViewMode()
            });
        }

        if (permSet.has(EXTENSION_PERMISSIONS.RENDER_OVERLAY)) {
            scoped.render = Object.freeze({
                registerOverlay: (options) => {
                    if (!isContextActive()) return () => { };
                    const dispose = renderOverlayRegistry.register({
                        ...options,
                        extensionId: extId,
                        extensionName: record.manifest.name || extId
                    });
                    disposables.push(() => {
                        dispose();
                        eventBus.emit(EVENTS.CANVAS_REDRAW);
                    });
                    eventBus.emit(EVENTS.CANVAS_REDRAW);
                    return dispose;
                },
                requestRedraw: () => eventBus.emit(EVENTS.CANVAS_REDRAW)
            });
        }

        if (permSet.has(EXTENSION_PERMISSIONS.COMMANDS_REGISTER)) {
            scoped.commands = Object.freeze({
                register: (localCommandId, handler, meta = {}) => {
                    if (!isContextActive()) return () => { };
                    // 強制加上擴充識別碼前綴，防止覆寫核心指令或與其他擴充衝突
                    const fullId = `ext.${extId}.${localCommandId}`;
                    const dispose = commandRegistry.register(fullId, handler, {
                        ...meta,
                        extensionId: extId
                    });
                    disposables.push(dispose);
                    return dispose;
                }
            });
        }

        if (permSet.has(EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE)) {
            scoped.events = Object.freeze({
                on: (eventName, callback) => {
                    if (!isContextActive()) return () => {};
                    if (!SUBSCRIBABLE_EVENTS.has(eventName)) {
                        console.warn(`[ExtensionManager] 擴充 "${extId}" 嘗試訂閱未開放事件 "${eventName}"`);
                        return () => {};
                    }
                    const unsubscribe = eventBus.on(eventName, callback);
                    disposables.push(unsubscribe);
                    return unsubscribe;
                }
            });
        }

        const hasUiToast = permSet.has(EXTENSION_PERMISSIONS.UI_TOAST);
        const hasUiMenu = permSet.has(EXTENSION_PERMISSIONS.UI_MENU);
        const hasUiPopover = permSet.has(EXTENSION_PERMISSIONS.UI_POPOVER);
        const hasUiOverlay = permSet.has(EXTENSION_PERMISSIONS.UI_OVERLAY);

        if (hasUiToast || hasUiMenu || hasUiPopover || hasUiOverlay) {
            const uiApi = {};
            if (hasUiToast) {
                uiApi.toast = (options) => {
                    const toastFn = appContext.get('simpleToast');
                    if (typeof toastFn === 'function') {
                        toastFn(options);
                    }
                };
            }
            if (hasUiMenu) {
                uiApi.registerMenuItem = (item) => {
                    if (!isContextActive() || !this._uiBridge || typeof this._uiBridge.registerMenuItem !== 'function') {
                        return () => {};
                    }
                    const dispose = this._uiBridge.registerMenuItem(extId, item);
                    disposables.push(dispose);
                    return dispose;
                };
            }
            if (hasUiPopover) {
                uiApi.openPopover = (options = {}) => {
                    if (!isContextActive() || !this._uiBridge || typeof this._uiBridge.openPopover !== 'function') {
                        return { close: () => {}, getValues: () => ({}) };
                    }
                    const handle = this._uiBridge.openPopover({
                        ...options,
                        extensionId: extId,
                        title: options.title || record.manifest.name
                    });
                    disposables.push(() => this._uiBridge?.closePopover?.(extId));
                    return handle;
                };
                uiApi.closePopover = () => this._uiBridge?.closePopover?.(extId);
                uiApi.getSettings = (schema = []) => {
                    if (!this._uiBridge || typeof this._uiBridge.getSettings !== 'function') {
                        return {};
                    }
                    return this._uiBridge.getSettings(extId, schema);
                };
            }
            if (hasUiOverlay) {
                uiApi.createFloatingWidget = (options = {}) => {
                    if (!isContextActive() || !this._uiBridge || typeof this._uiBridge.createFloatingWidget !== 'function') {
                        return null;
                    }
                    const widget = this._uiBridge.createFloatingWidget(extId, options);
                    if (widget && typeof widget.dispose === 'function') {
                        disposables.push(widget.dispose);
                    }
                    return widget;
                };
            }
            scoped.ui = Object.freeze(uiApi);
        }

        if (permSet.has(EXTENSION_PERMISSIONS.I18N_REGISTER)) {
            const namespace = `ext.${extId}`;
            scoped.i18n = Object.freeze({
                registerTranslations: (localeMap) => {
                    if (!isContextActive()) return () => {};
                    const dispose = registerTranslations(namespace, localeMap);
                    disposables.push(dispose);
                    return dispose;
                },
                t: (key, params = {}) => t(`${namespace}.${key}`, params)
            });
        }

        if (permSet.has(EXTENSION_PERMISSIONS.STORAGE)) {
            scoped.storage = Object.freeze({
                get: (key, defaultValue = null) => getExtensionData(extId, key, defaultValue),
                set: (key, value) => setExtensionData(extId, key, value),
                remove: (key) => removeExtensionData(extId, key),
                clear: () => clearExtensionData(extId),
                keys: () => listExtensionDataKeys(extId)
            });
        }

        const hasSettingsRead = permSet.has(EXTENSION_PERMISSIONS.SETTINGS_READ);
        const hasSettingsOverride = permSet.has(EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE);
        if (hasSettingsRead || hasSettingsOverride) {
            const cloneReadonly = (val) => {
                if (val === null || typeof val !== 'object') return val;
                if (Array.isArray(val)) return Object.freeze(val.map(cloneReadonly));
                const out = {};
                for (const k of Object.keys(val)) {
                    out[k] = cloneReadonly(val[k]);
                }
                return Object.freeze(out);
            };
            const settingsApi = {
                get: (key, defaultValue = undefined) => {
                    if (typeof key !== 'string' || !key) return defaultValue;
                    const segments = key.split('.');
                    let cur = appContext.settings;
                    for (const seg of segments) {
                        if (cur === null || cur === undefined || typeof cur !== 'object') {
                            return defaultValue;
                        }
                        cur = cur[seg];
                    }
                    return cur !== undefined ? cloneReadonly(cur) : defaultValue;
                },
                getAll: () => cloneReadonly(appContext.settings || {})
            };
            if (hasSettingsOverride) {
                settingsApi.override = (key, value) => {
                    if (!isContextActive()) return () => {};
                    const dispose = extensionOverrideRegistry.overrideSetting(extId, key, value);
                    disposables.push(dispose);
                    return dispose;
                };
                settingsApi.overrideMany = (entries) => {
                    if (!isContextActive()) return () => {};
                    const dispose = extensionOverrideRegistry.overrideSettings(extId, entries);
                    disposables.push(dispose);
                    return dispose;
                };
                settingsApi.clearOverrides = () => {
                    extensionOverrideRegistry.clearSettingOverrides(extId);
                };
            }
            scoped.settings = Object.freeze(settingsApi);
        }

        const hasAssetsRead = permSet.has(EXTENSION_PERMISSIONS.ASSETS_READ);
        const hasAssetsOverride = permSet.has(EXTENSION_PERMISSIONS.ASSETS_OVERRIDE);
        if (hasAssetsRead || hasAssetsOverride) {
            const assetsApi = {
                listImageKeys: () => extensionOverrideRegistry.listImageKeys(),
                listSoundKeys: () => extensionOverrideRegistry.listSoundKeys()
            };
            if (hasAssetsOverride) {
                assetsApi.overrideImage = async (key, source) => {
                    if (!isContextActive()) return () => {};
                    const dispose = await extensionOverrideRegistry.overrideImage(extId, key, source);
                    disposables.push(dispose);
                    return dispose;
                };
                assetsApi.overrideImages = async (entries) => {
                    if (!isContextActive()) return () => {};
                    const dispose = await extensionOverrideRegistry.overrideImages(extId, entries);
                    disposables.push(dispose);
                    return dispose;
                };
                assetsApi.overrideSound = async (key, source) => {
                    if (!isContextActive()) return () => {};
                    const dispose = await extensionOverrideRegistry.overrideSound(extId, key, source);
                    disposables.push(dispose);
                    return dispose;
                };
                assetsApi.overrideSounds = async (entries) => {
                    if (!isContextActive()) return () => {};
                    const dispose = await extensionOverrideRegistry.overrideSounds(extId, entries);
                    disposables.push(dispose);
                    return dispose;
                };
                assetsApi.clearOverrides = () => {
                    extensionOverrideRegistry.clearImageOverrides(extId);
                    extensionOverrideRegistry.clearSoundOverrides(extId);
                };
            }
            scoped.assets = Object.freeze(assetsApi);
        }

        return Object.freeze(scoped);
    }

    /**
     * 註冊擴充程式
     * @param {Object} manifest 擴充描述資訊
     * @param {Function} factory 擴充初始化工廠函式，可回傳清理函式或含 dispose 的物件
     * @param {Object} [options={}]
     * @param {boolean} [options.autoActivate=true]
     * @returns {boolean}
     */
    register(manifest, factory, options = {}) {
        this._validateManifest(manifest);
        if (typeof factory !== 'function') {
            throw new TypeError(`[ExtensionManager] 擴充 "${manifest.id}" 必須提供初始化函式`);
        }
        if (this.extensions.has(manifest.id)) {
            console.warn(`[ExtensionManager] 擴充 "${manifest.id}" 已註冊，略過重複註冊`);
            return false;
        }

        const { autoActivate = true } = options || {};

        const record = {
            manifest: Object.freeze({
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                apiVersion: manifest.apiVersion ?? EXTENSION_API_VERSION,
                description: manifest.description ? String(manifest.description) : '',
                author: manifest.author ? String(manifest.author) : '',
                permissions: Object.freeze([...(manifest.permissions || [])]),
                runtime: manifest.runtime || 'trusted',
                homepage: manifest.homepage ? String(manifest.homepage) : '',
                termsUrl: manifest.termsUrl ? String(manifest.termsUrl) : '',
                privacyUrl: manifest.privacyUrl ? String(manifest.privacyUrl) : ''
            }),
            factory,
            status: autoActivate ? 'registered' : 'inactive',
            error: null,
            activationGen: 0,
            disposables: []
        };

        this.extensions.set(manifest.id, record);
        eventBus.emit(EVENTS.EXTENSION_REGISTERED, { id: manifest.id, manifest: record.manifest });

        if (this._isReady && autoActivate) {
            this.activate(manifest.id);
        }
        return true;
    }

    /**
     * 啟用指定擴充程式並隔離初始化錯誤
     * @param {string} id
     * @returns {boolean}
     */
    activate(id) {
        const record = this.extensions.get(id);
        if (!record) return false;
        if (record.status === 'active') return true;

        // 本階段先實作主執行緒受限門面，worker 沙箱執行通道將於後續階段接上
        if (record.manifest.runtime === 'worker') {
            record.status = 'error';
            record.error = new Error(t('extensions.errWorkerUnsupported'));
            eventBus.emit(EVENTS.EXTENSION_ERROR, { id, error: record.error });
            return false;
        }

        record.disposables = [];
        record.error = null;
        record.activationGen = (record.activationGen || 0) + 1;
        const currentGen = record.activationGen;
        record.status = 'active';
        const context = this._createScopedContext(record);

        try {
            const registerTeardown = (teardown) => {
                if (typeof teardown === 'function') {
                    if (record.status === 'active' && record.activationGen === currentGen) {
                        record.disposables.push(teardown);
                    } else {
                        try {
                            teardown();
                        } catch (cleanupErr) {
                            console.warn(`[ExtensionManager] 清理已停用擴充 "${id}" 資源失敗:`, cleanupErr);
                        }
                    }
                } else if (teardown && typeof teardown.dispose === 'function') {
                    if (record.status === 'active' && record.activationGen === currentGen) {
                        record.disposables.push(() => teardown.dispose());
                    } else {
                        try {
                            teardown.dispose();
                        } catch (cleanupErr) {
                            console.warn(`[ExtensionManager] 清理已停用擴充 "${id}" 資源失敗:`, cleanupErr);
                        }
                    }
                }
            };

            const result = record.factory(context);
            if (result && typeof result.then === 'function') {
                result.then((teardown) => {
                    registerTeardown(teardown);
                }).catch((error) => {
                    console.error(`[ExtensionManager] 擴充 "${id}" 非同步啟用失敗:`, error);
                    if (record.status === 'active' && record.activationGen === currentGen) {
                        this._uiBridge?.closePopover?.(id);
                        this._runDisposables(record);
                        record.status = 'error';
                        record.error = error;
                        eventBus.emit(EVENTS.EXTENSION_ERROR, { id, error });
                    }
                });
            } else {
                registerTeardown(result);
            }
            eventBus.emit(EVENTS.EXTENSION_ACTIVATED, { id });
            return true;
        } catch (error) {
            console.error(`[ExtensionManager] 擴充 "${id}" 啟用失敗:`, error);
            this._uiBridge?.closePopover?.(id);
        this._runDisposables(record);
            record.status = 'error';
            record.error = error;
            eventBus.emit(EVENTS.EXTENSION_ERROR, { id, error });
            return false;
        }
    }

    /**
     * 停用指定擴充程式並回收其註冊的指令與事件監聽
     * @param {string} id
     * @returns {boolean}
     */
    deactivate(id) {
        const record = this.extensions.get(id);
        if (!record || record.status !== 'active') return false;

        this._uiBridge?.closePopover?.(id);
        this._runDisposables(record);
        record.status = 'inactive';
        eventBus.emit(EVENTS.EXTENSION_DEACTIVATED, { id });
        return true;
    }

    /**
     * 完整移除已註冊的擴充程式紀錄
     * @param {string} id
     * @returns {boolean}
     */
    unregister(id) {
        const record = this.extensions.get(id);
        if (!record) return false;
        const wasActive = record.status === 'active';
        if (wasActive) {
            this.deactivate(id);
        }
        this.extensions.delete(id);
        if (!wasActive) {
            eventBus.emit(EVENTS.EXTENSION_DEACTIVATED, { id });
        }
        return true;
    }

    /**
     * @param {Object} record
     */
    _runDisposables(record) {
        while (record.disposables.length > 0) {
            const dispose = record.disposables.pop();
            try {
                dispose();
            } catch (error) {
                console.error(`[ExtensionManager] 清理擴充 "${record.manifest.id}" 資源失敗:`, error);
            }
        }
        try {
            extensionOverrideRegistry.clearAllOverrides(record.manifest.id);
        } catch (error) {
            console.error(`[ExtensionManager] 清理擴充 "${record.manifest.id}" 覆寫資源失敗:`, error);
        }
    }

    /**
     * 在主程式初始化完成後啟用所有已註冊的擴充程式
     */
    activateAll() {
        this._isReady = true;
        for (const id of this.extensions.keys()) {
            this.activate(id);
        }
    }

    /**
     * 取得已註冊擴充清單與目前狀態
     * @returns {Array<{ manifest: Object, status: string, error: string|null }>}
     */
    list() {
        const result = [];
        for (const record of this.extensions.values()) {
            result.push({
                manifest: record.manifest,
                status: record.status,
                error: record.error ? record.error.message : null
            });
        }
        return result;
    }
}

export const extensionManager = new ExtensionManager();

