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
    for (const meta of indexList) {
        if (!meta || !meta.id) continue;
        const rawPkg = await idbGet(`${PACKAGE_PREFIX}${meta.id}`);
        if (!rawPkg) continue;
        try {
            const pkg = typeof rawPkg === 'string' ? JSON.parse(rawPkg) : rawPkg;
            if (pkg && pkg.manifest && typeof pkg.entryCode === 'string') {
                results.push({
                    id: meta.id,
                    enabled: meta.enabled !== false,
                    installedAt: meta.installedAt || pkg.installedAt || Date.now(),
                    manifest: pkg.manifest,
                    entryCode: pkg.entryCode
                });
            }
        } catch (error) {
            console.warn(`[ExtensionStorage] 解析外掛 "${meta.id}" 失敗:`, error);
        }
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

