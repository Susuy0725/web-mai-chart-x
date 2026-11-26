/**
 * legalVersionManager.js
 *
 * 管理服務條款與隱私權政策的版本常數，並透過 localStorage 追蹤使用者的同意紀錄。
 */

export const ACCEPT_LOG_KEY = 'wmcx_accept_log';
export const LEGACY_FIRST_RUN_KEY = 'wmcx_first_run_completed';

/**
 * 現行生效的法規文件版本
 * 修改服務條款或隱私權政策時，請同步更新對應版本字串以觸發使用者確認提示。
 */
export const CURRENT_LEGAL_VERSIONS = Object.freeze({
    terms: '2026-11-16',
    privacy: '2026-11-16'
});

/**
 * 從 localStorage 讀取同意紀錄歷程
 * @returns {Array<{termsVersion: string, privacyVersion: string, acceptedAt: string}>}
 */
export function getAcceptLog() {
    try {
        const raw = localStorage.getItem(ACCEPT_LOG_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('[legalVersionManager] 讀取同意紀錄失敗:', err);
        return [];
    }
}

/**
 * 取得最新一筆同意紀錄
 * @returns {{termsVersion: string, privacyVersion: string, acceptedAt: string}|null}
 */
export function getLatestAcceptRecord() {
    const log = getAcceptLog();
    if (log.length === 0) return null;
    const latest = log[log.length - 1];
    return (latest && typeof latest === 'object') ? latest : null;
}

/**
 * 判斷是否曾有任何同意紀錄或舊版初次啟動完成標記
 * 用於區分全新使用者與既有使用者
 * @returns {boolean}
 */
export function hasAnyAcceptRecord() {
    if (getAcceptLog().length > 0) return true;
    try {
        return localStorage.getItem(LEGACY_FIRST_RUN_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * 附加一筆現行版本的同意紀錄至 localStorage
 * @param {Object} [versions]
 * @param {string} [versions.termsVersion]
 * @param {string} [versions.privacyVersion]
 * @returns {boolean}
 */
export function appendAcceptLog({
    termsVersion = CURRENT_LEGAL_VERSIONS.terms,
    privacyVersion = CURRENT_LEGAL_VERSIONS.privacy
} = {}) {
    try {
        const log = getAcceptLog();
        log.push({
            termsVersion,
            privacyVersion,
            acceptedAt: new Date().toISOString()
        });
        localStorage.setItem(ACCEPT_LOG_KEY, JSON.stringify(log));
        return true;
    } catch (err) {
        console.error('[legalVersionManager] 寫入同意紀錄失敗:', err);
        return false;
    }
}

/**
 * 清除所有同意紀錄與舊版初次啟動旗標
 * @returns {boolean}
 */
export function clearAcceptLog() {
    try {
        localStorage.removeItem(ACCEPT_LOG_KEY);
        localStorage.removeItem(LEGACY_FIRST_RUN_KEY);
        return true;
    } catch (err) {
        console.warn('[legalVersionManager] 清除同意紀錄失敗:', err);
        return false;
    }
}

/**
 * 檢查現行版本與最新同意紀錄之間的差異
 * @returns {{termsUpdated: boolean, privacyUpdated: boolean, hasUpdates: boolean, currentVersions: {terms: string, privacy: string}, lastAccepted: {termsVersion: string, privacyVersion: string, acceptedAt: string}|null}}
 */
export function getOutdatedLegalDocs() {
    const latest = getLatestAcceptRecord();
    const termsUpdated = !latest || latest.termsVersion !== CURRENT_LEGAL_VERSIONS.terms;
    const privacyUpdated = !latest || latest.privacyVersion !== CURRENT_LEGAL_VERSIONS.privacy;
    return {
        termsUpdated,
        privacyUpdated,
        hasUpdates: termsUpdated || privacyUpdated,
        currentVersions: CURRENT_LEGAL_VERSIONS,
        lastAccepted: latest
    };
}

/**
 * 檢查現行版本的服務條款與隱私權政策是否皆已被同意
 * @returns {boolean}
 */
export function isCurrentLegalAccepted() {
    return !getOutdatedLegalDocs().hasUpdates;
}
