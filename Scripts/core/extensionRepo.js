/**
 * @file extensionRepo.js
 * @description WERP (WMCX Extension Repository Protocol) v1.0 客戶端核心實作：
 * 負責資料源管理、索引擷取與驗證、語意化版本比較、同源安全路徑解析與 SHA-256 完整性驗證。
 */

import { idbGet, idbSet } from '../indexDB.js';
import { t } from '../i18n.js';

const REPOS_STORAGE_KEY = '__extension_repos__';

const IDENTIFIER_REGEX = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const WERP_ERROR_CODES = Object.freeze({
    REGISTRY_FETCH_FAILED: 'REGISTRY_FETCH_FAILED',
    REGISTRY_INVALID_JSON: 'REGISTRY_INVALID_JSON',
    REGISTRY_UNSUPPORTED_VERSION: 'REGISTRY_UNSUPPORTED_VERSION',
    REGISTRY_INVALID_SCHEMA: 'REGISTRY_INVALID_SCHEMA',
    EXTENSION_DUPLICATE_ID: 'EXTENSION_DUPLICATE_ID',
    EXTENSION_INVALID_PATH: 'EXTENSION_INVALID_PATH',
    EXTENSION_DOWNLOAD_FAILED: 'EXTENSION_DOWNLOAD_FAILED',
    EXTENSION_HASH_MISMATCH: 'EXTENSION_HASH_MISMATCH',
    EXTENSION_INVALID_PACKAGE: 'EXTENSION_INVALID_PACKAGE',
    EXTENSION_INCOMPATIBLE: 'EXTENSION_INCOMPATIBLE',
    EXTENSION_PERMISSION_DENIED: 'EXTENSION_PERMISSION_DENIED'
});

export class WerpError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = 'WerpError';
        this.code = code;
    }
}

function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * 正規化並驗證儲存庫索引網址（必須為 HTTPS）
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeRepoUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_FETCH_FAILED, t('extensions.repoErrInvalidUrl'));
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch (_) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_FETCH_FAILED, t('extensions.repoErrInvalidUrl'));
    }
    if (parsed.protocol !== 'https:') {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_FETCH_FAILED, t('extensions.repoErrHttpsRequired'));
    }
    parsed.hash = '';
    return parsed.href;
}

/**
 * 解析 Semantic Versioning 2.0.0 字串
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number, prerelease: string[] } | null}
 */
export function parseSemver(version) {
    if (typeof version !== 'string') return null;
    const match = SEMVER_REGEX.exec(version.trim());
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : []
    };
}

/**
 * 依據 SemVer 2.0.0 規範比較兩個版本號
 * @param {string} a
 * @param {string} b
 * @returns {number} >0 表示 a 較新，<0 表示 b 較新，0 表示相等
 */
export function compareSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) {
        return String(a).localeCompare(String(b));
    }

    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    if (pa.patch !== pb.patch) return pa.patch - pb.patch;

    const aPre = pa.prerelease;
    const bPre = pb.prerelease;
    if (aPre.length === 0 && bPre.length === 0) return 0;
    if (aPre.length === 0) return 1;
    if (bPre.length === 0) return -1;

    const len = Math.max(aPre.length, bPre.length);
    for (let i = 0; i < len; i++) {
        if (i >= aPre.length) return -1;
        if (i >= bPre.length) return 1;
        const ia = aPre[i];
        const ib = bPre[i];
        if (ia === ib) continue;

        const aNum = /^\d+$/.test(ia);
        const bNum = /^\d+$/.test(ib);
        if (aNum && bNum) return Number(ia) - Number(ib);
        if (aNum) return -1;
        if (bNum) return 1;
        return ia < ib ? -1 : 1;
    }
    return 0;
}

/**
 * 依據 WERP 4.4 驗證並解析套件相對路徑
 * @param {string} filePath
 * @param {string} registryUrl
 * @returns {URL}
 */
export function resolvePackageUrl(filePath, registryUrl) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }
    const trimmed = filePath.trim();
    if (
        trimmed.includes('?') ||
        trimmed.includes('#') ||
        trimmed.includes('\\') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('//') ||
        /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }

    const segments = trimmed.split('/');
    if (segments.some((seg) => seg === '..')) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }

    if (!trimmed.toLowerCase().endsWith('.zip')) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }

    let resolved;
    let base;
    try {
        base = new URL(registryUrl);
        resolved = new URL(trimmed, base);
    } catch (_) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }

    if (resolved.protocol !== 'https:' || resolved.origin !== base.origin || resolved.search || resolved.hash) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_INVALID_PATH, t('extensions.repoErrInvalidPath'));
    }

    return resolved;
}

/**
 * 驗證 WERP v1.0 索引結構
 * @param {unknown} data
 * @param {string} registryUrl
 * @returns {Object}
 */
