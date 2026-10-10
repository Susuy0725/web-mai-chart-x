/**
 * @file playbackEngine.js
 * @description 譜面播放主循環與音訊/影像同步引擎 (PlaybackEngine)
 * 負責管理播放、暫停、跳轉、幀調度 (rAF)、音訊時間同步與背景影片同步。
 */

import { eventBus, EVENTS } from './eventBus.js';
import { debounce } from '../helper.js';

const VIDEO_MIN_SEEK_INTERVAL = 0.8; // 背景影片最短 seek 間隔（秒）
const VIDEO_SEEK_THRESHOLD = 0.3;    // 背景影片時間差超過此值才 seek（秒）

export class PlaybackEngine {
    /**
     * @param {Object} options
     * @param {Object} options.appContext
     * @param {Object} options.audioManager
     * @param {Object} options.majdataWs
     * @param {Function} options.getSettings
     * @param {Function} options.getRenderer
     * @param {Function} options.getNotes
     * @param {Function} options.getEndTime
     * @param {Function} options.getMusicDelay
     * @param {Function} options.getNowIndex
     * @param {Function} options.getRawData
     * @param {Function} options.getDataIndexToTime
     * @param {Function} options.getSecondaryWindow
     * @param {Function} options.getSecondCtx
     * @param {Function} options.getBackgroundImage
     * @param {Function} options.getBackgroundVideo
     * @param {HTMLElement} options.editorBackgroundImage
     * @param {HTMLVideoElement} options.editorBackgroundVideo
     * @param {HTMLInputElement|HTMLTextAreaElement} options.editorInput
     * @param {HTMLSelectElement} [options.changeDifficulty]
     * @param {Function} options.getMaidata
     * @param {Function} options.draw
     * @param {Function} options.updateSlider
     * @param {Function} [options.projSet]
     * @param {Function} [options.t]
     * @param {Function} [options.simpleToast]
     */
    constructor(options) {
        this.opts = options;
        this.appContext = options.appContext;
        this.audioManager = options.audioManager;
        this.majdataWs = options.majdataWs;

        // 核心狀態
        this._isPlaying = false;
        this.realTime = 0;
        this.globalTime = 0;
        this.lastStartTime = 0;
        this.lastTimestamp = null;
        this.playStartTimestamp = null;
        this.playStartRealTime = 0;
        this.timeControlSliding = false;
        this.keepRenderingWhilePause = false;
        this._dirty = false;

        // 幀排程相關
        this.animFrameId = null;
        this.currentAnimWindow = null;

        // 背景影片與音訊同步相關
        this.bgmUpdateTimer = null;
        this.lastVideoSeekTime = 0;

        // 游標跟隨快取
        this.lastCursorIndex = -1;
        this.cursorLastIndexTime = 0;

        // 防抖處理
        this.slideInputDebounce = debounce(() => this._handleSlideInputDebounce(), 80);
        this.videoSeekDebounce = debounce((time) => this._handleVideoSeekDebounce(time), 50);

        // 綁定主循環回呼
        this.update = this.update.bind(this);

        // 監聽 visibilitychange 處理背景分頁喚醒
        this._setupVisibilityListener();
    }

    notifyTime() {
        this.opts.onTimeUpdate?.(this.realTime, this.globalTime, this.lastStartTime);
    }

    setTime(rt) {
        this.realTime = rt;
        this.lastStartTime = rt;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        this.globalTime = rt - musicDelay;
        this.notifyTime();
    }

    get isPlaying() {
        return this._isPlaying;
    }

    requestRedraw() {
        this._dirty = true;
        if (!this._isPlaying && !this.keepRenderingWhilePause) {
            this.opts.draw?.(0);
        }
    }

