/**
 * @file renderOverlayRegistry.js
 * @description Canvas 渲染疊加圖層註冊表。
 * 供渲染核心於特定繪製階段呼叫已註冊的輔助圖層，並以 save/restore 與 try/catch 隔離狀態污染與例外。
 */

import { appContext } from './appContext.js';
import { t } from '../i18n.js';

const VALID_TARGETS = new Set(['main', 'visual']);
const VALID_PHASES = new Set(['beforeNotes', 'afterNotes']);
const OVERLAY_BUDGET_MS = 12;
const OVERLAY_MAX_SLOW_FRAMES = 30;

class RenderOverlayRegistry {
    constructor() {
        /** @type {Map<string, { id: string, target: string, phase: string, order: number, draw: Function }>} */
        this.overlays = new Map();
        this._nextId = 1;
    }

    /**
     * 註冊 Canvas 疊加繪圖回呼
     * @param {Object} options
     * @param {'main'|'visual'} [options.target='main'] 目標畫布
     * @param {'beforeNotes'|'afterNotes'} [options.phase='afterNotes'] 繪製階段
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
        if (!VALID_PHASES.has(phase)) {
            throw new TypeError(`[RenderOverlayRegistry] 不支援的繪製階段: ${phase}`);
        }

        const id = `overlay_${this._nextId++}`;
        this.overlays.set(id, {
            id,
            extensionId: typeof options.extensionId === 'string' ? options.extensionId : '',
            extensionName: typeof options.extensionName === 'string' ? options.extensionName : '',
            target,
            phase,
            order: Number(options.order) || 0,
            includeInVideo: Boolean(options.includeInVideo),
            slowFrames: 0,
            draw: options.draw
        });

        return () => this.overlays.delete(id);
    }

    /**
     * 檢查指定目標與階段是否有任何疊加圖層（快速路徑避免無謂配置）
     * @param {'main'|'visual'} target
     * @param {'beforeNotes'|'afterNotes'} phase
     * @param {boolean} [isRenderingVideo=false]
     * @returns {boolean}
     */
    hasOverlays(target, phase, isRenderingVideo = false) {
        for (const entry of this.overlays.values()) {
            if (entry.target === target && entry.phase === phase) {
                if (!isRenderingVideo || entry.includeInVideo) return true;
            }
        }
        return false;
    }

    /**
     * 安全執行符合目標畫布與階段的所有疊加圖層
     * @param {'main'|'visual'} target
     * @param {'beforeNotes'|'afterNotes'} phase
     * @param {Object} renderContext
     */
    run(target, phase, renderContext) {
        if (this.overlays.size === 0) return;

        const isRenderingVideo = Boolean(renderContext?.isRenderingVideo);
        const matching = [];
        for (const entry of this.overlays.values()) {
            if (entry.target === target && entry.phase === phase) {
                if (!isRenderingVideo || entry.includeInVideo) {
                    matching.push(entry);
                }
            }
        }
        if (matching.length === 0) return;

        matching.sort((a, b) => a.order - b.order);
        const canvasCtx = renderContext?.ctx;
        const measurePerf = !isRenderingVideo && typeof performance !== 'undefined' && typeof performance.now === 'function';

        for (const entry of matching) {
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
                        this.overlays.delete(entry.id);
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

