/**
 * @file extensionOverrideRegistry.js
 * @description 擴充程式層疊覆寫註冊表。
 * 管理外掛對原生設定、圖片貼圖與音效素材的非破壞性覆寫，
 * 支援多外掛堆疊優先序、切換 Skin 重套用、持久化隔離與停用自動還原。
 */

import { appContext } from './appContext.js';
import { eventBus, EVENTS } from './eventBus.js';

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function cloneValue(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(cloneValue);
    const out = {};
    for (const k of Object.keys(val)) {
        out[k] = cloneValue(val[k]);
    }
    return out;
}

function parseSettingPath(path) {
    if (typeof path !== 'string' || !path.trim()) {
        throw new TypeError('[OverrideRegistry] 設定鍵名必須為非空字串');
    }
    const segments = path.split('.');
    for (const seg of segments) {
        if (!seg || FORBIDDEN_SEGMENTS.has(seg)) {
            throw new TypeError(`[OverrideRegistry] 禁止存取不安全的設定路徑: ${path}`);
        }
    }
    return segments;
}

function getBySegments(obj, segments) {
    let cur = obj;
    for (const seg of segments) {
        if (cur === null || cur === undefined || typeof cur !== 'object') {
            return undefined;
        }
        cur = cur[seg];
    }
    return cur;
}

function setBySegments(obj, segments, value) {
    let cur = obj;
    for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (!cur[seg] || typeof cur[seg] !== 'object') {
            cur[seg] = {};
        }
        cur = cur[seg];
    }
    const last = segments[segments.length - 1];
    if (value === undefined) {
        delete cur[last];
    } else {
        cur[last] = cloneValue(value);
    }
}

function validateAssetKey(key, kind) {
    if (typeof key !== 'string' || !key.trim() || FORBIDDEN_SEGMENTS.has(key)) {
        throw new TypeError(`[OverrideRegistry] 無效的${kind}鍵名: ${key}`);
    }
}

function loadImageElementFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!url.startsWith('blob:') && !url.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`[OverrideRegistry] 圖片載入失敗: ${url}`));
        img.src = url;
    });
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('[OverrideRegistry] Canvas 轉換 Blob 失敗'));
            }, 'image/png');
            return;
        }
        reject(new Error('[OverrideRegistry] 瀏覽器不支援 Canvas.toBlob'));
    });
}

/**
 * 將各類圖片來源統一標準化為已載入完成的 HTMLImageElement，
 * 確保具備 complete、naturalWidth 與 naturalHeight 等屬性。
 */
async function resolveImageSource(source) {
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
        if (source.complete && source.naturalWidth > 0) {
            return { image: source, objectUrl: null };
        }
        await new Promise((resolve, reject) => {
            source.addEventListener('load', resolve, { once: true });
            source.addEventListener('error', () => reject(new Error('[OverrideRegistry] 傳入的 Image 載入失敗')), { once: true });
        });
        return { image: source, objectUrl: null };
    }

    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
        const blob = await canvasToBlob(source);
        const objectUrl = URL.createObjectURL(blob);
        try {
            const image = await loadImageElementFromUrl(objectUrl);
            return { image, objectUrl };
        } catch (err) {
            URL.revokeObjectURL(objectUrl);
            throw err;
        }
    }

    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0);
        const blob = await canvasToBlob(canvas);
        const objectUrl = URL.createObjectURL(blob);
        try {
            const image = await loadImageElementFromUrl(objectUrl);
            return { image, objectUrl };
        } catch (err) {
            URL.revokeObjectURL(objectUrl);
            throw err;
        }
    }

    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const objectUrl = URL.createObjectURL(source);
        try {
            const image = await loadImageElementFromUrl(objectUrl);
            return { image, objectUrl };
        } catch (err) {
            URL.revokeObjectURL(objectUrl);
            throw err;
        }
    }

    if (typeof source === 'string' && source.trim()) {
        const image = await loadImageElementFromUrl(source);
        return { image, objectUrl: null };
    }

    throw new TypeError('[OverrideRegistry] 不支援的圖片素材來源格式');
}

