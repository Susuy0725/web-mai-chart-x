/**
 * @file extensionManager.js
 * @description 擴充程式生命週期與權限門面管理器。
 * 負責依擴充描述宣告的權限組裝最小化上下文，隔離執行錯誤並追蹤資源回收。
 */

import { appContext } from './appContext.js';
import { commandRegistry } from './commandRegistry.js';
import { eventBus, EVENTS } from './eventBus.js';
import { renderOverlayRegistry } from './renderOverlayRegistry.js';
import { registerTranslations, t } from '../i18n.js';

export const EXTENSION_API_VERSION = 1;

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
    UI_TOAST: 'ui:toast',
    UI_MENU: 'ui:menu',
    UI_POPOVER: 'ui:popover',
    UI_OVERLAY: 'ui:overlay',
    I18N_REGISTER: 'i18n:register'
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
    EVENTS.CANVAS_REDRAW
]);

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
        if (!manifest || typeof manifest !== 'object') {
            throw new TypeError('[ExtensionManager] 擴充描述必須為物件');
        }
        if (!manifest.id || typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/i.test(manifest.id)) {
            throw new TypeError('[ExtensionManager] 擴充識別碼格式無效');
        }
        if (!manifest.name || typeof manifest.name !== 'string') {
            throw new TypeError(`[ExtensionManager] 擴充 "${manifest.id}" 缺少名稱`);
        }
        if (!manifest.version || typeof manifest.version !== 'string') {
            throw new TypeError(`[ExtensionManager] 擴充 "${manifest.id}" 缺少版本號`);
        }
        const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
        for (const perm of permissions) {
            if (!ALLOWED_PERMISSION_SET.has(perm)) {
                throw new TypeError(`[ExtensionManager] 擴充 "${manifest.id}" 包含未定義權限: ${perm}`);
            }
        }
        const runtime = manifest.runtime || 'trusted';
        if (runtime !== 'trusted' && runtime !== 'worker') {
            throw new TypeError(`[ExtensionManager] 擴充 "${manifest.id}" 使用不支援的執行模式: ${runtime}`);
        }
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
                    if (typeof handler !== 'function') return () => { };
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
                    const dispose = renderOverlayRegistry.register(options);
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
                    if (!this._uiBridge || typeof this._uiBridge.registerMenuItem !== 'function') {
                        return () => {};
                    }
                    const dispose = this._uiBridge.registerMenuItem(extId, item);
                    disposables.push(dispose);
                    return dispose;
                };
            }
            if (hasUiPopover) {
                uiApi.openPopover = (options = {}) => {
                    if (!this._uiBridge || typeof this._uiBridge.openPopover !== 'function') {
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
                    if (!this._uiBridge || typeof this._uiBridge.createFloatingWidget !== 'function') {
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
                    const dispose = registerTranslations(namespace, localeMap);
                    disposables.push(dispose);
                    return dispose;
                },
                t: (key, params = {}) => t(`${namespace}.${key}`, params)
            });
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
                description: manifest.description ? String(manifest.description) : '',
                author: manifest.author ? String(manifest.author) : '',
                permissions: Object.freeze([...(manifest.permissions || [])]),
                runtime: manifest.runtime || 'trusted'
            }),
            factory,
            status: autoActivate ? 'registered' : 'inactive',
            error: null,
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
        const context = this._createScopedContext(record);

        try {
            const teardown = record.factory(context);
            if (typeof teardown === 'function') {
                record.disposables.push(teardown);
            } else if (teardown && typeof teardown.dispose === 'function') {
                record.disposables.push(() => teardown.dispose());
            }
            record.status = 'active';
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