export function validateRegistryIndex(data, registryUrl) {
    if (!isPlainObject(data)) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
    }

    if (!Number.isInteger(data.schemaVersion) || data.schemaVersion !== 1) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_UNSUPPORTED_VERSION, t('extensions.repoErrUnsupportedVersion'));
    }

    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
    }

    if (typeof data.identifier !== 'string' || !IDENTIFIER_REGEX.test(data.identifier)) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
    }

    if (typeof data.description !== 'string') {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
    }

    if (!Array.isArray(data.extensions)) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
    }

    const seenIds = new Set();
    const validatedExtensions = [];

    for (const ext of data.extensions) {
        if (!isPlainObject(ext)) {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }
        if (typeof ext.id !== 'string' || !IDENTIFIER_REGEX.test(ext.id)) {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }
        if (seenIds.has(ext.id)) {
            throw new WerpError(WERP_ERROR_CODES.EXTENSION_DUPLICATE_ID, t('extensions.repoErrDuplicateId', { id: ext.id }));
        }
        seenIds.add(ext.id);

        if (typeof ext.name !== 'string' || ext.name.trim().length === 0) {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }
        if (typeof ext.version !== 'string' || !parseSemver(ext.version)) {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }
        if (typeof ext.description !== 'string') {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }
        if (typeof ext.sha256 !== 'string' || !SHA256_REGEX.test(ext.sha256.trim())) {
            throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_SCHEMA, t('extensions.repoErrInvalidSchema'));
        }

        // 驗證套件路徑合法性與同源規範
        resolvePackageUrl(ext.file, registryUrl);

        validatedExtensions.push({
            id: ext.id,
            name: ext.name.trim(),
            version: ext.version.trim(),
            description: ext.description,
            file: ext.file.trim(),
            sha256: ext.sha256.trim().toLowerCase()
        });
    }

    return {
        schemaVersion: 1,
        name: data.name.trim(),
        identifier: data.identifier,
        description: data.description,
        extensions: validatedExtensions
    };
}

/**
 * 取得並驗證遠端 WERP 索引
 * @param {string} rawUrl
 * @returns {Promise<{ url: string, index: Object }>}
 */
export async function fetchAndValidateRegistry(rawUrl) {
    const normalizedUrl = normalizeRepoUrl(rawUrl);

    let response;
    try {
        response = await fetch(normalizedUrl, { cache: 'no-store' });
    } catch (error) {
        throw new WerpError(
            WERP_ERROR_CODES.REGISTRY_FETCH_FAILED,
            t('extensions.repoErrFetchFailed', { detail: error?.message || 'Network error' })
        );
    }

    if (!response.ok) {
        throw new WerpError(
            WERP_ERROR_CODES.REGISTRY_FETCH_FAILED,
            t('extensions.repoErrFetchFailed', { detail: `HTTP ${response.status}` })
        );
    }

    let parsedJson;
    try {
        parsedJson = await response.json();
    } catch (_) {
        throw new WerpError(WERP_ERROR_CODES.REGISTRY_INVALID_JSON, t('extensions.repoErrInvalidJson'));
    }

    const index = validateRegistryIndex(parsedJson, normalizedUrl);
    return { url: normalizedUrl, index };
}