class ExtensionOverrideRegistry {
    constructor() {
        this._seq = 0;

        // path -> Array<{ token, extensionId, segments, value }>
        this._settingStacks = new Map();
        // path -> originalValueSnapshot
        this._settingBase = new Map();

        // key -> Array<{ token, extensionId, image, objectUrl }>
        this._imageStacks = new Map();
        // key -> originalImageOrUndefined
        this._imageBase = new Map();

        // key -> Array<{ token, extensionId, buffer }>
        this._soundStacks = new Map();
        // key -> originalAudioBufferOrUndefined
        this._soundBase = new Map();

        // 追蹤非同步載入中的 token，供停用時立即取消
        this._cancelledTokens = new Set();
        this._pendingTokensByExt = new Map();

        this._listenerBound = false;
    }

    _bindSettingsListener() {
        if (this._listenerBound) return;
        this._listenerBound = true;
        eventBus.on(EVENTS.SETTINGS_CHANGED, (payload) => {
            if (!payload || payload.isExtensionOverride || !payload.key) return;
            const changedTopKey = payload.key;
            const matchedEntries = [];
            for (const [path, stack] of this._settingStacks.entries()) {
                const segments = path.split('.');
                if (segments[0] !== changedTopKey) continue;
                matchedEntries.push({
                    path,
                    segments,
                    stack,
                    nextBase: cloneValue(getBySegments(appContext.settings, segments))
                });
            }
            if (matchedEntries.length === 0) return;

            for (const item of matchedEntries) {
                this._settingBase.set(item.path, item.nextBase);
            }
            for (const item of matchedEntries) {
                const top = item.stack[item.stack.length - 1];
                if (top) {
                    setBySegments(appContext.settings, item.segments, top.value);
                }
            }
            this._emitSettingChanged(changedTopKey, appContext.settings[changedTopKey], payload.value);
        });
    }

    _nextToken() {
        this._seq += 1;
        return `ovr_${this._seq}`;
    }

    _trackPending(extensionId, token) {
        let set = this._pendingTokensByExt.get(extensionId);
        if (!set) {
            set = new Set();
            this._pendingTokensByExt.set(extensionId, set);
        }
        set.add(token);
    }

    _untrackPending(extensionId, token) {
        const set = this._pendingTokensByExt.get(extensionId);
        if (set) {
            set.delete(token);
            if (set.size === 0) this._pendingTokensByExt.delete(extensionId);
        }
    }

    // ==================== 設定覆寫 ====================

    overrideSetting(extensionId, path, value) {
        this._bindSettingsListener();
        const segments = parseSettingPath(path);
        const normalizedPath = segments.join('.');
        const settings = appContext.settings;
        if (!settings || typeof settings !== 'object') {
            throw new Error('[OverrideRegistry] 應用程式設定尚未初始化');
        }

        if (!this._settingBase.has(normalizedPath)) {
            this._settingBase.set(normalizedPath, cloneValue(getBySegments(settings, segments)));
        }

        const token = this._nextToken();
        let stack = this._settingStacks.get(normalizedPath);
        if (!stack) {
            stack = [];
            this._settingStacks.set(normalizedPath, stack);
        }
        stack.push({ token, extensionId, segments, value: cloneValue(value) });

        const topKey = segments[0];
        const oldTopVal = cloneValue(settings[topKey]);
        setBySegments(settings, segments, value);
        this._emitSettingChanged(topKey, settings[topKey], oldTopVal);

        let disposed = false;
        return () => {
            if (disposed) return;
            disposed = true;
            this._removeSettingToken(normalizedPath, token);
        };
    }

