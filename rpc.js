import { t } from './Scripts/i18n.js';

let rpcStartTime = Date.now();

const diffMap = {
    "1": "EASY",
    "2": "BASIC",
    "3": "ADVANCED",
    "4": "EXPERT",
    "5": "MASTER",
    "6": "Re:MASTER",
    "7": "ORIGINAL"
};

/**
 * 傳送當前編輯狀態給 Discord RPC (透過 Electron preload 暴露的 API)
 * @param {Object} maidata 當前編輯的歌曲資訊
 * @param {string|number} nowDifficulty 當前編輯的難度
 */
export function updateDiscordRPC(maidata, nowDifficulty) {
    // 確保有被 Electron 包覆，並且有掛載 updateDiscordRPC
    if (window.electronAPI && window.electronAPI.updateDiscordRPC) {
        let details = t('rpc.idleDetails');
        let state = t('rpc.idleState');

        if (maidata && maidata.title) {
            details = t('rpc.editingDetails', { title: maidata.title });
            const diffName = diffMap[String(nowDifficulty)] || t('rpc.unknownDiff');
            state = t('rpc.difficultyState', { diff: diffName });
        }

        window.electronAPI.updateDiscordRPC({
            details: details,
            state: state,
            startTime: rpcStartTime
        });
    }
}
