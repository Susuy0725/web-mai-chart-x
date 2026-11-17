/**
 * @file renderOverlayRegistry.js
 * @description Canvas 渲染疊加圖層註冊表。
 * 供渲染核心於特定繪製階段呼叫已註冊的輔助圖層，並以 save/restore 與 try/catch 隔離狀態污染與例外。
 */

import { appContext } from './appContext.js';
import { t } from '../i18n.js';

const VALID_TARGETS = new Set(['main', 'visual']);
const VALID_PHASES_BY_TARGET = {
    main: new Set([
        'afterClear',
        'beforeNotes',
        'afterSensors',
        'afterMiddleDisplay',
        'afterNoteObjects',
        'afterEffects',
        'afterBorder',
        'afterNotes'
    ]),
    visual: new Set([
        'beforeNotes',
        'afterNoteObjects',
        'afterNotes'
    ])
};
const OVERLAY_BUDGET_MS = 12;
const OVERLAY_MAX_SLOW_FRAMES = 30;
const DEFAULT_PREPARE_TIMEOUT_MS = 3000;
const MIN_PREPARE_TIMEOUT_MS = 100;
const MAX_PREPARE_TIMEOUT_MS = 30000;
const PREPARE_MAX_CONSECUTIVE_TIMEOUTS = 10;

class RenderOverlayRegistry {
    constructor() {
        /** @type {Map<string, { id: string, target: string, phase: string, order: number, draw: Function }>} */
        this.overlays = new Map();
        /** @type {Map<string, Array<Object>>} */
        this.buckets = new Map();
        this._nextId = 1;
    }

    /**
     * 取得目標畫布與階段對應的桶鍵名
     * @param {string} target
     * @param {string} phase
     * @returns {string}
     */
    _getBucketKey(target, phase) {
        return `${target}:${phase}`;
    }

    /**
     * 自註冊表與對應階段桶中移除圖層
     * @param {string} id
     * @returns {boolean}
     */
    _removeOverlay(id) {
        const entry = this.overlays.get(id);
        if (!entry) return false;
        this.overlays.delete(id);
        const key = this._getBucketKey(entry.target, entry.phase);
        const bucket = this.buckets.get(key);
        if (bucket) {
            const idx = bucket.indexOf(entry);
            if (idx !== -1) bucket.splice(idx, 1);
            if (bucket.length === 0) this.buckets.delete(key);
        }
        return true;
    }

    /**
     * 註冊 Canvas 疊加繪圖回呼
     * @param {Object} options
     * @param {'main'|'visual'} [options.target='main'] 目標畫布
     * @param {string} [options.phase='afterNotes'] 繪製階段
     * @param {number} [options.order=0] 排序權重，數值小者先繪製
     * @param {Function} options.draw 繪圖回呼 (renderContext) => void
     * @returns {Function} 取消註冊函式
     */
    register(options) {
        if (!options || typeof options.draw !== 'function') {
            throw new TypeError('[RenderOverlayRegistry] 必須提供 draw 繪圖函式');
        }
        const target = options.target || 'main';
        const phase = options.phase || 'afterNotes';
        if (!VALID_TARGETS.has(target)) {
            throw new TypeError(`[RenderOverlayRegistry] 不支援的目標畫布: ${target}`);
        }
        const validPhases = VALID_PHASES_BY_TARGET[target];
        if (!validPhases || !validPhases.has(phase)) {
            throw new TypeError(`[RenderOverlayRegistry] 目標畫布 "${target}" 不支援繪製階段: ${phase}`);
        }
        if (options.prepareVideoFrame !== undefined && typeof options.prepareVideoFrame !== 'function') {
            throw new TypeError('[RenderOverlayRegistry] prepareVideoFrame 必須為函式');
        }

        const id = `overlay_${this._nextId++}`;
        const rawTimeout = Number(options.prepareTimeoutMs);
        const prepareTimeoutMs = Number.isFinite(rawTimeout)
            ? Math.min(MAX_PREPARE_TIMEOUT_MS, Math.max(MIN_PREPARE_TIMEOUT_MS, rawTimeout))
            : DEFAULT_PREPARE_TIMEOUT_MS;
        const entry = {
            id,
            extensionId: typeof options.extensionId === 'string' ? options.extensionId : '',
            extensionName: typeof options.extensionName === 'string' ? options.extensionName : '',
            target,
            phase,
            order: Number(options.order) || 0,
            includeInVideo: Boolean(options.includeInVideo),
            slowFrames: 0,
            draw: options.draw,
            prepareVideoFrame: typeof options.prepareVideoFrame === 'function' ? options.prepareVideoFrame : null,
            prepareTimeoutMs,
            consecutiveTimeouts: 0,
            prepareDisabledInVideo: false
        };
        this.overlays.set(id, entry);

        const key = this._getBucketKey(target, phase);
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = [];
            this.buckets.set(key, bucket);
        }
        bucket.push(entry);
        bucket.sort((a, b) => a.order - b.order);