async function readRepoRecords() {
    try {
        const raw = await idbGet(REPOS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[ExtensionRepo] 讀取資料源清單失敗:', error);
        return [];
    }
}

async function writeRepoRecords(records) {
    await idbSet(REPOS_STORAGE_KEY, JSON.stringify(records));
}

/**
 * 列出所有已儲存的擴充程式資料源
 * @returns {Promise<Array<{ url: string, name: string, identifier: string, description: string, lastFetchedAt: number, cachedIndex: Object|null, lastError: { code: string, message: string, at: number } | null }>>}
 */
export async function listExtensionRepos() {
    return readRepoRecords();
}

/**
 * 新增或覆寫已驗證的資料源
 * @param {{ url: string, index: Object }} validated
 */
export async function addExtensionRepo(validated) {
    const records = await readRepoRecords();
    const now = Date.now();
    const nextRecord = {
        url: validated.url,
        name: validated.index.name,
        identifier: validated.index.identifier,
        description: validated.index.description,
        lastFetchedAt: now,
        cachedIndex: validated.index,
        lastError: null
    };

    const existingIdx = records.findIndex((item) => item.url === validated.url);
    if (existingIdx >= 0) {
        records[existingIdx] = nextRecord;
    } else {
        records.push(nextRecord);
    }
    await writeRepoRecords(records);
    return nextRecord;
}

/**
 * 移除資料源（依 WERP 5.4 不會自動解除安裝已安裝的擴充程式）
 * @param {string} url
 */
export async function removeExtensionRepo(url) {
    const records = await readRepoRecords();
    const filtered = records.filter((item) => item.url !== url);
    await writeRepoRecords(filtered);
}

/**
 * 重新取得單一資料源索引（失敗時保留上次成功快取並記錄錯誤狀態）
 * @param {string} url
 */
export async function refreshExtensionRepo(url) {
    const records = await readRepoRecords();
    const idx = records.findIndex((item) => item.url === url);
    if (idx < 0) return null;

    const current = records[idx];
    try {
        const { index } = await fetchAndValidateRegistry(current.url);
        const updated = {
            ...current,
            name: index.name,
            identifier: index.identifier,
            description: index.description,
            lastFetchedAt: Date.now(),
            cachedIndex: index,
            lastError: null
        };
        records[idx] = updated;
        await writeRepoRecords(records);
        return updated;
    } catch (error) {
        const errInfo = {
            code: error instanceof WerpError ? error.code : WERP_ERROR_CODES.REGISTRY_FETCH_FAILED,
            message: error?.message || t('extensions.repoErrFetchFailed', { detail: 'Unknown error' }),
            at: Date.now()
        };
        const updated = {
            ...current,
            lastError: errInfo
        };
        records[idx] = updated;
        await writeRepoRecords(records);
        return updated;
    }
}

/**
 * 獨立重新整理全部資料源，單一失敗不中斷其他來源
 */
export async function refreshAllExtensionRepos() {
    const records = await readRepoRecords();
    if (records.length === 0) return [];

    const results = await Promise.allSettled(
        records.map((repo) => fetchAndValidateRegistry(repo.url))
    );

    const now = Date.now();
    const nextRecords = records.map((repo, i) => {
        const res = results[i];
        if (res.status === 'fulfilled') {
            const { index } = res.value;
            return {
                ...repo,
                name: index.name,
                identifier: index.identifier,
                description: index.description,
                lastFetchedAt: now,
                cachedIndex: index,
                lastError: null
            };
        }
        const err = res.reason;
        return {
            ...repo,
            lastError: {
                code: err instanceof WerpError ? err.code : WERP_ERROR_CODES.REGISTRY_FETCH_FAILED,
                message: err?.message || t('extensions.repoErrFetchFailed', { detail: 'Unknown error' }),
                at: now
            }
        };
    });

    await writeRepoRecords(nextRecords);
    return nextRecords;
}

async function computeSha256Hex(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 下載並驗證擴充程式 ZIP 套件的 SHA-256
 * @param {Object} extEntry
 * @param {string} registryUrl
 * @returns {Promise<Blob>}
 */
export async function downloadAndVerifyPackage(extEntry, registryUrl) {
    const packageUrl = resolvePackageUrl(extEntry.file, registryUrl);

    let response;
    try {
        response = await fetch(packageUrl.href, { cache: 'no-store' });
    } catch (error) {
        throw new WerpError(
            WERP_ERROR_CODES.EXTENSION_DOWNLOAD_FAILED,
            t('extensions.repoErrDownloadFailed', { detail: error?.message || 'Network error' })
        );
    }

    if (!response.ok) {
        throw new WerpError(
            WERP_ERROR_CODES.EXTENSION_DOWNLOAD_FAILED,
            t('extensions.repoErrDownloadFailed', { detail: `HTTP ${response.status}` })
        );
    }

    const buffer = await response.arrayBuffer();
    const actualHash = await computeSha256Hex(buffer);
    if (actualHash !== extEntry.sha256.toLowerCase()) {
        throw new WerpError(WERP_ERROR_CODES.EXTENSION_HASH_MISMATCH, t('extensions.repoErrHashMismatch'));
    }

    return new Blob([buffer], { type: 'application/zip' });
}

/**
 * 評估來源套件相對於本機已安裝狀態（遵守 WERP 7.1 與 7.2 來源隔離規則）
 * @param {Object} extEntry
 * @param {string} registryUrl
 * @param {Map<string, { version: string, sourceRepoUrl: string|null, packageSha256: string|null }>} installedMap
 * @returns {'not_installed'|'installed_other_source'|'update_available'|'hash_changed'|'up_to_date'}
 */
export function getRepoExtensionStatus(extEntry, registryUrl, installedMap) {
    const installed = installedMap.get(extEntry.id);
    if (!installed) {
        return 'not_installed';
    }
    if (installed.sourceRepoUrl !== registryUrl) {
        return 'installed_other_source';
    }

    const cmp = compareSemver(extEntry.version, installed.version);
    if (cmp > 0) {
        return 'update_available';
    }
    if (cmp === 0 && installed.packageSha256 && installed.packageSha256.toLowerCase() !== extEntry.sha256.toLowerCase()) {
        return 'hash_changed';
    }
    return 'up_to_date';
}
