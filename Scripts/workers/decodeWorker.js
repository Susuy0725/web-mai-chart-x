/**
 * decodeWorker.js
 * Simai 背景解碼 Web Worker 線程
 * 負責在背景執行耗時的 Simai 譜面解碼，避免主線程 UI 與渲染卡頓
 */

import { simaiDecode, clearIncrementalCache } from '../decode.js';

self.onmessage = (e) => {
    const { id, type, data, baseOffset, options } = e.data || {};

    if (type === 'CLEAR_CACHE') {
        clearIncrementalCache();
        self.postMessage({ id, type: 'CACHE_CLEARED' });
        return;
    }

    if (type === 'DECODE') {
        try {
            const startTime = performance.now();
            const result = simaiDecode(data, baseOffset, options);
            const duration = performance.now() - startTime;
            self.postMessage({
                id,
                success: true,
                result,
                duration
            });
        } catch (err) {
            self.postMessage({
                id,
                success: false,
                error: err ? (err.message || String(err)) : 'Unknown decode error'
            });
        }
    }
};
