/**
 * @file commandRegistry.js
 * @description 統一指令註冊與派發中心，解耦選單、快捷鍵與擴充動作的直接綁定。
 */

class CommandRegistry {
    constructor() {
        /** @type {Map<string, { handler: Function, meta: Object }>} */
        this.commands = new Map();
    }

    /**
     * 註冊指令，回傳取消註冊函式以便模組卸載時清理
     * @param {string} id 具名稱空間的指令識別碼
     * @param {Function} handler 指令執行函式
     * @param {Object} [meta={}] 指令中繼資訊
     * @returns {Function} 取消註冊函式
     */
    register(id, handler, meta = {}) {
        if (!id || typeof id !== 'string') {
            throw new TypeError('[CommandRegistry] 指令識別碼必須為非空字串');
        }
        if (typeof handler !== 'function') {
            throw new TypeError(`[CommandRegistry] 指令 "${id}" 的處理函式必須為 function`);
        }
        if (this.commands.has(id)) {
            console.warn(`[CommandRegistry] 指令 "${id}" 已存在，略過重複註冊`);
            return () => {};
        }

        this.commands.set(id, {
            handler,
            meta: { ...meta }
        });

        return () => this.unregister(id);
    }

    /**
     * 取消註冊指令
     * @param {string} id
     * @returns {boolean}
     */
    unregister(id) {
        return this.commands.delete(id);
    }

    /**
     * 檢查指令是否已註冊
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return this.commands.has(id);
    }

    /**
     * 安全執行已註冊的指令並隔離例外
     * @param {string} id
     * @param  {...any} args
     * @returns {{ ok: boolean, result?: any, error?: Error }}
     */
    execute(id, ...args) {
        const entry = this.commands.get(id);
        if (!entry) {
            const error = new Error(`[CommandRegistry] 找不到指令 "${id}"`);
            console.warn(error.message);
            return { ok: false, error };
        }

        try {
            const result = entry.handler(...args);
            return { ok: true, result };
        } catch (error) {
            console.error(`[CommandRegistry] 執行指令 "${id}" 失敗:`, error);
            return { ok: false, error };
        }
    }

    /**
     * 列出目前所有已註冊指令的唯讀資訊
     * @returns {Array<{ id: string, meta: Object }>}
     */
    list() {
        const items = [];
        for (const [id, entry] of this.commands.entries()) {
            items.push({ id, meta: { ...entry.meta } });
        }
        return items;
    }
}

export const commandRegistry = new CommandRegistry();

