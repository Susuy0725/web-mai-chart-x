import { idbGet, idbSet } from "./indexDB.js";

/**
 * Utility helper to clamp volume values strictly within [min, max].
 * Prevents out-of-range volume values or invalid gain inputs.
 */
const clampVolume = (val, max = 1.0, min = 0.0) => {
    const num = Number(val);
    if (isNaN(num)) return min;
    return Math.max(min, Math.min(max, num));
};

class AudioManager {
    constructor() {
        this.globalGain = 0.65; // 全域預設音量
        this.bgmVolume = 0.8;    // BGM 預設音量
        this.sfxMasterVolume = 0.5; // 音效主音量
        this.MAX_VOLUME_LIMIT = 1.0; // 聲音音效閾值
        this.activeLongSounds = new Map();

        // 初始化 Web Audio 上下文與 AudioNode 節點圖
        this.reinitContext();

        this.bufferMap = new Map();
        this.playingSources = new Map();

        this.soundQueue = [];
        this.lastQueuedTimes = new Map();
        this.MIN_INTERVAL = 15; // ms (防重複發聲/機槍音)

        this.bgmBuffer = null;
        this.bgmSource = null;
        this.bgmStartTime = 0;
        this.bgmOffset = 0;
        this.playbackRate = 1.0;

        this.soundFiles = {
            'clock': './Sounds/clock.wav',
            'judge': './Sounds/judge.wav',
            'judge_ex': './Sounds/judge_ex.wav',
            'judge_break': './Sounds/judge_break.wav',
            'answer': './Sounds/answer.wav',
            'break': './Sounds/break.wav',
            'slide': './Sounds/slide.wav',
            'break_slide_start': './Sounds/break_slide_start.wav',
            'judge_break_slide': './Sounds/judge_break_slide.wav',
            'touch': './Sounds/touch.wav',
            'hanabi': './Sounds/hanabi.wav',
            'touchHold_riser': './Sounds/touchHold_riser.wav',
            'track_start': './Sounds/track_start.wav',
            'all_perfect': './Sounds/all_perfect.wav'
        };

        this.sfxVolumes = {
            'clock': 0.8,
            'answer': 1.0,
            'judge': 0.4,
            'judge_ex': 0.4,
            'judge_break': 0.4,
            'judge_break_slide': 0.4,
            'break': 0.4,
            'slide': 0.4,
            'break_slide_start': 0.4,
            'touch': 0.4,
            'hanabi': 0.6,
            'touchHold_riser': 0.6,
            'track_start': 0.8,
            'all_perfect': 1.0,
        };

        this.activeLongSounds = new Map();
        this.loopPoints = {
            'touchHold_riser': { start: 10, end: 11.8 }
        };
        this.scheduledSources = new Set();

        this.lastResumeAttemptTime = 0;
        this.lastReinitTime = 0;

        // 綁定手勢自動解鎖懸掛狀態的 AudioContext
        this.setupUnlockListeners();
    }