    _setupVisibilityListener() {
        if (typeof document === 'undefined') return;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (this._isPlaying || this.keepRenderingWhilePause) {
                    this.lastTimestamp = performance.now();
                    this.requestNextFrame(this.update);
                }
            }
        });
    }

    cancelNextFrame() {
        if (this.animFrameId !== null) {
            try {
                if (this.currentAnimWindow && typeof this.currentAnimWindow.cancelAnimationFrame === 'function') {
                    this.currentAnimWindow.cancelAnimationFrame(this.animFrameId);
                } else if (typeof window !== 'undefined') {
                    window.cancelAnimationFrame(this.animFrameId);
                }
            } catch (_) { }
            this.animFrameId = null;
            this.currentAnimWindow = null;
        }
    }

    requestNextFrame(callback) {
        this.cancelNextFrame();

        let targetWin = typeof window !== 'undefined' ? window : null;
        const secondaryWindow = this.opts.getSecondaryWindow?.();
        const secondCtx = this.opts.getSecondCtx?.();

        // 若外部副視窗處於開啟且活動狀態，優先使用副視窗的 rAF 調度（防止主視窗最小化時副視窗被瀏覽器降頻暫停）
        if (secondCtx && secondaryWindow && secondaryWindow.isActive() && secondaryWindow.externalWindow) {
            targetWin = secondaryWindow.externalWindow;
        }

        this.currentAnimWindow = targetWin;
        try {
            this.animFrameId = targetWin.requestAnimationFrame((time) => {
                this.animFrameId = null;
                this.currentAnimWindow = null;
                callback(time);
            });
        } catch (_) {
            if (typeof window !== 'undefined') {
                this.currentAnimWindow = window;
                this.animFrameId = window.requestAnimationFrame((time) => {
                    this.animFrameId = null;
                    this.currentAnimWindow = null;
                    callback(time);
                });
            }
        }
    }

    updatePauseBackgroundDisplay() {
        const settings = this.opts.getSettings();
        const hideBg = !!settings.hideBackgroundWhenPaused;
        const showCover = !!settings.showCoverWhenPaused;
        const videoDisabled = !!settings.disableVideo;

        const bgVideo = this.opts.getBackgroundVideo?.();
        const bgImg = this.opts.getBackgroundImage?.();
        const editorBackgroundVideo = this.opts.editorBackgroundVideo;
        const editorBackgroundImage = this.opts.editorBackgroundImage;

        const hasVideo = !videoDisabled && !!(bgVideo && editorBackgroundVideo?.src && editorBackgroundVideo?.readyState >= 1);
        const hasImage = !!(bgImg && editorBackgroundImage?.complete && editorBackgroundImage?.naturalWidth !== 0);

        if (!editorBackgroundImage || !editorBackgroundVideo) return;

        if (hideBg) {
            editorBackgroundImage.style.display = 'none';
            editorBackgroundVideo.style.display = 'none';
        } else if (showCover || videoDisabled) {
            editorBackgroundImage.style.display = hasImage ? 'block' : 'none';
            editorBackgroundVideo.style.display = 'none';
        } else {
            editorBackgroundImage.style.display = 'none';
            editorBackgroundVideo.style.display = hasVideo ? 'block' : 'none';
        }
    }

    updateVideoBackgroundDisplay() {
        const settings = this.opts.getSettings();
        const isPlaying = this._isPlaying;
        const editorBackgroundVideo = this.opts.editorBackgroundVideo;
        const editorBackgroundImage = this.opts.editorBackgroundImage;
        const bgImg = this.opts.getBackgroundImage?.();
        const bgVideo = this.opts.getBackgroundVideo?.();

        if (!editorBackgroundImage || !editorBackgroundVideo) return;

        if (settings.disableVideo) {
            editorBackgroundVideo.pause();
            editorBackgroundVideo.style.display = 'none';
            const hasImage = !!(bgImg && editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0);
            const hideBg = !isPlaying && !!settings.hideBackgroundWhenPaused;
            editorBackgroundImage.style.display = (hasImage && !hideBg) ? 'block' : 'none';
        } else {
            if (isPlaying) {
                const hasVideo = !!(bgVideo && editorBackgroundVideo.src && editorBackgroundVideo.readyState >= 1);
                const hasImage = !!(bgImg && editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0);
                editorBackgroundImage.style.display = hasImage ? 'block' : 'none';
                if (hasVideo) {
                    editorBackgroundVideo.style.display = 'block';
                    try { editorBackgroundVideo.currentTime = this.realTime; } catch (_) { }
                    editorBackgroundVideo.play().catch(() => { });
                } else {
                    editorBackgroundVideo.style.display = 'none';
                }
            } else {
                this.updatePauseBackgroundDisplay();
            }
        }
    }

    sendMajdataPlay() {
        if (!this.majdataWs || !this.majdataWs.isConnected()) return;

        this.majdataWs.sendLoad({
            trackPath: '',
            imagePath: '',
            videoPath: ''
        });

        const fumenText = this.opts.editorInput?.value || '';
        const changeDiff = this.opts.changeDifficulty;
        const diffVal = changeDiff ? changeDiff.value : '3';
        const diffIdx = isNaN(parseInt(diffVal)) ? 3 : Math.max(0, parseInt(diffVal) - 1);
        const maidata = this.opts.getMaidata?.() || {};
        const settings = this.opts.getSettings();
        const musicDelay = this.opts.getMusicDelay?.() || 0;

        this.majdataWs.play({
            mode: 0,
            startAt: this.realTime || 0,
            speed: settings.playbackSpeed || 1,
            title: maidata.title || '',
            artist: maidata.artist || '',
            offset: musicDelay,
            designer: maidata['des_' + diffVal] || '',
            level: maidata['lv_' + diffVal] || '',
            fumen: fumenText,
            difficulty: diffIdx
        });
    }

    play() {
        if (this._isPlaying) return;

        const isImagesLoaded = this.opts.getIsImagesLoaded?.() ?? this.appContext?.isImagesLoaded ?? true;
        if (!isImagesLoaded) {
            this.opts.simpleToast?.({
                content: this.opts.t?.('toast.loadingAssetsWait') || '素材載入中，請稍候...',
                type: 'warning'
            });
            return;
        }

        this.bgmUpdateTimer = null;
        this.lastStartTime = this.realTime;
        this.notifyTime();
        const settings = this.opts.getSettings();
        const videoDisabled = !!settings.disableVideo;
        const editorBackgroundImage = this.opts.editorBackgroundImage;
        const editorBackgroundVideo = this.opts.editorBackgroundVideo;

        if (editorBackgroundImage) {
            const hasImage = !!(editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0);
            editorBackgroundImage.style.display = hasImage ? 'block' : 'none';
        }

        if (editorBackgroundVideo) {
            if (!videoDisabled) {
                editorBackgroundVideo.style.display = (editorBackgroundVideo.readyState === 4) ? 'block' : 'none';
                editorBackgroundVideo.currentTime = this.realTime;
                if (editorBackgroundVideo.paused && editorBackgroundVideo.readyState >= 1) {
                    editorBackgroundVideo.play().catch(() => { });
                }
            } else {
                editorBackgroundVideo.pause();
                editorBackgroundVideo.style.display = 'none';
            }
        }

        this._isPlaying = true;
        this.lastTimestamp = performance.now();
        this.playStartRealTime = this.realTime;
        this.playStartTimestamp = performance.now();

        // 同步啟動 BGM (若 BGM 仍在解碼中則待其就緒時自動啟動)
        if (this.audioManager) {
            if (this.audioManager.haveBGM()) {
                this.audioManager.playBGM(this.realTime);
            } else if (this.audioManager.bgmReady) {
                this.audioManager.bgmReady.then(() => {
                    if (this._isPlaying && this.audioManager?.haveBGM() && !this.audioManager.bgmSource) {
                        this.audioManager.playBGM(this.realTime);
                        this.playStartTimestamp = performance.now();
                        this.playStartRealTime = this.realTime;
                    }
                });
            }
        }

        if (this.majdataWs?.isConnected()) {
            this.sendMajdataPlay();
        }

        eventBus.emit(EVENTS.PLAYBACK_STATE_CHANGED, {
            isPlaying: true,
            realTime: this.realTime,
            globalTime: this.globalTime
        });

        this.update(this.lastTimestamp);
        this.slideInputDebounce();
    }

    pause() {
        if (!this._isPlaying) return;

        this.updatePauseBackgroundDisplay();
        this.opts.editorBackgroundVideo?.pause();

        this._isPlaying = false;
        this.lastTimestamp = null;
        this.playStartTimestamp = null;

        // 停止音效與 BGM
        this.audioManager?.stopAllLongSounds();
        this.audioManager?.stopBGM();

        const renderer = this.opts.getRenderer?.();
        renderer?.clearJudgeEffects();
        renderer?.clearHitEffects();

        const notes = this.opts.getNotes?.() || [];
        notes.forEach(n => { n._riserActive = false; });

        if (this.majdataWs?.isConnected()) {
            this.majdataWs.pause();
        }

        if (!this.keepRenderingWhilePause) {
            this.cancelNextFrame();
        }

        eventBus.emit(EVENTS.PLAYBACK_STATE_CHANGED, {
            isPlaying: false,
            realTime: this.realTime,
            globalTime: this.globalTime
        });

        this.opts.draw?.();
        this.slideInputDebounce();
    }

    toggle() {
        if (this._isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    stop() {
        this.updatePauseBackgroundDisplay();
        this.opts.editorBackgroundVideo?.pause();

        this._isPlaying = false;
        this.bgmUpdateTimer = null;
        this.lastTimestamp = null;
        this.playStartTimestamp = null;

        this.realTime = this.lastStartTime || 0;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        this.globalTime = this.realTime - musicDelay;
        this.notifyTime();
        this.opts.updateSlider?.(this.realTime);

        // 停止音效、排程與 BGM
        this.audioManager?.clearSoundQueue();
        this.audioManager?.stopAllScheduledSounds();
        this.audioManager?.stopAllLongSounds();
        this.audioManager?.stopBGM();

        const renderer = this.opts.getRenderer?.();
        renderer?.clearJudgeEffects();
        renderer?.clearHitEffects();

        this.resetNotesPlaybackState(this.globalTime);

        if (this.majdataWs?.isConnected()) {
            this.majdataWs.stop();
        }

        if (!this.keepRenderingWhilePause) {
            this.cancelNextFrame();
        }

        eventBus.emit(EVENTS.PLAYBACK_STATE_CHANGED, {
            isPlaying: false,
            realTime: this.realTime,
            globalTime: this.globalTime
        });

        this.opts.draw?.();
    }

    reset() {
        this.updatePauseBackgroundDisplay();
        this.opts.editorBackgroundVideo?.pause();

        this._isPlaying = false;
        this.bgmUpdateTimer = null;
        this.lastTimestamp = null;
        this.playStartTimestamp = null;

        this.realTime = 0;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        this.globalTime = this.realTime - musicDelay;
        this.notifyTime();
        this.opts.updateSlider?.(this.realTime);

        // 停止音效、排程與 BGM
        this.audioManager?.clearSoundQueue();
        this.audioManager?.stopAllScheduledSounds();
        this.audioManager?.stopAllLongSounds();
        this.audioManager?.stopBGM();

        const renderer = this.opts.getRenderer?.();
        renderer?.clearJudgeEffects();
        renderer?.clearHitEffects();

        this.videoSeekDebounce(0);
        this.resetNotesPlaybackState(this.globalTime);

        if (this.majdataWs?.isConnected()) {
            this.majdataWs.stop();
        }

        if (!this.keepRenderingWhilePause) {
            this.cancelNextFrame();
        }

        eventBus.emit(EVENTS.PLAYBACK_STATE_CHANGED, {
            isPlaying: false,
            realTime: this.realTime,
            globalTime: this.globalTime
        });

        this.opts.draw?.();
    }

    /**
     * 重置所有音符的音效觸發旗標，防止 seek 後歷史音符集中引爆或未來音符無法發聲
     * @param {number} globalTime 
     */
    resetNotesPlaybackState(globalTime) {
        const notes = this.opts.getNotes?.() || [];
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const skipT = (n.holdDuration ?? 0) + (n.slideDuration ?? 0) + (n.slideDelay ?? 0) + (n.isMine ? (n.cullSkipExtend ?? 0) : 0);
            const startT = n.time + (n.slideDelay ?? 0);
            const endT = n.time + skipT;

            n._startEffectPlayed = (startT <= globalTime);
            n._endEffectPlayed = (endT <= globalTime);
            if (n._riserActive) {
                const isInsideHold = (n.type === 'touch' && n.holdDuration > 0 && n.time <= globalTime && (globalTime - n.time) < n.holdDuration);
                if (!isInsideHold) {
                    this.audioManager?.stopLongSound(`riser_${n.pos}_${n.time}`);
                    n._riserActive = false;
                }
            }
        }
    }

    seekToTime(targetTime) {
        if (targetTime === undefined || isNaN(targetTime)) return;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        this.timeControlSliding = false;
        this.seekToRealTime(targetTime + musicDelay);
    }

    seekToRealTime(targetRealTime) {
        if (targetRealTime === undefined || isNaN(targetRealTime)) return;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        this.realTime = targetRealTime;
        this.globalTime = targetRealTime - musicDelay;
        this.notifyTime();

        this.opts.updateSlider?.(this.realTime);

        // 1. 立即清除舊音效與佇列，防止歷史音效轟炸
        this.audioManager?.clearSoundQueue();
        this.audioManager?.stopAllScheduledSounds();
        this.audioManager?.stopAllLongSounds();

        // 2. 清理畫面特效
        const renderer = this.opts.getRenderer?.();
        renderer?.clearJudgeEffects();
        renderer?.clearHitEffects();

        // 3. 立即重置所有音符的播放標記，與新時間點對齊
        this.resetNotesPlaybackState(this.globalTime);

        // 4. 背景影片平滑跳轉 (防抖 / fastSeek)
        this.videoSeekDebounce(this.realTime);

        // 5. 若處於播放狀態，重新定位 BGM 與時鐘
        if (this._isPlaying) {
            this.audioManager?.playBGM(this.realTime);
            this.syncPlayTimer();
            this.lastTimestamp = performance.now();
        } else {
            this.opts.draw?.();
        }

        eventBus.emit(EVENTS.PLAYBACK_SEEK, {
            realTime: this.realTime,
            globalTime: this.globalTime
        });
    }

    syncPlayTimer() {
        if (this._isPlaying) {
            this.playStartRealTime = this.realTime;
            this.playStartTimestamp = performance.now();
        }
    }

    _handleSlideInputDebounce() {
        this.timeControlSliding = false;
        const settings = this.opts.getSettings();
        const editorBackgroundVideo = this.opts.editorBackgroundVideo;

        if (!settings.disableVideo && editorBackgroundVideo && editorBackgroundVideo.src) {
            const setTimeAndTryPlay = () => {
                try {
                    editorBackgroundVideo.currentTime = this.realTime;
                } catch (e) {
                    console.warn('設定背景影片時間失敗，將在 canplay 時重試', e);
                }
                const p = editorBackgroundVideo.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(() => {
                        const onCanPlay = () => {
                            editorBackgroundVideo.removeEventListener('canplay', onCanPlay);
                            editorBackgroundVideo.play().catch(() => { });
                        };
                        editorBackgroundVideo.addEventListener('canplay', onCanPlay, { once: true });
                    });
                }
            };

            if (this._isPlaying) {
                if (editorBackgroundVideo.readyState >= 1) {
                    setTimeAndTryPlay();
                } else {
                    editorBackgroundVideo.addEventListener('loadedmetadata', setTimeAndTryPlay, { once: true });
                }
            }
        }

        if (this.opts.projSet) {
            this.opts.projSet('timeControl', this.realTime).catch(() => { });
        }
    }

    _handleVideoSeekDebounce(time) {
        const settings = this.opts.getSettings();
        const editorBackgroundVideo = this.opts.editorBackgroundVideo;
        if (!settings.disableVideo && editorBackgroundVideo && editorBackgroundVideo.readyState >= 1) {
            if (Math.abs(editorBackgroundVideo.currentTime - time) > 0.05) {
                try {
                    if (typeof editorBackgroundVideo.fastSeek === 'function') {
                        editorBackgroundVideo.fastSeek(time);
                    } else {
                        editorBackgroundVideo.currentTime = time;
                    }
                } catch (_) { }
            }
        }
    }

    update(timestamp) {
        const settings = this.opts.getSettings();
        const bp = settings.playbackSpeed || 1;

        if (this.lastTimestamp === null) this.lastTimestamp = timestamp;
        let dt = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        // 限制單幀最大 dt (最高 100ms，突發暴衝平滑至 16ms)，避免跳轉或切換分頁後畫面/音效大跳幀
        if (dt > 0.1) dt = 0.016;

        const isPlaying = this._isPlaying;
        const musicDelay = this.opts.getMusicDelay?.() || 0;
        const endTime = this.opts.getEndTime?.() || 1;

        if (isPlaying) {
            let timeUpdatedByBgm = false;
            if (!this.timeControlSliding && this.audioManager?.haveBGM()) {
                const bgmTime = this.audioManager.getBGMTime();
                if (bgmTime !== null) {
                    this.realTime = bgmTime;
                    this.globalTime = this.realTime - musicDelay;
                    timeUpdatedByBgm = true;
                    this.playStartTimestamp = performance.now();
                    this.playStartRealTime = this.realTime;
                }
            }

            if (!timeUpdatedByBgm && !this.timeControlSliding) {
                if (this.playStartTimestamp === null) {
                    this.playStartTimestamp = performance.now();
                    this.playStartRealTime = this.realTime;
                }
                const elapsed = (performance.now() - this.playStartTimestamp) / 1000;
                this.realTime = this.playStartRealTime + elapsed * bp;
                this.globalTime = this.realTime - musicDelay;
            }
            this.notifyTime();

            // 游標跟隨邏輯
            const nowIndex = this.opts.getNowIndex?.() || 0;
            const editorInput = this.opts.editorInput;
            const rawData = this.opts.getRawData?.() || [];
            const dataIndexToTime = this.opts.getDataIndexToTime?.() || [];

            if (settings.cursorFollow && nowIndex !== this.lastCursorIndex && editorInput) {
                this.lastCursorIndex = nowIndex;
                this.cursorLastIndexTime = dataIndexToTime[nowIndex] || 0;
                const point = this.opts.getCharOffsetAtIndex
                    ? this.opts.getCharOffsetAtIndex(nowIndex)
                    : rawData.slice(0, nowIndex + 1).join(',').length;
                if (editorInput.selectionStart !== point || editorInput.selectionEnd !== point) {
                    if (typeof editorInput.setSelectionRange === 'function') {
                        editorInput.setSelectionRange(point, point);
                    } else {
                        editorInput.selectionStart = point;
                        editorInput.selectionEnd = point;
                    }
                }
            }

            // 背景影片同步邏輯
            const editorBackgroundVideo = this.opts.editorBackgroundVideo;
            if (!settings.disableVideo && (this.bgmUpdateTimer === null || this.bgmUpdateTimer >= 1)) {
                if (editorBackgroundVideo?.src && editorBackgroundVideo.readyState >= 2) {
                    const nowSec = performance.now() / 1000;
                    const diff = Math.abs(editorBackgroundVideo.currentTime - this.realTime);
                    if (diff > VIDEO_SEEK_THRESHOLD && (nowSec - this.lastVideoSeekTime) >= VIDEO_MIN_SEEK_INTERVAL) {
                        try {
                            editorBackgroundVideo.currentTime = this.realTime;
                            this.lastVideoSeekTime = nowSec;
                        } catch (e) {
                            console.warn('背景影片 seek 失敗', e);
                        }
                    }
                }
                this.bgmUpdateTimer = 0;
            }

            this.bgmUpdateTimer = (this.bgmUpdateTimer || 0) + dt;
            this.opts.updateSlider?.(this.realTime);

            // 播放結束判定
            if (this.globalTime >= endTime) {
                this._isPlaying = false;
                this.globalTime = endTime;
                this.opts.updateSlider?.(endTime);
                this.playStartTimestamp = null;
                if (!this.keepRenderingWhilePause) {
                    this.cancelNextFrame();
                }
                eventBus.emit(EVENTS.PLAYBACK_STATE_CHANGED, {
                    isPlaying: false,
                    realTime: this.realTime,
                    globalTime: this.globalTime
                });
            }
        }

        // 渲染與幀調度
        if (isPlaying || this.keepRenderingWhilePause) {
            let shouldDraw = isPlaying || this._dirty;
            if (!shouldDraw && this.keepRenderingWhilePause) {
                const renderer = this.opts.getRenderer?.();
                if (renderer) {
                    shouldDraw = (renderer.judgeEffects && renderer.judgeEffects.length > 0) ||
                                 (renderer.hitEffects && renderer.hitEffects.length > 0) ||
                                 (renderer.hanabiEffects && renderer.hanabiEffects.length > 0);
                }
            }
            if (shouldDraw) {
                this._dirty = false;
                this.opts.draw?.(dt);
            }
            this.requestNextFrame(this.update);
        } else {
            this.lastTimestamp = null;
        }
    }
}
