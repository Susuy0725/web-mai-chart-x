/**
 * @file eventBus.js
 * @description 輕量級中央事件匯流排 (Pub/Sub)，用於模組間解耦通訊。
 */

class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();
    }

    /**
     * 註冊事件監聽器
     * @param {string} event 事件名稱
     * @param {Function} callback 回呼函式
     * @returns {Function} 取消訂閱函式
     */
    on(event, callback) {
        if (typeof callback !== 'function') return () => {};
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        return () => this.off(event, callback);
    }

    /**
     * 註冊單次事件監聽器
     * @param {string} event 事件名稱
     * @param {Function} callback 回呼函式
     * @returns {Function} 取消訂閱函式
     */
    once(event, callback) {
        if (typeof callback !== 'function') return () => {};
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            callback(...args);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * 移除事件監聽器
     * @param {string} event 事件名稱
     * @param {Function} [callback] 若未傳入則移除該事件的所有監聽器
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        if (!callback) {
            this.listeners.delete(event);
            return;
        }
        const set = this.listeners.get(event);
        set.delete(callback);
        if (set.size === 0) {
            this.listeners.delete(event);
        }
    }

    /**
     * 發布事件
     * @param {string} event 事件名稱
     * @param  {...any} args 傳遞給監聽器的參數
     */
    emit(event, ...args) {
        if (!this.listeners.has(event)) return;
        const set = this.listeners.get(event);
        // 使用拷貝避免監聽器在執行時變更 Set 造成迭代異常
        const callbacks = Array.from(set);
        for (const cb of callbacks) {
            try {
                cb(...args);
            } catch (err) {
                console.error(`[EventBus] Error in listener for event "${event}":`, err);
            }
        }
    }

    /**
     * 清空所有事件監聽器
     */
    clear() {
        this.listeners.clear();
    }
}

export const eventBus = new EventBus();

/**
 * 預定義的常用事件名稱常數，避免字串拼寫錯誤
 */
export const EVENTS = {
    // 設定相關
    SETTINGS_CHANGED: 'settings:changed', // { key, value, allSettings }
    SETTINGS_SAVED: 'settings:saved',     // { allSettings }

    // 畫布與渲染相關
    CANVAS_REDRAW: 'canvas:redraw',
    CANVAS_RESIZE: 'canvas:resize',       // { force: boolean }

    // 介面佈局相關
    LAYOUT_SPLIT_RATIO: 'layout:split-ratio', // { ratio: number }
    LAYOUT_RESET: 'layout:reset',

    // 背景相關
    BACKGROUND_VIDEO_TOGGLE: 'bg:video-toggle',
    BACKGROUND_BRIGHTNESS: 'bg:brightness', // { value: number|string }
    BACKGROUND_UPDATE: 'bg:update',

    // 專案與譜面相關
    PROJECT_LOADED: 'project:loaded',
    MAIDATA_CHANGED: 'maidata:changed',

    // 播放狀態相關
    PLAYBACK_STATE_CHANGED: 'playback:state-changed', // { isPlaying: boolean }
    PLAYBACK_SEEK: 'playback:seek',                   // { time: number }
};
