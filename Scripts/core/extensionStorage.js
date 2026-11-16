/**
 * @file extensionStorage.js
 * @description 使用 IndexedDB 儲存與管理使用者手動安裝的第三方外掛套件。
 */

import { idbGet, idbSet, idbDelete } from '../indexDB.js';

const INDEX_KEY = '__extensions_index__';
const PACKAGE_PREFIX = 'ext_pkg_';

async function readIndex() {
    try {
        const raw = await idbGet(INDEX_KEY);
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[ExtensionStorage] 讀取外掛索引失敗:', error);
        return [];
    }
}

async function writeIndex(indexList) {
    await idbSet(INDEX_KEY, JSON.stringify(indexList));
}

/**
 * 列出所有已儲存的外掛索引與封裝內容
 * @returns {Promise<Array<{ id: string, enabled: boolean, installedAt: number, manifest: Object, entryCode: string }>>}
 */
export async function listStoredExtensions() {
    const indexList = await readIndex();
    const results = [];
    const validIndexList = [];
    let indexDirty = false;

    for (const meta of indexList) {
        if (!meta || !meta.id) {
            indexDirty = true;
            continue;
        }
        const rawPkg = await idbGet(`${PACKAGE_PREFIX}${meta.id}`);
        if (!rawPkg) {
            indexDirty = true;
            console.warn(`[ExtensionStorage] 外掛 "${meta.id}" 封裝資料遺失，已自動清理索引`);
            continue;
        }
        try {
            const pkg = typeof rawPkg === 'string' ? JSON.parse(rawPkg) : rawPkg;
            if (pkg && pkg.manifest && typeof pkg.entryCode === 'string') {
                validIndexList.push(meta);
                results.push({
                    id: meta.id,
                    enabled: meta.enabled !== false,
                    installedAt: meta.installedAt || pkg.installedAt || Date.now(),
                    manifest: pkg.manifest,
                    entryCode: pkg.entryCode
                });
            } else {
                indexDirty = true;
                await idbDelete(`${PACKAGE_PREFIX}${meta.id}`);
                console.warn(`[ExtensionStorage] 外掛 "${meta.id}" 封裝結構無效，已自動移除`);
            }
        } catch (error) {
            indexDirty = true;
            await idbDelete(`${PACKAGE_PREFIX}${meta.id}`);
            console.warn(`[ExtensionStorage] 解析外掛 "${meta.id}" 失敗，已自動移除:`, error);
        }
    }

    if (indexDirty) {
        await writeIndex(validIndexList);
    }

    return results;
}

/**
 * 儲存或更新外掛封裝至 IndexedDB
 * @param {Object} pkg
 * @param {Object} pkg.manifest
 * @param {string} pkg.entryCode
 * @param {boolean} [enabled=true]
 */
export async function saveStoredExtension(pkg, enabled = true) {
    const id = pkg?.manifest?.id;
    if (!id) {
        throw new TypeError('[ExtensionStorage] 外掛封裝缺少 manifest.id');
    }

    const now = Date.now();
    await idbSet(`${PACKAGE_PREFIX}${id}`, JSON.stringify({
        manifest: pkg.manifest,
        entryCode: pkg.entryCode,
        installedAt: now
    }));

    const indexList = await readIndex();
    const existingIdx = indexList.findIndex((item) => item.id === id);
    const nextMeta = { id, enabled: Boolean(enabled), installedAt: now };
    if (existingIdx >= 0) {
        indexList[existingIdx] = nextMeta;
    } else {
        indexList.push(nextMeta);
    }
    await writeIndex(indexList);
}

/**
 * 更新指定外掛的啟用狀態
 * @param {string} id
 * @param {boolean} enabled
 */
export async function setStoredExtensionEnabled(id, enabled) {
    const indexList = await readIndex();
    const item = indexList.find((x) => x.id === id);
    if (!item) return false;
    item.enabled = Boolean(enabled);
    await writeIndex(indexList);
    return true;
}

/**
 * 從 IndexedDB 移除指定外掛
 * @param {string} id
 */
export async function removeStoredExtension(id) {
    await idbDelete(`${PACKAGE_PREFIX}${id}`);
    const indexList = await readIndex();
    const filtered = indexList.filter((item) => item.id !== id);
    await writeIndex(filtered);
}

const DATA_STORAGE_PREFIX = 'wmcx_ext_data_';
const memoryFallbackDataStore = new Map();

function readExtensionDataMap(extId) {
    const storageKey = `${DATA_STORAGE_PREFIX}${extId}`;
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    memoryFallbackDataStore.set(storageKey, parsed);
                    return parsed;
                }
            }
        }
    } catch (error) {
        console.warn(`[ExtensionStorage] 讀取擴充 "${extId}" 儲存資料失敗:`, error);
    }
    const cached = memoryFallbackDataStore.get(storageKey);
    return cached ? { ...cached } : {};
}

function writeExtensionDataMap(extId, dataMap) {
    const storageKey = `${DATA_STORAGE_PREFIX}${extId}`;
    const snapshot = { ...dataMap };
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(snapshot));
        }
        memoryFallbackDataStore.set(storageKey, snapshot);
        return true;
    } catch (error) {
        console.warn(`[ExtensionStorage] 寫入擴充 "${extId}" 儲存資料失敗:`, error);
        return false;
    }
}

/**
 * 讀取指定擴充程式的隔離儲存鍵值
 * @param {string} extId
 * @param {string} key
 * @param {*} [defaultValue=null]
 * @returns {*}
 */
export function getExtensionData(extId, key, defaultValue = null) {
    if (!extId || typeof key !== 'string' || !key) return defaultValue;
    const dataMap = readExtensionDataMap(extId);
    return Object.prototype.hasOwnProperty.call(dataMap, key) ? dataMap[key] : defaultValue;
}

/**
 * 寫入指定擴充程式的隔離儲存鍵值
 * @param {string} extId
 * @param {string} key
 * @param {*} value
 * @returns {boolean}
 */
export function setExtensionData(extId, key, value) {
    if (!extId || typeof key !== 'string' || !key) return false;
    const dataMap = readExtensionDataMap(extId);
    if (value === undefined) {
        delete dataMap[key];
    } else {
        dataMap[key] = value;
    }
    return writeExtensionDataMap(extId, dataMap);
}

/**
 * 移除指定擴充程式的單一隔離儲存鍵值
 * @param {string} extId
 * @param {string} key
 * @returns {boolean}
 */
export function removeExtensionData(extId, key) {
    if (!extId || typeof key !== 'string' || !key) return false;
    const dataMap = readExtensionDataMap(extId);
    if (!Object.prototype.hasOwnProperty.call(dataMap, key)) return true;
    delete dataMap[key];
    return writeExtensionDataMap(extId, dataMap);
}

/**
 * 清除指定擴充程式的所有隔離儲存資料
 * @param {string} extId
 */
export function clearExtensionData(extId) {
    if (!extId) return;
    const storageKey = `${DATA_STORAGE_PREFIX}${extId}`;
    memoryFallbackDataStore.delete(storageKey);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(storageKey);
        }
    } catch (error) {
        console.warn(`[ExtensionStorage] 清除擴充 "${extId}" 儲存資料失敗:`, error);
    }
}

/**
 * 列出指定擴充程式所有已儲存的鍵名
 * @param {string} extId
 * @returns {string[]}
 */
export function listExtensionDataKeys(extId) {
    if (!extId) return [];
    return Object.keys(readExtensionDataMap(extId));
}

