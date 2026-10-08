/**
 * @file appContext.js
 * @description 統一的應用程式上下文與服務容器 (Application Context & Service Container)
 * 提供全域核心實例的註冊、讀取與依賴解耦，消滅跨層參數傳遞 (Props Drilling)。
 */

import { eventBus, EVENTS } from './eventBus.js';

class AppContext {
    constructor() {
        this.eventBus = eventBus;
        this.EVENTS = EVENTS;
        this.services = new Map();
        this.state = {
            settings: {},
            maidata: {},
            currentProjectId: null,
            images: null,
            isInitComplete: false,
            isImagesLoaded: false,
        };
    }

    /**
     * 註冊服務或實例
     * @param {string} name 服務名稱
     * @param {any} instance 實例或函式
     */
    register(name, instance) {
        this.services.set(name, instance);
    }

    /**
     * 取得服務或實例
     * @param {string} name 服務名稱
     * @returns {any}
     */
    get(name) {
        return this.services.get(name);
    }

    /**
     * 檢查服務是否存在
     * @param {string} name 
     * @returns {boolean}
     */
    has(name) {
        return this.services.has(name);
    }

    // --- 核心實例捷徑 ---

    get settings() {
        return this.state.settings;
    }

    set settings(newSettings) {
        this.state.settings = newSettings || {};
    }

    /**
     * 讀取特定設定
     * @param {string} key 
     * @param {any} [defaultValue] 
     * @returns {any}
     */
    getSetting(key, defaultValue = undefined) {
        if (!this.state.settings) return defaultValue;
        return this.state.settings[key] !== undefined ? this.state.settings[key] : defaultValue;
    }

    /**
     * 更新特定設定並派發變更事件
     * @param {string} key 
     * @param {any} value 
     * @param {boolean} [silent=false] 是否靜默更新 (不觸發事件)
     */
    setSetting(key, value, silent = false) {
        if (!this.state.settings) this.state.settings = {};
        const oldVal = this.state.settings[key];
        this.state.settings[key] = value;

        if (!silent) {
            eventBus.emit(EVENTS.SETTINGS_CHANGED, {
                key,
                value,
                oldVal,
                allSettings: this.state.settings
            });
        }
    }

    get renderer() {
        const getter = this.services.get('getRenderer');
        if (typeof getter === 'function') return getter();
        return this.services.get('renderer');
    }

    get audioManager() {
        return this.services.get('audioManager');
    }

    get maidata() {
        const getter = this.services.get('getMaidata');
        if (typeof getter === 'function') return getter();
        return this.state.maidata;
    }

    set maidata(val) {
        this.state.maidata = val || {};
        const setter = this.services.get('setMaidata');
        if (typeof setter === 'function') setter(val);
    }

    get currentProjectId() {
        const getter = this.services.get('getCurrentProjectId');
        if (typeof getter === 'function') return getter();
        return this.state.currentProjectId;
    }

    set currentProjectId(val) {
        this.state.currentProjectId = val;
        const setter = this.services.get('setCurrentProjectId');
        if (typeof setter === 'function') setter(val);
    }

    get playbackEngine() {
        return this.services.get('playbackEngine');
    }

    get isImagesLoaded() {
        const getter = this.services.get('getIsImagesLoaded');
        if (typeof getter === 'function') return getter();
        return this.state.isImagesLoaded;
    }

    set isImagesLoaded(val) {
        this.state.isImagesLoaded = !!val;
    }

    get images() {
        const getter = this.services.get('images');
        if (typeof getter === 'function') return getter();
        return this.state.images;
    }

    set images(val) {
        this.state.images = val;
    }

    setState(key, value) {
        this.state[key] = value;
    }

    get isInitComplete() {
        const getter = this.services.get('getIsInitComplete');
        if (typeof getter === 'function') return getter();
        return this.state.isInitComplete;
    }

    set isInitComplete(val) {
        this.state.isInitComplete = !!val;
    }

    /**
     * 安全觸發畫布重繪
     */
    draw() {
        const fn = this.services.get('draw');
        if (typeof fn === 'function') {
            fn();
        } else {
            eventBus.emit(EVENTS.CANVAS_REDRAW);
        }
    }

    /**
     * 安全觸發視窗尺寸重算
     * @param {boolean} [force=false]
     */
    resize(force = false) {
        const fn = this.services.get('resize');
        if (typeof fn === 'function') {
            fn(force);
        } else {
            eventBus.emit(EVENTS.CANVAS_RESIZE, { force });
        }
    }

    /**
     * 觸發設定保存
     */
    saveSettings() {
        const fn = this.services.get('saveSettingsDebounce');
        if (typeof fn === 'function') {
            fn();
        } else {
            eventBus.emit(EVENTS.SETTINGS_SAVED, { allSettings: this.state.settings });
        }
    }
}

export const appContext = new AppContext();
