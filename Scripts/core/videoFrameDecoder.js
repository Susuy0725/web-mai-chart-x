/**
 * @file videoFrameDecoder.js
 * @description 受控的逐幀影片解碼器封裝。
 * 內部透過 Mediabunny 的 Input 與 CanvasSink 維護循序影格迭代器，
 * 自動處理順向推進、循環回繞與跳轉重建，並對外提供精簡的 getFrameAt 與 dispose 介面。
 */

import { ensureMediabunny } from '../helper.js';

const DEFAULT_POOL_SIZE = 3;
const FORWARD_JUMP_REBUILD_SEC = 2.0;

/**
 * 建立受控的逐幀影片解碼器
 * @param {Blob|File|string} source 影片檔案、Blob 或網址字串
 * @param {Object} [options={}]
 * @param {'stop'|'loop'} [options.endBehavior='stop'] 超出影片長度時的預設行為
 * @param {number} [options.width] 選填，解碼輸出畫布目標寬度
 * @param {number} [options.height] 選填，解碼輸出畫布目標高度
 * @returns {Promise<{ duration: number, getFrameAt: Function, dispose: Function }>}
 */
export async function createVideoFrameDecoder(source, options = {}) {
    if (!source) {
        throw new TypeError('[VideoFrameDecoder] 必須提供影片來源');
    }

    await ensureMediabunny();
    const mb = typeof window !== 'undefined' ? window.Mediabunny : null;
    if (!mb || !mb.Input || !mb.CanvasSink) {
        throw new Error('[VideoFrameDecoder] 媒體解碼核心尚未就緒');
    }

    const { Input, UrlSource, BlobSource, CanvasSink, ALL_FORMATS } = mb;
    let mediaSource = null;

    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        mediaSource = new BlobSource(source);
    } else if (typeof source === 'string' && source.trim()) {
        const trimmed = source.trim();
        if (trimmed.startsWith('blob:')) {
            const resp = await fetch(trimmed);
            mediaSource = new BlobSource(await resp.blob());
        } else {
            mediaSource = new UrlSource(trimmed);
        }
    } else {
        throw new TypeError('[VideoFrameDecoder] 不支援的影片來源型別');
    }

    const input = new Input({
        formats: ALL_FORMATS,
        source: mediaSource
    });

    let disposed = false;
    let canvasSink = null;
    let canvasIterator = null;
    let currentFrame = null;
    let duration = 0;
    const defaultEndBehavior = options.endBehavior === 'loop' ? 'loop' : 'stop';

    try {
        const videoTrack = await input.getPrimaryVideoTrack();
        if (!videoTrack) {
            throw new Error('[VideoFrameDecoder] 找不到可用的視訊軌');
        }
        const computedDuration = await input.computeDuration();
        duration = Number.isFinite(computedDuration) && computedDuration > 0 ? computedDuration : 0;

        const sinkOpts = { poolSize: DEFAULT_POOL_SIZE };
        if (Number.isFinite(options.width) && options.width > 0) {
            sinkOpts.width = Math.round(options.width);
        }
        if (Number.isFinite(options.height) && options.height > 0) {
            sinkOpts.height = Math.round(options.height);
        }
        canvasSink = new CanvasSink(videoTrack, sinkOpts);
    } catch (err) {
        try { input.dispose(); } catch (_) { }
        throw err;
    }

    async function closeIterator() {
        const it = canvasIterator;
        canvasIterator = null;
        currentFrame = null;
        if (it) {
            try {
                await it.return();
            } catch (_) { }
        }
    }

    function normalizeTargetTime(rawTime, endBehavior) {
        const t = Number(rawTime);
        if (!Number.isFinite(t) || t <= 0) return 0;
        if (duration <= 0) return t;
        if (endBehavior === 'loop') {
            return t % duration;
        }
        return Math.min(t, Math.max(0, duration - 0.001));
    }

    function wrapFrameResult(frame) {
        if (!frame || !frame.canvas) return null;
        return Object.freeze({
            canvas: frame.canvas,
            timestamp: Number(frame.timestamp) || 0,
            duration: Number(frame.duration) || 0,
            width: Number(frame.canvas.width) || 0,
            height: Number(frame.canvas.height) || 0
        });
    }

    async function getFrameAt(time, callOptions = {}) {
        if (disposed || !canvasSink) return null;
        const mode = (callOptions && callOptions.endBehavior)
            ? (callOptions.endBehavior === 'loop' ? 'loop' : 'stop')
            : defaultEndBehavior;
        const targetTime = normalizeTargetTime(time, mode);

        const needRebuild = !canvasIterator
            || !currentFrame
            || targetTime < currentFrame.timestamp - 0.001
            || (targetTime - currentFrame.timestamp) > FORWARD_JUMP_REBUILD_SEC;

        try {
            if (needRebuild) {
                await closeIterator();
                if (disposed) return null;
                canvasIterator = canvasSink.canvases(targetTime);
                const first = await canvasIterator.next();
                if (!first || first.done) {
                    return null;
                }
                currentFrame = first.value;
            }

            while (currentFrame) {
                const frameDur = currentFrame.duration || (1 / 60);
                const frameEnd = currentFrame.timestamp + frameDur;
                if (frameEnd <= targetTime) {
                    const nextRes = await canvasIterator.next();
                    if (!nextRes || nextRes.done) {
                        break;
                    }
                    currentFrame = nextRes.value;
                } else {
                    break;
                }
            }

            return wrapFrameResult(currentFrame);
        } catch (err) {
            console.warn('[VideoFrameDecoder] 讀取影格失敗:', err);
            return wrapFrameResult(currentFrame);
        }
    }

    async function dispose() {
        if (disposed) return;
        disposed = true;
        await closeIterator();
        canvasSink = null;
        try {
            input.dispose();
        } catch (_) { }
    }

    return Object.freeze({
        get duration() {
            return duration;
        },
        getFrameAt,
        dispose
    });
}
