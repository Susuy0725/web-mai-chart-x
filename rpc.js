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
        let details = '正在對著白紙發呆';
        let state = '閒置中';

        if (maidata && maidata.title) {
            details = '正在編輯: ' + maidata.title;
            const diffName = diffMap[String(nowDifficulty)] || '未知難度';
            state = '難度: ' + diffName;
        }

        window.electronAPI.updateDiscordRPC({
            details: details,
            state: state,
            startTime: rpcStartTime
        });
    }
}