    /**
     * 綁定頁面互動事件，當 AudioContext 被瀏覽器自動防禦掛起時自動 Resume
     */
    setupUnlockListeners() {
        if (typeof window === 'undefined') return;
        const unlock = () => {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().then(() => {
                    console.log('[Audio] AudioContext unlocked by user gesture.');
                }).catch(() => { });
            }
        };
        window.addEventListener('pointerdown', unlock, { once: true, capture: true });
        window.addEventListener('keydown', unlock, { once: true, capture: true });
    }

    /**
     * 重新初始化 AudioContext，主要用於裝置故障、關閉重啟等防禦性復原
     */
    reinitContext() {
        const now = Date.now();
        if (typeof window !== 'undefined') {
            window.__lastAudioReinitTime = window.__lastAudioReinitTime || 0;
            if (now - window.__lastAudioReinitTime < 5000) {
                return;
            }
            window.__lastAudioReinitTime = now;
        }

        try {
            if (this.ctx) {
                try {
                    this.ctx.close();
                } catch (e) { }
            }

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();

            // 建立 Peak Limiter / Master Compressor 節點，防止多重音效疊加輸出超過 0dBFS 閾值爆音
            this.masterCompressor = this.ctx.createDynamicsCompressor();
            const nowTime = this.ctx.currentTime;
            this.masterCompressor.threshold.setValueAtTime(-1.5, nowTime); // -1.5 dB 門檻
            this.masterCompressor.knee.setValueAtTime(0, nowTime);         // 硬折點 (Hard knee)
            this.masterCompressor.ratio.setValueAtTime(20, nowTime);       // 20:1 Limiter 磚牆限制
            this.masterCompressor.attack.setValueAtTime(0.003, nowTime);   // 3ms 極速攻擊時間捕捉 Peak
            this.masterCompressor.release.setValueAtTime(0.1, nowTime);    // 100ms 平滑釋放時間
            this.masterCompressor.connect(this.ctx.destination);

            // 建立總音量控制節點 (Master Gain)
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = clampVolume(this.globalGain, this.MAX_VOLUME_LIMIT);
            this.masterGain.connect(this.masterCompressor);

            // BGM Gain 節點
            this.bgmGainNode = this.ctx.createGain();
            this.bgmGainNode.gain.value = clampVolume(this.bgmVolume, this.MAX_VOLUME_LIMIT);
            this.bgmGainNode.connect(this.masterGain);

            // SFX Master Gain 節點
            this.sfxGainNode = this.ctx.createGain();
            this.sfxGainNode.gain.value = clampVolume(this.sfxMasterVolume, this.MAX_VOLUME_LIMIT);
            this.sfxGainNode.connect(this.masterGain);

            // Long Sound Gain 節點
            this.longSoundGainNode = this.ctx.createGain();
            this.longSoundGainNode.gain.value = 1.0;

            // Long Sound Compressor
            /*this.longSoundCompressor = this.ctx.createDynamicsCompressor();
            this.longSoundCompressor.threshold.setValueAtTime(-16, nowTime);
            this.longSoundCompressor.knee.setValueAtTime(8, nowTime);
            this.longSoundCompressor.ratio.setValueAtTime(4, nowTime);
            this.longSoundCompressor.attack.setValueAtTime(0.005, nowTime);
            this.longSoundCompressor.release.setValueAtTime(0.25, nowTime);

            this.longSoundGainNode.connect(this.longSoundCompressor);
            this.longSoundCompressor.connect(this.sfxGainNode);*/
            this.longSoundGainNode.connect(this.sfxGainNode);
            if (this.activeLongSounds) this.activeLongSounds.clear();

            this.ctx.addEventListener('statechange', () => {
                console.log(`[Audio] AudioContext state changed to: ${this.ctx.state}`);
            });
        } catch (e) {
            console.error('[Audio] Failed to initialize AudioContext:', e);
        }
    }

    /**
     * 防禦性確認 AudioContext 狀態並嘗試重啟或解鎖
     */
    ensureContextSync() {
        if (!this.ctx || this.ctx.state === 'closed') {
            console.warn('[Audio] AudioContext is null or closed. Re-initializing...');
            this.reinitContext();
            return;
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            const now = Date.now();
            if (typeof window !== 'undefined') {
                window.__lastAudioResumeAttemptTime = window.__lastAudioResumeAttemptTime || 0;
                if (now - window.__lastAudioResumeAttemptTime > 3000) {
                    window.__lastAudioResumeAttemptTime = now;
                    console.log('[Audio] AudioContext is suspended. Attempting to resume...');
                    this.ctx.resume().catch((err) => {
                        console.warn('[Audio] Failed to resume AudioContext:', err);
                    });
                }
            } else {
                if (!this.lastResumeAttemptTime || now - this.lastResumeAttemptTime > 3000) {
                    this.lastResumeAttemptTime = now;
                    this.ctx.resume().catch((err) => {
                        console.warn('[Audio] Failed to resume AudioContext:', err);
                    });
                }
            }
        }
    }

    /**
     * 設定並載入背景音樂 (支援 URL 或 Blob/File)
     */
    async setBackgroundMusic(source, originalFile = null) {
        this.ensureContextSync();
        try {
            this.bgmFile = originalFile || source;

            let arrayBuffer;
            if (source instanceof Blob) {
                arrayBuffer = await source.arrayBuffer();
            } else {
                const response = await fetch(source);
                if (!response.ok) {
                    throw new Error(`Failed to fetch BGM: HTTP ${response.status}`);
                }
                arrayBuffer = await response.arrayBuffer();
            }

            this.bgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log(`[Audio] BGM 載入完成，長度: ${this.bgmBuffer.duration.toFixed(2)}s`);
        } catch (e) {
            console.error(`[Audio] BGM 載入失敗`, e);
        }
    }

    async removeBackgroundMusic() {
        this.stopBGM();
        this.bgmBuffer = null;
        this.bgmFile = null;
    }

    haveBGM() {
        return !!this.bgmBuffer;
    }

    getBGMFile() {
        if (this.bgmFile instanceof Blob) {
            return this.bgmFile;
        }
        if (typeof this.bgmFile === 'string') {
            return this.bgmFile;
        }
        return null;
    }

    /**
     * 調整 BGM 音量 (嚴格限制在 0.0 ~ 1.0 閾值之間)
     */
    setBGMVolume(value) {
        this.ensureContextSync();
        this.bgmVolume = clampVolume(value, this.MAX_VOLUME_LIMIT);
        this.bgmGainNode.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }

    /**
     * 設定背景音樂播放速率
     */
    setPlaybackRate(rate) {
        this.ensureContextSync();
        this.playbackRate = Math.max(0.1, Math.min(4.0, Number(rate) || 1.0));
        if (this.bgmSource) {
            this.bgmSource.playbackRate.setTargetAtTime(this.playbackRate, this.ctx.currentTime, 0.05);
        }
    }

    /**
     * 播放背景音樂
     */
    playBGM(startTime = 0, volume = 1) {
        if (!this.bgmBuffer) return;
        this.ensureContextSync();
        this.stopBGM();

        this.bgmSource = this.ctx.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;
        this.bgmSource.playbackRate.value = this.playbackRate;

        const sourceGain = this.ctx.createGain();
        const safeVol = clampVolume(typeof volume === 'number' ? volume : this.bgmVolume, this.MAX_VOLUME_LIMIT);
        sourceGain.gain.value = safeVol;
        this.bgmSource.connect(sourceGain);
        sourceGain.connect(this.bgmGainNode);

        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.bgmStartTime = this.ctx.currentTime;
        this.bgmOffset = Math.max(0, startTime);

        this.bgmSource.start(0, this.bgmOffset);
    }

    /**
     * 停止背景音樂
     */
    stopBGM() {
        this.stopAllScheduledSounds();
        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) { }
            this.bgmSource = null;
        }
    }

    stopAllScheduledSounds() {
        for (const src of this.scheduledSources) {
            try {
                src.stop();
            } catch (e) { }
        }
        this.scheduledSources.clear();
    }

    /**
     * 取得目前 BGM 播放的精確秒數 (同步核心)
     */
    getBGMTime() {
        if (!this.bgmSource || this.ctx.state === 'suspended') return null;
        const elapsedContextTime = this.ctx.currentTime - this.bgmStartTime;
        return (elapsedContextTime * this.playbackRate) + this.bgmOffset;
    }

    getBGMDuration() {
        return this.bgmBuffer ? this.bgmBuffer.duration : 0;
    }

    /**
     * 動態調整全域音量 (限制在閾值內)
     */
    setGlobalVolume(value) {
        this.ensureContextSync();
        this.globalGain = clampVolume(value, this.MAX_VOLUME_LIMIT);
        this.masterGain.gain.setTargetAtTime(this.globalGain, this.ctx.currentTime, 0.05);
    }

    /**
     * 動態調整音效主音量 (限制在閾值內)
     */
    setSFXVolume(value) {
        this.ensureContextSync();
        this.sfxMasterVolume = clampVolume(value, this.MAX_VOLUME_LIMIT);
        this.sfxGainNode.gain.setTargetAtTime(this.sfxMasterVolume, this.ctx.currentTime, 0.05);
    }

    /**
     * 動態調整各個別音效音量表 (限制在閾值內)
     */
    setSFXVolumes(volumes) {
        for (const [key, vol] of Object.entries(volumes)) {
            if (this.sfxVolumes[key] !== undefined) {
                this.sfxVolumes[key] = clampVolume(vol, this.MAX_VOLUME_LIMIT);
            }
        }
        this._updateLongSoundGains();
    }

    /**
     * 初始化並預載入所有音效
     */
    async init(onProgress) {
        this.ensureContextSync();
        const keys = Object.keys(this.soundFiles);
        const total = keys.length;
        let loaded = 0;

        const loadTasks = Object.entries(this.soundFiles).map(async ([key, url]) => {
            try {
                let arrayBuffer = await idbGet(`sfx_cache_${key}`);

                if (!arrayBuffer) {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    arrayBuffer = await response.arrayBuffer();
                    await idbSet(`sfx_cache_${key}`, arrayBuffer);
                }

                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
                this.bufferMap.set(key, audioBuffer);
            } catch (e) {
                console.error(`[Audio] ${key} 載入失敗:`, e);
            } finally {
                loaded++;
                if (onProgress) onProgress((loaded / total) * 100, key);
            }
        });

        await Promise.all(loadTasks);
    }

    queueSoundSingle(sample, targetTime) {
        const vol = clampVolume(this.sfxVolumes[sample] ?? 1.0, this.MAX_VOLUME_LIMIT);
        this._checkAndPush(sample, targetTime, true, vol);
    }

    queueSound(note, targetTime) {
        const now = performance.now();
        if (note._lastQueued && (now - note._lastQueued < this.MIN_INTERVAL)) return;
        note._lastQueued = now;

        const events = this.getSfxEventsForNote(note, targetTime);
        for (const ev of events) {
            this._checkAndPush(ev.key, ev.time, ev.isMono, ev.volume);
        }
    }

    getSfxEventsForNote(note, targetTime) {
        const events = [];
        let key = 'judge';
        let isMono = true;

        switch (note.type) {
            case 'tap':
                if (note.isMine) {
                    key = 'answer';
                    break;
                }
                if (note.isEx) key = 'judge_ex';
                if (note.isBreak) {
                    key = 'judge_break';
                    events.push({ key: 'break', time: targetTime, isMono: true, volume: clampVolume(this.sfxVolumes['break'], this.MAX_VOLUME_LIMIT) });
                }
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: clampVolume(this.sfxVolumes['answer'], this.MAX_VOLUME_LIMIT) });
                break;
            case 'hold':
                if (note.isMine) {
                    key = 'answer';
                    break;
                }
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: clampVolume(this.sfxVolumes['answer'], this.MAX_VOLUME_LIMIT) });
                if (!note._startEffectPlayed) {
                    if (note.isBreak) {
                        key = 'judge_break';
                        events.push({ key: 'break', time: targetTime, isMono: true, volume: clampVolume(this.sfxVolumes['break'], this.MAX_VOLUME_LIMIT) });
                    } else {
                        if (note.isEx) key = 'judge_ex';
                        else key = 'judge';
                    }
                    isMono = false;
                } else {
                    return events;
                }
                break;
            case 'touch':
                key = 'touch';
                isMono = false;
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: clampVolume(this.sfxVolumes['answer'], this.MAX_VOLUME_LIMIT) });
                if (note.isHanabi) {
                    if (note.holdDuration >= 0) {
                        if (note._startEffectPlayed) {
                            key = 'hanabi';
                            isMono = true;
                        } else {
                            return events;
                        }
                    } else {
                        key = 'hanabi';
                        isMono = true;
                    }
                }
                if (note._startEffectPlayed && !note.isHanabi) return events;
                break;
            case 'slide':
                if (note.isMine) {
                    key = '';
                    break;
                }
                if (!note._startEffectPlayed && note.isBreak) {
                    events.push({ key: 'break_slide', time: targetTime, isMono: true, volume: clampVolume(this.sfxVolumes['break_slide'], this.MAX_VOLUME_LIMIT) });
                    key = 'break_slide_start';
                    isMono = false;
                } else {
                    if (note.isBreak) {
                        key = 'judge_break_slide';
                        isMono = false;
                    } else {
                        key = 'slide';
                        isMono = false;
                    }
                }
                break;
            default:
                return events;
        }

        events.push({ key, time: targetTime, isMono, volume: clampVolume(this.sfxVolumes[key], this.MAX_VOLUME_LIMIT) });
        return events;
    }

    /**
     * 內部檢查冷卻時間並使用二分插入佇列
     */
    _checkAndPush(key, targetTime, isMono, volume = 1) {
        const now = performance.now();
        const lastTime = this.lastQueuedTimes.get(key) || 0;

        if (now - lastTime < this.MIN_INTERVAL) return;

        this.lastQueuedTimes.set(key, now);
        const item = { key, targetTime, isMono, volume: clampVolume(volume, this.MAX_VOLUME_LIMIT) };

        // 使用 O(log N) 二分搜尋插入維持有序，取代 O(N log N) 排序
        const len = this.soundQueue.length;
        if (len === 0 || targetTime >= this.soundQueue[len - 1].targetTime) {
            this.soundQueue.push(item);
        } else {
            let low = 0, high = len;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (this.soundQueue[mid].targetTime <= targetTime) low = mid + 1;
                else high = mid;
            }
            this.soundQueue.splice(low, 0, item);
        }
    }

    /**
     * 在遊戲 Loop (requestAnimationFrame) 中呼叫，處理播放
     */
    update(globalTime) {
        const lookAhead = 0.1; // 100ms look-ahead
        while (this.soundQueue.length > 0 && globalTime + lookAhead >= this.soundQueue[0].targetTime) {
            const { key, isMono, volume, targetTime } = this.soundQueue.shift();
            const playTime = this.ctx.currentTime + (targetTime - globalTime) / this.playbackRate;
            this.play(key, isMono, volume, playTime);
        }
    }

    /**
     * 執行最終播放 (Web Audio API 核心)
     */
    play(key, isMono = false, volume = 1, playTime = null) {
        this.ensureContextSync();
        const buffer = this.bufferMap.get(key);
        if (!buffer) return;

        if (isMono && this.playingSources.has(key)) {
            try {
                const oldSource = this.playingSources.get(key);
                const stopTime = playTime !== null ? Math.max(this.ctx.currentTime, playTime) : this.ctx.currentTime;
                oldSource.stop(stopTime);
            } catch (e) { }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = clampVolume(volume, this.MAX_VOLUME_LIMIT);

        source.connect(gainNode);
        gainNode.connect(this.sfxGainNode);

        if (isMono) {
            this.playingSources.set(key, source);
            source.onended = () => {
                if (this.playingSources.get(key) === source) {
                    this.playingSources.delete(key);
                }
            };
        }

        if (playTime !== null) {
            const timeToPlay = Math.max(this.ctx.currentTime, playTime);
            source.start(timeToPlay);
            this.scheduledSources.add(source);
            const prevOnEnded = source.onended;
            source.onended = () => {
                this.scheduledSources.delete(source);
                if (prevOnEnded) prevOnEnded();
            };
        } else {
            source.start(0);
        }
    }

    startLongSound(id, key, offset = 0, volume = null) {
        const buffer = this.bufferMap.get(key);
        const loop = this.loopPoints[key];
        if (!buffer || this.activeLongSounds.has(id)) return;

        this.ensureContextSync();

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        let startTimeWithinBuffer = offset;

        if (loop) {
            source.loop = true;
            source.loopStart = loop.start;
            source.loopEnd = loop.end;

            if (offset >= loop.end) {
                const loopDuration = loop.end - loop.start;
                const timeInsideLoop = (offset - loop.end) % loopDuration;
                startTimeWithinBuffer = loop.start + timeInsideLoop;
            }
        } else {
            if (offset >= buffer.duration) return;
        }

        const gainNode = this.ctx.createGain();
        const requestedVol = (volume !== null && volume !== undefined) ? volume : 1.0;
        this.activeLongSounds.set(id, { source, gainNode, key, volume: requestedVol });

        const keyVol = this.sfxVolumes[key] ?? 1.0;
        const baseVol = keyVol * requestedVol;

        let count = 0;
        for (const item of this.activeLongSounds.values()) {
            if (item.key === key) count++;
        }
        if (count === 0) count = 1;

        const initialGain = clampVolume(baseVol / count, this.MAX_VOLUME_LIMIT);
        gainNode.gain.setValueAtTime(initialGain, this.ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(this.longSoundGainNode);

        source.start(0, Math.max(0, startTimeWithinBuffer));
        this._updateLongSoundGains();
    }

    _updateLongSoundGains() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const keyCounts = new Map();
        for (const item of this.activeLongSounds.values()) {
            keyCounts.set(item.key, (keyCounts.get(item.key) || 0) + 1);
        }

        for (const item of this.activeLongSounds.values()) {
            const count = keyCounts.get(item.key) || 1;
            const keyVol = this.sfxVolumes[item.key] ?? 1.0;
            const requestedVol = (item.volume !== null && item.volume !== undefined) ? item.volume : 1.0;
            const baseVol = keyVol * requestedVol;
            const targetGain = clampVolume(baseVol / count, this.MAX_VOLUME_LIMIT);

            item.gainNode.gain.setTargetAtTime(targetGain, now, 0.02);
        }
    }

    stopLongSound(id) {
        if (this.activeLongSounds.has(id)) {
            const { source, gainNode } = this.activeLongSounds.get(id);
            gainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.01);
            try {
                source.stop(this.ctx.currentTime + 0.05);
            } catch (e) { }
            this.activeLongSounds.delete(id);
            this._updateLongSoundGains();
        }
    }

    stopAllLongSounds() {
        for (const id of Array.from(this.activeLongSounds.keys())) {
            this.stopLongSound(id);
        }
        this.activeLongSounds.clear();
    }

    clearSoundQueue() {
        this.soundQueue = [];
    }
}

export const audioManager = new AudioManager();
