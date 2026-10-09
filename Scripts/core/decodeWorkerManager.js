/**
 * decodeWorkerManager.js
 * 管理 Simai Web Worker 背景解碼線程與主線程之間的通訊、請求隊列與資料水合 (Hydration)
 */

import { PathRecorder } from './chartGeometry.js';
import { simaiDecode, clearIncrementalCache as clearLocalIncrementalCache } from '../decode.js';

/**
 * 將從 Web Worker 傳回的純物件反序列化，恢復 PathRecorder 的原型方法
 * 確保 renderer 與 helper 能無縫呼叫 getPointAt(), endTangent() 等幾何方法
 * @param {Object} result 解碼產生的譜面資料
 * @returns {Object} 原型已恢復的譜面資料
 */
export function hydrateDecodedResult(result) {
    if (!result || !result.notes || !Array.isArray(result.notes)) return result;

    const notes = result.notes;
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n && n.type === 'slide') {
            if (n.path && !(n.path instanceof PathRecorder)) {
                Object.setPrototypeOf(n.path, PathRecorder.prototype);
            }
            if (n.wPaths) {
                if (n.wPaths.w1 && !(n.wPaths.w1 instanceof PathRecorder)) {
                    Object.setPrototypeOf(n.wPaths.w1, PathRecorder.prototype);
                }
                if (n.wPaths.w2 && !(n.wPaths.w2 instanceof PathRecorder)) {
                    Object.setPrototypeOf(n.wPaths.w2, PathRecorder.prototype);
                }
            }
        }
    }
    return result;
}

class DecodeWorkerManager {
    constructor() {
        this.worker = null;
        this.isSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';
        this.currentRequestId = 0;
        this.latestRequestedId = 0;
        this.pendingRequests = new Map();
        this.initWorker();
    }

    initWorker() {
        if (!this.isSupported) return;

        try {
            // 使用標準 ES Module Worker
            const workerUrl = new URL('../workers/decodeWorker.js', import.meta.url);
            this.worker = new Worker(workerUrl, { type: 'module' });

            this.worker.onmessage = (e) => {
                const { id, success, result, error } = e.data || {};
                const req = this.pendingRequests.get(id);
                if (!req) return;

                this.pendingRequests.delete(id);

                if (!success) {
                    req.reject(new Error(error || 'Worker decode failed'));
                    return;
                }

                // 檢查是否為過期請求 (若已有更新的解析請求且設定為丟棄過期結果)
                const isStale = id < this.latestRequestedId;
                const hydrated = hydrateDecodedResult(result);
                hydrated._isStale = isStale;

                req.resolve(hydrated);
            };

            this.worker.onerror = (err) => {
                console.error('[DecodeWorker] Worker error occurred:', err);
                // 發生崩潰時通知所有等候中的請求回退到同步解析
                for (const [id, req] of this.pendingRequests.entries()) {
                    try {
                        const fallbackResult = simaiDecode(req.data, req.baseOffset, req.options);
                        req.resolve(fallbackResult);
                    } catch (e) {
                        req.reject(e);
                    }
                }
                this.pendingRequests.clear();

                // 嘗試重啟 Worker
                try {
                    this.worker.terminate();
                } catch { }
                this.worker = null;
                setTimeout(() => this.initWorker(), 1000);
            };
        } catch (err) {
            console.warn('[DecodeWorker] Failed to initialize Web Worker, falling back to main-thread decode:', err);
            this.worker = null;
        }
    }

    /**
     * 檢查 Web Worker 是否可用
     */
    isAvailable() {
        return !!this.worker;
    }

    /**
     * 非同步在背景解碼 Simai 譜面
     * @param {string} data 譜面字串
     * @param {boolean} baseOffset 是否根據第一個 BPM 計算 baseOffset
     * @param {Object} options 選項 (disableSyntaxCheck, forceFull 等)
     * @returns {Promise<Object>} 解碼結果
     */
    async decodeAsync(data = '', baseOffset = true, options = {}) {
        // 如果不支援或 Worker 尚未就緒，直接使用主線程同步解析
        if (!this.worker) {
            return Promise.resolve(simaiDecode(data, baseOffset, options));
        }

        const id = ++this.currentRequestId;
        this.latestRequestedId = id;

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, {
                resolve,
                reject,
                data,
                baseOffset,
                options,
                time: performance.now()
            });

            this.worker.postMessage({
                id,
                type: 'DECODE',
                data,
                baseOffset,
                options
            });
        });
    }

    /**
     * 清除主線程與 Worker 的增量解析快取
     */
    clearCache() {
        clearLocalIncrementalCache();
        if (this.worker) {
            this.worker.postMessage({ type: 'CLEAR_CACHE' });
        }
    }

    /**
     * 主線程同步解析 (供需要即時同步返回之處使用)
     */
    decodeSync(data = '', baseOffset = true, options = {}) {
        return simaiDecode(data, baseOffset, options);
    }
}

export const decodeWorkerManager = new DecodeWorkerManager();