        return () => this._removeOverlay(id);
    }

    /**
     * 檢查指定目標與階段是否有任何疊加圖層（快速路徑避免無謂配置）
     * @param {'main'|'visual'} target
     * @param {string} phase
     * @param {boolean} [isRenderingVideo=false]
     * @returns {boolean}
     */
    hasOverlays(target, phase, isRenderingVideo = false) {
        const bucket = this.buckets.get(this._getBucketKey(target, phase));
        if (!bucket || bucket.length === 0) return false;
        if (!isRenderingVideo) return true;
        for (let i = 0; i < bucket.length; i++) {
            if (bucket[i].includeInVideo) return true;
        }
        return false;
    }

    /**
     * 檢查是否有任何圖層註冊了離線影片匯出前置鉤子
     * @returns {boolean}
     */
    hasVideoPrepareHooks() {
        for (const entry of this.overlays.values()) {
            if (entry.target === 'main' && entry.includeInVideo && entry.prepareVideoFrame) {
                return true;
            }
        }
        return false;
    }

    /**
     * 於離線影片匯出渲染單幀前，依序執行前置非同步準備鉤子並套用逾時保護
     * @param {Object} context
     * @returns {Promise<void>}
     */
    async prepareVideoFrames(context) {
        const signal = context?.signal || null;
        if (signal?.aborted) return;

        const hooks = [];
        const isFirstFrame = context && context.frameIndex === 0;
        for (const entry of this.overlays.values()) {
            if (entry.target === 'main' && entry.includeInVideo && entry.prepareVideoFrame) {
                if (isFirstFrame) {
                    entry.consecutiveTimeouts = 0;
                    entry.prepareDisabledInVideo = false;
                }
                if (!entry.prepareDisabledInVideo) {
                    hooks.push(entry);
                }
            }
        }
        if (hooks.length === 0) return;

        hooks.sort((a, b) => a.order - b.order);

        for (let i = 0; i < hooks.length; i++) {
            if (signal?.aborted) break;

            const entry = hooks[i];
            const timeoutMs = entry.prepareTimeoutMs || DEFAULT_PREPARE_TIMEOUT_MS;
            let timerId = null;
            let timedOut = false;
            let aborted = false;
            let onAbort = null;

            try {
                const task = Promise.resolve(entry.prepareVideoFrame(context));
                const timeoutPromise = new Promise((_, reject) => {
                    timerId = setTimeout(() => {
                        timedOut = true;
                        reject(new Error(`prepareVideoFrame 逾時 (${timeoutMs}ms)`));
                    }, timeoutMs);
                });
                const racers = [task, timeoutPromise];
                if (signal) {
                    racers.push(new Promise((_, reject) => {
                        onAbort = () => {
                            aborted = true;
                            reject(new Error('prepareVideoFrame 已取消'));
                        };
                        if (signal.aborted) {
                            onAbort();
                        } else {
                            signal.addEventListener('abort', onAbort, { once: true });
                        }
                    }));
                }
                await Promise.race(racers);
                entry.consecutiveTimeouts = 0;
            } catch (error) {
                if (aborted || signal?.aborted) {
                    break;
                }
                const displayName = entry.extensionName || entry.extensionId || entry.id;
                if (timedOut) {
                    entry.consecutiveTimeouts += 1;
                    console.warn(
                        `[RenderOverlayRegistry] 疊加圖層 "${entry.id}" [${displayName}] 錄影前置準備逾時 (${entry.consecutiveTimeouts}/${PREPARE_MAX_CONSECUTIVE_TIMEOUTS})`,
                        error
                    );
                    if (entry.consecutiveTimeouts >= PREPARE_MAX_CONSECUTIVE_TIMEOUTS) {
                        entry.prepareDisabledInVideo = true;
                        console.warn(
                            `[RenderOverlayRegistry] 疊加圖層 "${entry.id}" [${displayName}] 連續逾時已達上限，本次匯出將略過其前置等待`
                        );
                    }
                } else {
                    console.error(`[RenderOverlayRegistry] 疊加圖層 "${entry.id}" [${displayName}] 錄影前置準備失敗:`, error);
                }
            } finally {
                if (timerId !== null) {
                    clearTimeout(timerId);
                }
                if (signal && onAbort) {
                    signal.removeEventListener('abort', onAbort);
                }
            }
        }
    }

    /**
     * 安全執行符合目標畫布與階段的所有疊加圖層
     * @param {'main'|'visual'} target
     * @param {string} phase
     * @param {Object} renderContext
     */
    run(target, phase, renderContext) {
        const bucket = this.buckets.get(this._getBucketKey(target, phase));
        if (!bucket || bucket.length === 0) return;

        const isRenderingVideo = Boolean(renderContext?.isRenderingVideo);
        const canvasCtx = renderContext?.ctx;
        const measurePerf = !isRenderingVideo && typeof performance !== 'undefined' && typeof performance.now === 'function';
        // 複製當前桶快照，避免執行期間因熔斷或回呼取消註冊導致索引錯位
        const entries = bucket.slice();

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (isRenderingVideo && !entry.includeInVideo) continue;

            if (canvasCtx && typeof canvasCtx.save === 'function') {
                canvasCtx.save();
            }
            const startMs = measurePerf ? performance.now() : 0;
            let drawFailed = false;
            try {
                entry.draw(renderContext);
            } catch (error) {
                drawFailed = true;
                console.error(`[RenderOverlayRegistry] 疊加圖層 "${entry.id}" 繪製失敗:`, error);
            } finally {
                if (canvasCtx && typeof canvasCtx.restore === 'function') {
                    canvasCtx.restore();
                }
            }

            if (measurePerf && !drawFailed) {
                const elapsedMs = performance.now() - startMs;
                if (elapsedMs > OVERLAY_BUDGET_MS) {
                    entry.slowFrames += 1;
                    if (entry.slowFrames >= OVERLAY_MAX_SLOW_FRAMES) {
                        this._removeOverlay(entry.id);
                        const displayName = entry.extensionName || entry.extensionId || entry.id;
                        console.warn(
                            `[RenderOverlayRegistry] 疊加圖層 "${entry.id}" [${displayName}] 連續 ${OVERLAY_MAX_SLOW_FRAMES} 幀耗時超過 ${OVERLAY_BUDGET_MS}ms，已自動停用`
                        );
                        const toast = appContext.get('simpleToast');
                        if (typeof toast === 'function') {
                            toast({
                                content: t('extensions.overlayAutoDisabled', { name: displayName }),
                                type: 'warning',
                                timeout: 4500
                            });
                        }
                    }
                } else {
                    entry.slowFrames = 0;
                }
            }
        }
    }
}

export const renderOverlayRegistry = new RenderOverlayRegistry();

