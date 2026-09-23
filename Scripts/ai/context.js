/**
 * AI 上下文處理模組
 * 負責擷取游標前後文字、組裝 Prompt 與判斷是否觸發補全
 */

/**
 * 取得游標前後的有限上下文
 * @param {string} text - 編輯器完整內容
 * @param {number} cursor - 游標位置
 * @param {number} [maxPrefix=3000] - 前置文字最大字元數
 * @param {number} [maxSuffix=1000] - 後置文字最大字元數
 * @returns {{ prefix: string, suffix: string }}
 */
export function getContext(text, cursor, maxPrefix = 3000, maxSuffix = 1000) {
    if (!text) {
        return { prefix: "", suffix: "" };
    }

    const safeCursor = Math.max(0, Math.min(text.length, cursor));
    const prefix = text.slice(0, safeCursor);
    const suffix = text.slice(safeCursor);

    return {
        prefix: prefix.slice(-maxPrefix),
        suffix: suffix.slice(0, maxSuffix),
    };
}

/**
 * 建構行內補全專用 Prompt
 * @param {string} prefix - 游標前文字
 * @param {string} suffix - 游標後文字
 * @returns {string} 提示詞
 */
export function buildPrompt(prefix, suffix) {
    return `
Complete the chart content at <CURSOR>.

<BEFORE>
${prefix}
</BEFORE>

<AFTER>
${suffix}
</AFTER>

Return only the text to insert at <CURSOR>.
`.trim();
}

/**
 * 判斷當前編輯器狀態是否應當發送 AI 補全請求
 * @param {string} text - 編輯器完整內容
 * @param {number} cursor - 游標位置
 * @param {number} selectionStart - 選取起點
 * @param {number} selectionEnd - 選取終點
 * @returns {boolean}
 */
export function shouldComplete(text, cursor, selectionStart, selectionEnd) {
    // 1. 若使用者正在選取文字範圍，不觸發
    if (selectionStart !== selectionEnd) {
        return false;
    }

    // 2. 若文件為空或游標前無實質內容，不觸發
    if (!text || cursor <= 0) {
        return false;
    }

    const before = text.slice(0, cursor);
    if (!before.trim()) {
        return false;
    }

    return true;
}

