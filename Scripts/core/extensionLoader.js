/**
 * @file extensionLoader.js
 * @description 解析、驗證並動態載入使用者匯入的第三方外掛壓縮包。
 */

import { ensureJSZip, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { extensionManager } from './extensionManager.js';
import {
    listStoredExtensions,
    saveStoredExtension,
    setStoredExtensionEnabled,
    removeStoredExtension,
    clearExtensionData
} from './extensionStorage.js';
import { clearExtensionSettings } from '../features/extensionPopover.js';

/**
 * 支援根目錄或單層子資料夾尋找檔案，避免使用者直接壓縮資料夾時找不到 manifest.json
 * @param {Object} zip
 * @param {string} relativePath
 */
function findZipEntry(zip, relativePath) {
    const clean = relativePath.replace(/^\.?\//, '');
    if (zip.files[clean] && !zip.files[clean].dir) {
        return { file: zip.files[clean], prefix: '' };
    }

    const candidates = Object.keys(zip.files).filter((name) => {
        if (zip.files[name].dir) return false;
        return name.endsWith(`/${clean}`);
    });

    if (candidates.length === 1) {
        const fullName = candidates[0];
        const prefix = fullName.slice(0, fullName.length - clean.length);
        return { file: zip.files[fullName], prefix };
    }

    return null;
}

/**
 * 解析使用者選擇的 .zip 外掛檔案
 * @param {File|Blob} file
 * @returns {Promise<{ manifest: Object, entryCode: string }>}
 */
export async function parseExtensionZip(file) {
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(file);

    const manifestMatch = findZipEntry(zip, 'manifest.json');
    if (!manifestMatch) {
        throw new Error(t('extensions.errMissingManifest'));
    }

    const manifestRaw = await manifestMatch.file.async('string');
    let manifest;
    try {
        manifest = JSON.parse(manifestRaw);
    } catch (_) {
        throw new Error(t('extensions.errInvalidManifestJson'));
    }

    if (!manifest.id || !manifest.name || !manifest.version) {
        throw new Error(t('extensions.errMissingRequiredFields'));
    }

    const entryRel = String(manifest.entry || 'index.js').replace(/^\.?\//, '');
    const entryFull = `${manifestMatch.prefix}${entryRel}`;
    const entryFile = zip.files[entryFull];
    if (!entryFile || entryFile.dir) {
        throw new Error(t('extensions.errMissingEntry', { entry: entryRel }));
    }

    const entryCode = await entryFile.async('string');
    return {
        manifest: {
            id: String(manifest.id),
            name: String(manifest.name),
            version: String(manifest.version),
            description: manifest.description ? String(manifest.description) : '',
            author: manifest.author ? String(manifest.author) : '',
            entry: entryRel,
            permissions: Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [],
            runtime: manifest.runtime || 'trusted'
        },
        entryCode
    };
}

/**
 * 以 Blob URL 動態載入外掛進入點模組並註冊至 extensionManager
 * @param {{ manifest: Object, entryCode: string }} pkg
 * @param {boolean} [autoActivate=true]
 */
export async function registerStoredPackage(pkg, autoActivate = true) {
    const blob = new Blob([pkg.entryCode], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    let mod;
    try {
        mod = await import(/* @vite-ignore */ blobUrl);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }

    const factory = typeof mod?.default === 'function'
        ? mod.default
        : (typeof mod?.activate === 'function' ? mod.activate : null);

    if (!factory) {
        throw new Error(t('extensions.errMissingActivate', { id: pkg.manifest.id }));
    }

    // 若之前已註冊舊版，先移除再重新註冊
    if (extensionManager.extensions.has(pkg.manifest.id)) {
        extensionManager.unregister(pkg.manifest.id);
    }

    extensionManager.register(pkg.manifest, factory, { autoActivate });
}

/**
 * 儲存並啟用解析後的外掛封裝
 * @param {{ manifest: Object, entryCode: string }} pkg
 */
export async function installExtensionPackage(pkg) {
    await saveStoredExtension(pkg, true);
    await registerStoredPackage(pkg, true);
}

/**
 * 切換已安裝外掛的啟用狀態並同步寫回 IndexedDB
 * @param {string} id
 * @param {boolean} enabled
 */
export async function toggleInstalledExtension(id, enabled) {
    await setStoredExtensionEnabled(id, enabled);
    if (enabled) {
        extensionManager.activate(id);
    } else {
        extensionManager.deactivate(id);
    }
}

/**
 * 停用並移除已安裝外掛，同時清除其設定與隔離儲存資料
 * @param {string} id
 */
export async function uninstallExtension(id) {
    extensionManager.unregister(id);
    await removeStoredExtension(id);
    clearExtensionSettings(id);
    clearExtensionData(id);
}

const ACTIVATING_GUARD_KEY = 'wmcx_ext_activating';

function isSafeModeEnabled() {
    if (typeof window === 'undefined' || !window.location) return false;
    const params = new URLSearchParams(window.location.search);
    const value = params.get('safeMode');
    return value === '1' || value === 'true';
}

/**
 * 於應用程式啟動時從 IndexedDB 還原所有已安裝的外掛
 */
export async function loadStoredExtensions() {
    const storedList = await listStoredExtensions();
    const safeMode = isSafeModeEnabled();

    let crashedId = null;
    try {
        crashedId = sessionStorage.getItem(ACTIVATING_GUARD_KEY);
        if (crashedId) {
            sessionStorage.removeItem(ACTIVATING_GUARD_KEY);
        }
    } catch (error) {
        console.warn('[ExtensionLoader] 無法存取 sessionStorage 崩潰防護狀態:', error);
    }

    if (crashedId) {
        try {
            await setStoredExtensionEnabled(crashedId, false);
        } catch (error) {
            console.error(`[ExtensionLoader] 自動停用異常擴充程式 "${crashedId}" 失敗:`, error);
        }
        const crashedPkg = storedList.find((item) => item.id === crashedId);
        if (crashedPkg) {
            crashedPkg.enabled = false;
        }
        simpleToast({
            content: t('extensions.crashAutoDisabled', { id: crashedId }),
            type: 'warning',
            timeout: 5000
        });
    }

    for (const pkg of storedList) {
        const shouldAutoActivate = Boolean(pkg.enabled) && !safeMode;
        if (shouldAutoActivate) {
            try {
                sessionStorage.setItem(ACTIVATING_GUARD_KEY, pkg.id);
            } catch (error) {
                console.warn('[ExtensionLoader] 無法寫入啟動防護標記:', error);
            }
        }
        try {
            await registerStoredPackage(pkg, shouldAutoActivate);
        } catch (error) {
            console.warn(`[ExtensionLoader] 還原外掛 "${pkg.id}" 失敗，將自動移除無法辨識的殘留外掛:`, error);
            try {
                await removeStoredExtension(pkg.id);
                clearExtensionSettings(pkg.id);
                clearExtensionData(pkg.id);
            } catch (cleanupError) {
                console.error(`[ExtensionLoader] 自動移除無效外掛 "${pkg.id}" 失敗:`, cleanupError);
            }
        } finally {
            if (shouldAutoActivate) {
                try {
                    sessionStorage.removeItem(ACTIVATING_GUARD_KEY);
                } catch (error) {
                    console.warn('[ExtensionLoader] 無法清除啟動防護標記:', error);
                }
            }
        }
    }
}