    overrideSettings(extensionId, entries) {
        if (!entries || typeof entries !== 'object') {
            throw new TypeError('[OverrideRegistry] 設定覆寫表必須為物件');
        }
        const disposers = [];
        try {
            for (const [key, val] of Object.entries(entries)) {
                disposers.push(this.overrideSetting(extensionId, key, val));
            }
        } catch (err) {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 回滾設定覆寫失敗:', cleanupErr);
                }
            }
            throw err;
        }
        return () => {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 清理設定覆寫失敗:', cleanupErr);
                }
            }
        };
    }

    _removeSettingToken(normalizedPath, token) {
        const stack = this._settingStacks.get(normalizedPath);
        if (!stack) return;
        const idx = stack.findIndex((item) => item.token === token);
        if (idx === -1) return;

        const [removed] = stack.splice(idx, 1);
        const settings = appContext.settings;
        const segments = removed.segments;
        const topKey = segments[0];
        const oldTopVal = settings ? cloneValue(settings[topKey]) : undefined;

        if (stack.length > 0) {
            const top = stack[stack.length - 1];
            if (settings) {
                setBySegments(settings, segments, top.value);
            }
        } else {
            const baseVal = this._settingBase.get(normalizedPath);
            if (settings) {
                setBySegments(settings, segments, baseVal);
            }
            this._settingStacks.delete(normalizedPath);
            this._settingBase.delete(normalizedPath);
        }

        if (settings) {
            this._emitSettingChanged(topKey, settings[topKey], oldTopVal);
        }
    }

    _emitSettingChanged(topKey, newVal, oldVal) {
        eventBus.emit(EVENTS.SETTINGS_CHANGED, {
            key: topKey,
            value: newVal,
            oldVal,
            allSettings: appContext.settings,
            isExtensionOverride: true
        });
        appContext.draw();
    }

    clearSettingOverrides(extensionId) {
        const tokensToRemove = [];
        for (const [path, stack] of this._settingStacks.entries()) {
            for (const item of stack) {
                if (item.extensionId === extensionId) {
                    tokensToRemove.push({ path, token: item.token });
                }
            }
        }
        for (const entry of tokensToRemove) {
            this._removeSettingToken(entry.path, entry.token);
        }
    }

    /**
     * 取得排除外掛覆寫後的純淨基準設定物件，供持久化儲存使用。
     * @param {Object} sourceSettings
     * @returns {Object}
     */
    getCleanSettings(sourceSettings) {
        if (!sourceSettings || typeof sourceSettings !== 'object') return sourceSettings;
        if (this._settingBase.size === 0) return sourceSettings;

        const clean = cloneValue(sourceSettings);
        for (const [path, baseVal] of this._settingBase.entries()) {
            setBySegments(clean, path.split('.'), baseVal);
        }
        return clean;
    }

    // ==================== 圖片素材覆寫 ====================

    listImageKeys() {
        const imgs = appContext.images;
        if (!imgs || typeof imgs !== 'object') return [];
        return Object.keys(imgs);
    }

    async overrideImage(extensionId, key, source) {
        validateAssetKey(key, '圖片');
        const token = this._nextToken();
        this._trackPending(extensionId, token);

        let resolved;
        try {
            resolved = await resolveImageSource(source);
        } catch (err) {
            this._cancelledTokens.delete(token);
            throw err;
        } finally {
            this._untrackPending(extensionId, token);
        }

        if (this._cancelledTokens.has(token)) {
            this._cancelledTokens.delete(token);
            if (resolved.objectUrl) URL.revokeObjectURL(resolved.objectUrl);
            return () => { };
        }

        const imgs = appContext.images;
        if (!imgs || typeof imgs !== 'object') {
            if (resolved.objectUrl) URL.revokeObjectURL(resolved.objectUrl);
            throw new Error('[OverrideRegistry] 圖片素材字典尚未初始化');
        }

        if (!this._imageBase.has(key)) {
            this._imageBase.set(key, imgs[key]);
        }

        let stack = this._imageStacks.get(key);
        if (!stack) {
            stack = [];
            this._imageStacks.set(key, stack);
        }
        stack.push({
            token,
            extensionId,
            image: resolved.image,
            objectUrl: resolved.objectUrl
        });

        imgs[key] = resolved.image;
        this._syncRendererImages(imgs);

        let disposed = false;
        return () => {
            if (disposed) return;
            disposed = true;
            this._removeImageToken(key, token);
        };
    }

    async overrideImages(extensionId, entries) {
        if (!entries || typeof entries !== 'object') {
            throw new TypeError('[OverrideRegistry] 圖片覆寫表必須為物件');
        }
        const pairs = Object.entries(entries);
        const disposers = [];
        try {
            for (const [key, source] of pairs) {
                disposers.push(await this.overrideImage(extensionId, key, source));
            }
        } catch (err) {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 回滾圖片覆寫失敗:', cleanupErr);
                }
            }
            throw err;
        }
        return () => {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 清理圖片覆寫失敗:', cleanupErr);
                }
            }
        };
    }

    _removeImageToken(key, token) {
        const stack = this._imageStacks.get(key);
        if (!stack) return;
        const idx = stack.findIndex((item) => item.token === token);
        if (idx === -1) return;

        const [removed] = stack.splice(idx, 1);
        if (removed.objectUrl) {
            URL.revokeObjectURL(removed.objectUrl);
        }

        const imgs = appContext.images;
        if (stack.length > 0) {
            const top = stack[stack.length - 1];
            if (imgs) imgs[key] = top.image;
        } else {
            const baseImg = this._imageBase.get(key);
            if (imgs) {
                if (baseImg === undefined) delete imgs[key];
                else imgs[key] = baseImg;
            }
            this._imageStacks.delete(key);
            this._imageBase.delete(key);
        }

        if (imgs) {
            this._syncRendererImages(imgs);
        }
    }

    /**
     * 切換 Skin 重新載入原生圖片後，更新基準並重新套用啟用中的外掛覆寫。
     * @param {Object} newImages
     */
    refreshImagesBase(newImages) {
        if (!newImages || typeof newImages !== 'object') return;
        for (const [key, stack] of this._imageStacks.entries()) {
            this._imageBase.set(key, newImages[key]);
            const top = stack[stack.length - 1];
            if (top) {
                newImages[key] = top.image;
            }
        }
    }

    _syncRendererImages(imgs) {
        const renderer = appContext.renderer;
        const visualEditorRenderer = appContext.get('getVisualEditorRenderer')?.();
        const previewRender = appContext.get('getPreviewRender')?.();

        if (renderer && typeof renderer.setImages === 'function') {
            renderer.setImages(imgs);
        }
        if (visualEditorRenderer && typeof visualEditorRenderer.setImages === 'function') {
            visualEditorRenderer.setImages(imgs);
        }
        if (previewRender && typeof previewRender.setImages === 'function') {
            previewRender.setImages(imgs);
        }
        appContext.draw();
    }

    clearImageOverrides(extensionId) {
        const tokensToRemove = [];
        for (const [key, stack] of this._imageStacks.entries()) {
            for (const item of stack) {
                if (item.extensionId === extensionId) {
                    tokensToRemove.push({ key, token: item.token });
                }
            }
        }
        for (const entry of tokensToRemove) {
            this._removeImageToken(entry.key, entry.token);
        }
    }

    // ==================== 音效素材覆寫 ====================

    listSoundKeys() {
        const audioManager = appContext.audioManager;
        if (!audioManager) return [];
        const keys = new Set([
            ...Object.keys(audioManager.soundFiles || {}),
            ...(audioManager.bufferMap ? audioManager.bufferMap.keys() : [])
        ]);
        return Array.from(keys);
    }

    async overrideSound(extensionId, key, source) {
        validateAssetKey(key, '音效');
        const audioManager = appContext.audioManager;
        if (!audioManager || typeof audioManager.decodeAudioSource !== 'function') {
            throw new Error('[OverrideRegistry] 音訊管理器尚未初始化');
        }

        const token = this._nextToken();
        this._trackPending(extensionId, token);

        let buffer;
        try {
            buffer = await audioManager.decodeAudioSource(source);
        } catch (err) {
            this._cancelledTokens.delete(token);
            throw err;
        } finally {
            this._untrackPending(extensionId, token);
        }

        if (this._cancelledTokens.has(token)) {
            this._cancelledTokens.delete(token);
            return () => { };
        }

        if (!this._soundBase.has(key)) {
            this._soundBase.set(key, audioManager.bufferMap.get(key));
        }

        let stack = this._soundStacks.get(key);
        if (!stack) {
            stack = [];
            this._soundStacks.set(key, stack);
        }
        stack.push({ token, extensionId, buffer });

        audioManager.bufferMap.set(key, buffer);

        let disposed = false;
        return () => {
            if (disposed) return;
            disposed = true;
            this._removeSoundToken(key, token);
        };
    }

    async overrideSounds(extensionId, entries) {
        if (!entries || typeof entries !== 'object') {
            throw new TypeError('[OverrideRegistry] 音效覆寫表必須為物件');
        }
        const pairs = Object.entries(entries);
        const disposers = [];
        try {
            for (const [key, source] of pairs) {
                disposers.push(await this.overrideSound(extensionId, key, source));
            }
        } catch (err) {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 回滾音效覆寫失敗:', cleanupErr);
                }
            }
            throw err;
        }
        return () => {
            while (disposers.length > 0) {
                try {
                    disposers.pop()();
                } catch (cleanupErr) {
                    console.warn('[OverrideRegistry] 清理音效覆寫失敗:', cleanupErr);
                }
            }
        };
    }

    _removeSoundToken(key, token) {
        const stack = this._soundStacks.get(key);
        if (!stack) return;
        const idx = stack.findIndex((item) => item.token === token);
        if (idx === -1) return;

        stack.splice(idx, 1);
        const audioManager = appContext.audioManager;
        if (!audioManager?.bufferMap) return;

        if (stack.length > 0) {
            const top = stack[stack.length - 1];
            audioManager.bufferMap.set(key, top.buffer);
        } else {
            const baseBuffer = this._soundBase.get(key);
            if (baseBuffer === undefined) {
                audioManager.bufferMap.delete(key);
            } else {
                audioManager.bufferMap.set(key, baseBuffer);
            }
            this._soundStacks.delete(key);
            this._soundBase.delete(key);
        }
    }

    /**
     * 預設音效載入完成時寫入基準音效，若目前已有外掛覆寫則僅更新基準而不覆蓋播放緩衝。
     * @param {string} key
     * @param {AudioBuffer} audioBuffer
     */
    applyDefaultSoundBuffer(key, audioBuffer) {
        const audioManager = appContext.audioManager;
        const stack = this._soundStacks.get(key);
        if (stack && stack.length > 0) {
            this._soundBase.set(key, audioBuffer);
            return;
        }
        if (audioManager?.bufferMap) {
            audioManager.bufferMap.set(key, audioBuffer);
        }
    }

    clearSoundOverrides(extensionId) {
        const tokensToRemove = [];
        for (const [key, stack] of this._soundStacks.entries()) {
            for (const item of stack) {
                if (item.extensionId === extensionId) {
                    tokensToRemove.push({ key, token: item.token });
                }
            }
        }
        for (const entry of tokensToRemove) {
            this._removeSoundToken(entry.key, entry.token);
        }
    }

    // ==================== 統一清理 ====================

    clearAllOverrides(extensionId) {
        const pending = this._pendingTokensByExt.get(extensionId);
        if (pending) {
            for (const token of pending) {
                this._cancelledTokens.add(token);
            }
            this._pendingTokensByExt.delete(extensionId);
        }
        this.clearSettingOverrides(extensionId);
        this.clearImageOverrides(extensionId);
        this.clearSoundOverrides(extensionId);
    }
}

export const extensionOverrideRegistry = new ExtensionOverrideRegistry();
