import { idbGet, idbSet } from "./indexDB.js";

export const
    scaleBase = 100,
    innerCirleBase = (() => { const innerCirleScale = 0.889; return scaleBase * innerCirleScale / 2 })();

export function imgNotExists(image) {
    if (!image || !image.complete || image.naturalWidth === 0) {
        return true;
    }
    return false;
}
export function getButton(action, type = "control") {
    return document.querySelector(`${type === "control" ? "#playControls .controlButton" : "#topUtilityBtns .utilityButton"}[data-buttonAction="${action}"]`);
}
/**
* @param {Function} func - 要執行的函式
* @param {number} delay - 延遲時間（毫秒）
*/
export function debounce(func, delay = 300) {
    let timer = null;

    return function (...args) {
        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
export function parseTag(str, open, close, specialCase = false) {
    const regex = new RegExp(`\\${open}([^\\${open}\\${close}]*)\\${close}`, 'g');
    const matches = [...str.matchAll(regex)];
    const residue = str.replace(regex, '');
    if (residue.includes(open) || residue.includes(close)) {
        return { error: `Invalid format: nested or unmatched ${open}${close}` };
    }
    let lastValue = null;
    for (const match of matches) {
        const val = match[1].trim();
        if (val.startsWith('#') && specialCase) { // direct assign #duration
            const duration = parseFloat(val.substring(1));
            if (isNaN(duration) || duration < 0) {
                return { error: `Invalid duration value in direct assign ${open}${close}: must be a non-negative number` };
            }
            return { residue: residue.trim(), value: duration, override: true };
        }
        if (val === '' || isNaN(val) || parseFloat(val) <= 0) {
            return { error: `Invalid value in ${open}${close}: must be a positive number` };
        }
        lastValue = parseFloat(val);
    }
    return { residue: residue.trim(), value: lastValue };
}
export function parseBeats(str, bpm, slide = false) {
    if (slide) {
        if (str.includes("##")) {
            const parts = str.split("##");
            if (parts.length === 3) { // dt##bpm##t:b
                const delay = parseFloat(parts[0]);
                const overrideBpm = parseFloat(parts[1]);
                if (isNaN(delay) || delay < 0 || isNaN(overrideBpm) || overrideBpm <= 0) {
                    console.warn("Invalid delay or bpm value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                const [time, beat] = parts[2].split(":");
                if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
                    console.warn("Invalid time or beat value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                return { time: (240 / overrideBpm) * (parseFloat(beat) / parseFloat(time)), delay: delay };
            } else if (parts.length === 2) { // dt##t:b dt##t
                const delay = parseFloat(parts[0]);
                if (isNaN(delay) || delay < 0) {
                    console.warn("Invalid delay value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                if (parts[1].includes(":")) {
                    const [time, beat] = parts[1].split(":");
                    if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
                        console.warn("Invalid time or beat value in slide note:", str);
                        return { time: -1, delay: -1 };
                    }
                    return { time: (240 / bpm) * (parseFloat(beat) / parseFloat(time)), delay: delay };
                }
                const time = parseFloat(parts[1]);
                if (isNaN(time) || time < 0) {
                    console.warn("Invalid time value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                return { time: time, delay: delay };
            }
        } else if (str.includes("#") && !str.includes(":")) { // bpm#t
            const [bpmStr, timeStr] = str.split("#").map(s => s.trim());
            const overrideBpm = parseFloat(bpmStr);
            const time = parseFloat(timeStr);
            if (isNaN(overrideBpm) || overrideBpm <= 0 || isNaN(time) || time < 0) {
                console.warn("Invalid bpm or time value in slide note:", str);
                return { time: -1, delay: -1 };
            }
            return { time: time, delay: (60 / overrideBpm) };
        }
    } else {
        if (str.startsWith('#')) { // direct assign #duration
            const duration = parseFloat(str.substring(1));
            if (isNaN(duration) || duration < 0) {
                console.warn("Invalid duration value in direct assign note:", str);
                return { time: -1, delay: -1 };
            }
            return { time: duration, delay: 0 };
        }
    }
    if (str.includes(":")) { // bpm#t:b or t:b
        const [time, beat] = str.split(":");
        if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
            console.warn("Invalid time or beat value in hold note:", str);
            return { time: -1, delay: -1 };
        }
        if (time.includes("#")) {
            const [bpmStr, timeStr] = time.split("#");
            const overrideBpm = parseFloat(bpmStr);
            return { time: (240 / overrideBpm) * (parseFloat(beat) / parseFloat(timeStr)), delay: (60 / overrideBpm) };
        } else {
            return { time: (240 / bpm) * (parseFloat(beat) / parseFloat(time)), delay: (60 / bpm) };
        }
    }
    console.warn("Invalid hold duration format or empty:", str);
    return { time: -1, delay: -1 };
}
export class PathRecorder {
    constructor() {
        this.segments = [];
        this.totalLength = 0;
        this.currentPoint = { x: 0, y: 0 };
    }

    moveTo(x, y) {
        this.currentPoint = { x, y };
    }

    lineTo(x, y) {
        const x1 = this.currentPoint.x;
        const y1 = this.currentPoint.y;
        const length = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

        this.segments.push({
            type: 'line',
            start: { x: x1, y: y1 },
            end: { x, y },
            length: length,
            cumLength: this.totalLength
        });

        this.totalLength += length;
        this.currentPoint = { x, y };
    }

    // startAngle, endAngle 使用弧度 (Radian)
    arc(cx, cy, r, startAngle, endAngle, anticlockwise = false, laps = 0) {
        let diff = endAngle - startAngle;

        // 1. 基礎處理：確保方向與角度差在 2*PI 以內
        if (!anticlockwise && diff <= 0) diff += Math.PI * 2;
        if (anticlockwise && diff >= 0) diff -= Math.PI * 2;

        // 2. 加入額外的圈數
        const extraRotation = Math.PI * 2 * laps;
        if (anticlockwise) {
            diff -= extraRotation; // 逆時針方向，角度差為負值
        } else {
            diff += extraRotation; // 順時針方向，角度差為正值
        }

        const length = Math.abs(diff * r);

        this.segments.push({
            type: 'arc',
            cx, cy, r, startAngle, endAngle,
            diff, // 這裡的 diff 現在包含了總旋轉量
            length,
            cumLength: this.totalLength
        });

        this.totalLength += length;

        // 更新當前點位置
        this.currentPoint = {
            x: cx + r * Math.cos(endAngle),
            y: cy + r * Math.sin(endAngle)
        };
    }

    getPointAt(t) {
        if (this.segments.length === 0) return { ...this.currentPoint, rot: 0 };

        // 邊界處理
        if (t <= 0) t = 0;
        if (t >= 1) t = 1;

        const targetLen = t * this.totalLength;
        const seg = this.segments.find(s => targetLen >= s.cumLength && targetLen <= s.cumLength + s.length)
            || this.segments[this.segments.length - 1];

        const localT = seg.length === 0 ? 1 : (targetLen - seg.cumLength) / seg.length;

        if (seg.type === 'line') {
            // 直線的朝向就是起點到終點的角度
            const rot = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x);
            return {
                x: seg.start.x + (seg.end.x - seg.start.x) * localT,
                y: seg.start.y + (seg.end.y - seg.start.y) * localT,
                rot: rot
            };
        } else if (seg.type === 'arc') {
            const currentAngle = seg.startAngle + seg.diff * localT;
            // 圓弧切線角度：當前圓心角 + (順時針 90度 或 逆時針 -90度)
            const rot = currentAngle + (seg.diff > 0 ? Math.PI / 2 : -Math.PI / 2);
            return {
                x: seg.cx + seg.r * Math.cos(currentAngle),
                y: seg.cy + seg.r * Math.sin(currentAngle),
                rot: rot
            };
        }
    }

    lineToArc(cx, cy, r, startAngle) {
        const x = cx + r * Math.cos(startAngle);
        const y = cy + r * Math.sin(startAngle);
        this.lineTo(x, y);
    }
}
/*export function drawArrowShape(ctx) {
    const size = 2.5; // 箭頭大小
    ctx.beginPath();
    ctx.moveTo(-size, -size); // 左後
    ctx.lineTo(size, 0);      // 尖端 (朝向前方)
    ctx.lineTo(-size, size);  // 右後
    ctx.lineTo(-size * 0.6, 0); // 往內凹一點點，看起來更像箭頭
    ctx.closePath();
    ctx.fill();
}*/
export const touchRefPos = {
    A: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 1.5) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.833,
            y: Math.sin(a) * innerCirleBase * 0.833,
            rot: a + Math.PI / 2
        };
    }),
    B: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 1.5) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.458,
            y: Math.sin(a) * innerCirleBase * 0.458,
            rot: a + Math.PI / 2
        };
    }),
    C: [{ x: 0, y: 0 }],
    D: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 2) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.854,
            y: Math.sin(a) * innerCirleBase * 0.854,
            rot: a + Math.PI / 2
        };
    }),
    E: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 2) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.645,
            y: Math.sin(a) * innerCirleBase * 0.645,
            rot: a + Math.PI / 2
        };
    })
};
export const noteRefPos = Array.from({ length: 8 }, (_, i) => {
    const a = (i - 1.5) * Math.PI / 4;
    return {
        x: Math.cos(a) * innerCirleBase,
        y: Math.sin(a) * innerCirleBase,
        rot: a + Math.PI / 2
    };
});
export const visualNoteRefPos = Array.from({ length: 8 }, (_, i) => {
    return {
        x: (i - 3.5) * innerCirleBase / 4,
    };
});
class AudioManager {
    constructor() {
        this.globalGain = 0.8; // 預設音量

        // 1. 初始化 Web Audio 上下文
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // --- 新增：建立總音量控制節點 ---
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.globalGain;
        this.masterGain.connect(this.ctx.destination); // 最終輸出
        // ---------------------------

        this.bufferMap = new Map();
        this.playingSources = new Map();

        this.soundQueue = [];
        this.lastQueuedTimes = new Map();
        this.MIN_INTERVAL = 15;

        this.bgmBuffer = null;
        this.bgmSource = null;
        this.bgmGainNode = this.ctx.createGain();
        this.bgmGainNode.connect(this.masterGain);
        this.bgmVolume = 0.8;
        this.bgmGainNode.gain.value = this.bgmVolume;
        this.bgmStartTime = 0; // 紀錄是在全域時間第幾秒按下播放的
        this.bgmOffset = 0;    // 紀錄是從歌曲的第幾秒開始播的

        this.sfxGainNode = this.ctx.createGain();
        this.sfxGainNode.connect(this.masterGain);
        this.sfxMasterVolume = 0.5;
        this.sfxGainNode.gain.value = this.sfxMasterVolume;

        this.longSoundGainNode = this.ctx.createGain();
        this.longSoundGainNode.gain.value = 0.5;

        // 建立 DynamicsCompressorNode，避免多個 long sound 疊加造成爆音
        this.longSoundCompressor = this.ctx.createDynamicsCompressor();
        const now = this.ctx.currentTime;
        // 初始參數，可依需求微調
        this.longSoundCompressor.threshold.setValueAtTime(-16, now);
        this.longSoundCompressor.knee.setValueAtTime(8, now);
        this.longSoundCompressor.ratio.setValueAtTime(4, now);
        this.longSoundCompressor.attack.setValueAtTime(0.005, now);
        this.longSoundCompressor.release.setValueAtTime(0.25, now);

        // 連線：longGain -> compressor -> sfx master
        this.longSoundGainNode.connect(this.longSoundCompressor);
        this.longSoundCompressor.connect(this.sfxGainNode);

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
            'touchHold_riser': './Sounds/touchHold_riser.wav'
        };

        this.sfxVolumes = {
            'clock': 0.8,
            'answer': 1,
            'judge': 0.4,
            'judge_ex': 0.4,
            'judge_break': 0.4,
            'judge_break_slide': 0.4,
            'break': 0.4,
            'slide': 0.4,
            'break_slide_start': 0.4,
            'touch': 0.4,
            'hanabi': 0.6,
        }

        this.activeLongSounds = new Map();
        this.loopPoints = {
            'touchHold_riser': { start: 10, end: 11.8 }
        };
    }

    /**
     * 設定並載入背景音樂 (支援 URL 或 Blob/File)
     * @param {string|Blob} source - 音訊來源
     * @param {File} originalFile - 原始 File 對象 (用於導出時保留檔案名和二進制數據)
     */
    async setBackgroundMusic(source, originalFile = null) {
        try {
            // 優先保存原始 File 對象，否則保存來源
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

            // 進行解碼
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
        // 如果背景音樂是 File/Blob，直接回傳；若是 URL，嘗試從 gain node 下載或回傳 null
        // 主要用於「打包/儲存當前背景音樂」需求。
        if (this.bgmFile instanceof Blob) {
            return this.bgmFile;
        }

        // 如果是 URL 字串，無法直接回傳 Blob，但我們可提供可下載的 URL
        if (typeof this.bgmFile === 'string') {
            return this.bgmFile; // 由呼叫端自行處理 fetch/Blob 轉換
        }

        return null;
    }

    /**
    * 調整 BGM 音量 (0.0 到 1.0)
    */
    setBGMVolume(value) {
        this.bgmVolume = Math.max(0, Math.min(1, value));
        this.bgmGainNode.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    }

    /**
 * 播放背景音樂
 * @param {number} startTime - 從歌曲的第幾秒開始 (對應 globalTime)
 */
    playBGM(startTime = 0) {
        if (!this.bgmBuffer) return;
        this.stopBGM();

        this.bgmSource = this.ctx.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;
        this.bgmSource.connect(this.bgmGainNode);

        if (this.ctx.state === 'suspended') this.ctx.resume();

        // --- 關鍵修改：紀錄播放時間點 ---
        this.bgmStartTime = this.ctx.currentTime;
        this.bgmOffset = Math.max(0, startTime);
        // ----------------------------

        this.bgmSource.start(0, this.bgmOffset);
    }

    /**
     * 停止背景音樂
     */
    stopBGM() {
        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) {
                // 防止 Source 尚未 start 就呼叫 stop 導致報錯
            }
            this.bgmSource = null;
        }
    }

    /**
 * 取得目前 BGM 播放的精確秒數 (同步核心)
 */
    getBGMTime() {
        if (!this.bgmSource || this.ctx.state === 'suspended') return null;

        // 目前時間 = (全域時鐘 - 按下播放時的全域時間) + 起始偏移量
        const playedDuration = this.ctx.currentTime - this.bgmStartTime;
        return playedDuration + this.bgmOffset;
    }

    getBGMDuration() {
        return this.bgmBuffer ? this.bgmBuffer.duration : 0;
    }

    /**
     * 動態調整全域音量 (0.0 到 1.0)
     */
    setGlobalVolume(value) {
        this.globalGain = Math.max(0, Math.min(1, value));
        // 使用 exponentialRamp 讓音量調整聽起來更自然，且防止爆音
        this.masterGain.gain.setTargetAtTime(this.globalGain, this.ctx.currentTime, 0.05);
    }

    setSFXVolume(value) {
        this.sfxMasterVolume = Math.max(0, Math.min(1, value));
        // 使用 exponentialRamp 讓音量調整聽起來更自然，且防止爆音
        this.sfxGainNode.gain.setTargetAtTime(this.sfxMasterVolume, this.ctx.currentTime, 0.05);
    }

    /**
     * 初始化並預載入所有音效，支援進度回報
     * @param {Function} onProgress - 回傳 (目前百分比, 當前 Key)
     */
    async init(onProgress) {
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
                // 無論成功或失敗，都增加進度
                loaded++;
                if (onProgress) onProgress((loaded / total) * 100, key);
            }
        });

        await Promise.all(loadTasks);
    }

    /**
     * 將音效加入佇列，包含重複攔截邏輯
     * @param {Object} note - 譜面音符物件
     * @param {number} targetTime - 預計發聲的 globalTime (秒)
     */
    queueSoundSingle(sample, targetTime) {
        //const now = performance.now();
        this._checkAndPush(sample, targetTime, true, this.sfxVolumes[sample]);
    }
    queueSound(note, targetTime) {
        const now = performance.now();

        // --- 攔截 A: 防止同一個物件在短時間內重複進入 (50ms 內) ---
        if (note._lastQueued && (now - note._lastQueued < 15)) return;
        note._lastQueued = now;

        let key = "judge";
        let isMono = true;

        // 根據 Note 類型決定音效
        switch (note.type) {
            case "tap":
                if (note.isEx) {
                    key = "judge_ex";
                }
                if (note.isBreak) {
                    key = "judge_break"
                    this._checkAndPush("break", targetTime, true, this.sfxVolumes["break"]);
                };
                this._checkAndPush("answer", targetTime, false, this.sfxVolumes["answer"]);
                break;
            case "hold":
                this._checkAndPush("answer", targetTime, false, this.sfxVolumes["answer"]);
                if (!note._startEffectPlayed) {
                    if (note.isEx) {
                        key = "judge_ex";
                    }
                    if (note.isBreak) {
                        key = "judge_break";
                        this._checkAndPush("break", targetTime, true, this.sfxVolumes["break"]);
                    } else {
                        key = "judge";
                    }
                    isMono = false;
                }
                else return;
                break;
            case "touch":
                key = "touch";
                isMono = false;
                this._checkAndPush("answer", targetTime, false, this.sfxVolumes["answer"]);
                if (note.isHanabi) {
                    if (note.holdDuration >= 0) {
                        if (note._startEffectPlayed) {
                            key = "hanabi"
                            isMono = true;
                        } else return;
                    } else {
                        key = "hanabi"
                        isMono = true;
                    }
                }
                if (note._startEffectPlayed && !note.isHanabi) return;
                break;
            case "slide":
                if (!note._startEffectPlayed && note.isBreak) {
                    this._checkAndPush("break_slide", targetTime, true, this.sfxVolumes["break_slide"]);
                    key = "break_slide_start";
                    isMono = false;
                } else {
                    if (note.isBreak) {
                        key = "judge_break_slide";
                        isMono = false;
                    } else {
                        key = "slide";
                        isMono = false;
                    }
                }
                break;
            default: return;
        }

        this._checkAndPush(key, targetTime, isMono, this.sfxVolumes[key]);
    }

    /**
     * 內部檢查冷卻時間並推入佇列
     */
    _checkAndPush(key, targetTime, isMono, volume = 1) {
        const now = performance.now();
        const lastTime = this.lastQueuedTimes.get(key) || 0;

        // --- 攔截 B: 防止機槍音 (15ms 內同類音效不重複觸發) ---
        if (now - lastTime < this.MIN_INTERVAL) return;

        this.lastQueuedTimes.set(key, now);
        this.soundQueue.push({ key, targetTime, isMono, volume });

        // 確保佇列按時間順序排列 (雖然 push 通常就是順序的)
        this.soundQueue.sort((a, b) => a.targetTime - b.targetTime);
        //console.log(`[Audio] 已加入佇列: ${key} 預計時間: ${targetTime.toFixed(2)}s (目前佇列長度: ${this.soundQueue.length})`, this.soundQueue);
    }

    /**
     * 在遊戲 Loop (requestAnimationFrame) 中呼叫，處理播放
     * @param {number} globalTime - 目前遊戲運行的時間 (秒)
     */
    update(globalTime) {
        // 只要佇列首位時間到了，就播放並移出佇列
        while (this.soundQueue.length > 0 && globalTime >= this.soundQueue[0].targetTime) {
            const { key, isMono, volume } = this.soundQueue.shift();
            this.play(key, isMono, volume);
        }
    }

    /**
     * 執行最終播放 (Web Audio API 核心)
     */
    play(key, isMono = false, volume = 1) {
        const buffer = this.bufferMap.get(key);
        if (!buffer) return;

        // 解鎖音訊限制
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // Mono 模式處理
        if (isMono && this.playingSources.has(key)) {
            try {
                this.playingSources.get(key).stop();
            } catch (e) { }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // --- 關鍵修正：建立一個 GainNode 來控制這次播放的音量 ---
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = volume; // 設定傳入的音量 (0.0 到 1.0)

        // 連接節點：Source -> GainNode -> sfxGainNode (原本的總音效控制)
        source.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        // ---------------------------------------------------

        if (isMono) {
            this.playingSources.set(key, source);
        }

        source.start(0);
    }
    /**
         * @param {string} id 唯一標籤 (建議用 note_pos_time)
         * @param {string} key 音效標籤
         * @param {number} offset 從音訊檔的第幾秒開始播放
         */
    startLongSound(id, key, offset = 0) {
        const buffer = this.bufferMap.get(key);
        const loop = this.loopPoints[key];
        if (!buffer || this.activeLongSounds.has(id)) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        let startTimeWithinBuffer = offset;

        if (loop) {
            source.loop = true;
            source.loopStart = loop.start;
            source.loopEnd = loop.end;

            // 核心邏輯：計算循環偏移量
            if (offset >= loop.end) {
                const loopDuration = loop.end - loop.start;
                // 算出在循環區間內跑了多久
                const timeInsideLoop = (offset - loop.end) % loopDuration;
                startTimeWithinBuffer = loop.start + timeInsideLoop;
            }
        } else {
            // 如果沒設定 Loop，且 Offset 超過長度，就不播了
            if (offset >= buffer.duration) return;
        }

        const gainNode = this.ctx.createGain();
        source.connect(gainNode);
        gainNode.connect(this.longSoundGainNode);

        // Web Audio API 的 start(when, offset)
        // 這裡的 startTimeWithinBuffer 必須小於 buffer.duration
        source.start(0, Math.max(0, startTimeWithinBuffer));

        this.activeLongSounds.set(id, { source, gainNode });
    }

    stopLongSound(id) {
        if (this.activeLongSounds.has(id)) {
            const { source, gainNode } = this.activeLongSounds.get(id);
            // 加上極短的 fade-out 防止爆音
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
            source.stop(this.ctx.currentTime + 0.05);
            this.activeLongSounds.delete(id);
        }
    }

    // 暫停時清空所有長音
    stopAllLongSounds() {
        for (const id of this.activeLongSounds.keys()) {
            this.stopLongSound(id);
        }
    }
}

// 導出實例
export const audioManager = new AudioManager();

const touchPathConfigs = {
    A: { points: [[0.31, 1.0], [0.31, 0.65], [0.15, 0.6]] },
    B: { points: [[0.22, 0.53], [0.46, 0.415], [0.45, 0.35], [0, 0.275]] },
    D: { points: [[0.167, 1], [0.155, 0.66], [0, 0.732]] },
    E: { points: [[0, 0.7], [0.29, 0.585], [0, 0.437]] }
};

export const touchPaths = [];

for (let i = 1; i <= 8; i++) {
    // 根據圖片，A/B 的 base 與 D/E 的 base 角度有位移
    // 這裡我們把 A/B 設在中心，D/E 設在間隔處
    const baseAngles = { A: i - 2.5, B: i - 2.5, D: i - 2, E: i - 2 };

    ['A', 'B', 'D', 'E'].forEach(type => {
        const path = new Path2D();
        const config = touchPathConfigs[type];
        const len = config.points.length;
        const base = baseAngles[type];

        for (let j = 0; j < len * 2; j++) {
            let [angleOffset, radiusMult] = (j < len)
                ? config.points[j]
                : config.points[len - 1 - (j - len)];

            if (j >= len) angleOffset = -angleOffset;

            const angle = (base - angleOffset) * (Math.PI / 4);
            const radius = innerCirleBase * radiusMult * 1.135;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            if (j === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        path.closePath();

        // 將路徑與資訊存入陣列
        touchPaths.push({ id: `${type}${i}`, type, path });
    });

}
const c1 = new Path2D();
c1.moveTo(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135 - 3, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135 - 3, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c1.closePath();
touchPaths.push({ id: `C1`, type: 'C1', path: c1 });
const c2 = new Path2D();
// mirrored horizontally: negate x and adjust offset
c2.moveTo(-(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135 - 3), Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135 - 3), Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c2.closePath();
touchPaths.push({ id: `C2`, type: 'C2', path: c2 });

export function getHighlight(text) {
    if (!text) {
        return '';
    }

    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const combinedRegex = /(\|\|.*$)|((?:&lt;[A-Za-z][^&]*?&gt;)|(?:pp)|(?:qq)|[-^vpqszVw]|(?:&lt;)|(?:&gt;))|(\([^()]*\))|(\{[^{}]*\})|(\[[^[\]]*\])|(\,)|(h)|(f)|(b)|(x)|(([ABCDE])(\d+)|C|C(d+))/gm;

    html = html.replace(combinedRegex, (match, comment, slide, bpm, split, time, comm, hold, f, bk, ex, touch) => {
        if (comment) return `<span style="color: #468A55;">${comment}</span>`;
        if (slide) {
            if (slide.startsWith('&lt;') && slide.endsWith('&gt;')) {
                return `<span style="color: #c586c0;">${slide}</span>`;
            }
            return `<span style="color: #7EBAF0;">${slide}</span>`;
        }
        if (touch) return `<span style="color: #7EBAF0;">${touch}</span>`;
        if (bpm) return `<span style="color: #F7CC6F; font-weight: bold;">${bpm}</span>`;
        if (split) return `<span style="color: #ce9178;">${split}</span>`;
        if (time) return `<span style="color: #b5cea8;">${time}</span>`;
        if (bk) return `<span style="color: #e19748;">${bk}</span>`;
        if (ex) return `<span style="color: #ff9f9f;">${ex}</span>`;
        if (hold) return `<span style="color: #9DC284;">${hold}</span>`;
        if (f) return `<span style="color: #f495ff;">${f}</span>`;
        if (comm) return `<span style="color: #7f888a;">${comm}</span>`;
        return match;
    });

    return html + (text.endsWith('\n') ? ' ' : '');
}

export function parseMaidata(raw) {
    if (!raw) { console.warn("empty rawdata!"); return {} };
    console.log("Parsing Maidata...");
    const maidata = {};
    raw.split("&").forEach(part => {
        const [key, value] = part.split("=");
        if (key && value) {
            maidata[key] = value.trim();
        }
    });
    return maidata;
}

export function getSimaiDataString(maidata) {
    if (!maidata || typeof maidata !== "object") return "";
    return "&" + Object.entries(maidata)
        .filter(([key, value]) => value.toString().trim().length > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n&");
}
/**
 * popupWindow
 *
 * 新 API：
 * - onOpen(ctx): 開啟後呼叫，可使用 ctx 操作內容、按鈕、進度、關閉等。
 * - onClose(): 關閉後呼叫。
 * - buttons: [{ text, onClick(ctx), hideOnClick, disabled }]
 *
 * 相容舊 API：
 * - closeWhen(close, update, updButtons, setProgress)
 * - whenOpen(update, updButtons, setProgress, contentElem)
 */
export function popupWindow({
    title = "",
    content = "",
    customContent = null,
    buttons = [],
    width = 340,
    unclosable = false,
    onOpen,
    onClose,
    closeWhen,
    whenOpen
} = {}) {
    const setStyle = (el, styles) => Object.assign(el.style, styles);
    const popupWidth = typeof width === 'number' ? `${width}px` : width;

    const applyContent = (container, value) => {
        container.innerHTML = '';
        if (!value) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        if (value instanceof Node) {
            container.appendChild(value);
            return;
        }
        container.innerHTML = `${value}`;
    };

    const createBtn = (btn, ctx) => {
        const normalized = typeof btn === 'string' ? { text: btn } : btn;
        const button = document.createElement('button');
        button.innerText = normalized.text ?? '按鈕';
        setStyle(button, {
            background: '#202020',
            color: 'white',
            padding: '5px 10px',
            cursor: normalized.disabled ? 'not-allowed' : 'pointer',
            border: '1px solid #404040',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            opacity: normalized.disabled ? '0.6' : '1'
        });

        button.disabled = !!normalized.disabled;
        button.onclick = () => {
            if (normalized.disabled) return;
            if (typeof normalized.onClick === 'function') {
                const compatArg = Object.assign(
                    (...args) => ctx.close(...args),
                    ctx
                );
                if (normalized.onClick.length <= 1) {
                    // support both new API (ctx) and legacy single-arg close callback
                    normalized.onClick(compatArg);
                } else {
                    // backward compatibility: onClick(close, update, updButtons, contentElem)
                    normalized.onClick(ctx.close, ctx.setContent, ctx.setButtons, ctx.elements.content, compatArg);
                }
            }
            if (normalized.hideOnClick) ctx.close();
        };
        return button;
    };

    // 1. 建立背景 (Backdrop)
    const backdrop = document.createElement('div');
    setStyle(backdrop, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(2px)', zIndex: '50',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: '0', transition: 'opacity 0.2s ease', perspective: '800px'
    });

    // 2. 建立彈窗主體 (Popup)
    const popup = document.createElement('div');
    setStyle(popup, {
        background: '#202020', color: 'white', padding: '10px',
        border: '1px solid #404040', borderRadius: '5px',
        maxWidth: 'calc(100% - 20px)', maxHeight: '95%',
        boxShadow: '0 0 15px rgba(0, 0, 0, 0.7)', overflow: 'hidden',
        width: title ? popupWidth : 'fit-content', position: 'relative'
    });

    // 3. 內部組件
    const titleElem = document.createElement('h3');
    setStyle(titleElem, { margin: '5px 0 10px 5px', minHeight: '30px', display: 'flex', alignItems: 'center', userSelect: 'none' });
    titleElem.innerText = title;

    const progressContainer = document.createElement('div');
    const progressBar = document.createElement('div');
    setStyle(progressContainer, { width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden', display: 'none' });
    setStyle(progressBar, { width: '0%', height: '100%', background: '#00ffcc', transition: 'width 0.3s ease' });
    progressContainer.appendChild(progressBar);

    const contentElem = document.createElement('div');
    setStyle(contentElem, {
        fontFamily: 'monospace', fontSize: '12px', background: '#151515',
        padding: '10px', borderRadius: '3px', whiteSpace: 'pre-wrap',
        overflow: 'auto', maxHeight: '190px', display: content ? 'block' : 'none'
    });
    applyContent(contentElem, typeof content === 'string' ? content.trim() : content);

    const customContentElem = document.createElement('div');
    setStyle(customContentElem, {
        marginTop: '10px',
        padding: '10px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '3px',
        display: 'none'
    });

    const btnContainer = document.createElement('div');
    setStyle(btnContainer, { display: 'flex', gap: '10px', marginTop: '10px', overflowX: 'auto', flexWrap: 'nowrap' });

    // --- 功能函式 ---

    let closed = false;
    const closePopup = () => {
        if (closed) return;
        closed = true;
        backdrop.style.pointerEvents = 'none';
        backdrop.style.opacity = '0';
        popup.animate([
            { transform: 'rotateX(0deg)', opacity: 1 },
            { transform: 'rotateX(30deg)', opacity: 0 }
        ], { duration: 200, easing: 'ease-in' }).onfinish = () => {
            backdrop.remove();
            if (typeof onClose === 'function') onClose();
        };
    };

    const setContent = (value) => {
        applyContent(contentElem, value);
        customContentElem.style.display = 'none';
    };

    const setCustomContent = (value) => {
        customContentElem.innerHTML = '';
        if (!value) {
            customContentElem.style.display = 'none';
            return;
        }
        customContentElem.style.display = 'block';
        if (value instanceof Node) {
            customContentElem.appendChild(value);
            return;
        }
        customContentElem.innerHTML = `${value}`;
        contentElem.style.display = 'none';
    };

    const ctx = {
        close: closePopup,
        setContent,
        setCustomContent,
        setButtons: (newBtns = []) => setButtons(newBtns),
        setProgress: (pct) => {
            progressContainer.style.display = 'block';
            progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        },
        elements: {
            backdrop,
            popup,
            content: contentElem,
            customContent: customContentElem,
            progressBar,
            buttons: btnContainer
        }
    };

    const setButtons = (newBtns = []) => {
        btnContainer.innerHTML = '';
        btnContainer.style.display = newBtns.length ? 'flex' : 'none';
        newBtns.forEach(btn => {
            btnContainer.appendChild(createBtn(btn, ctx));
        });
    };

    // --- 初始化組合 ---

    if (!unclosable) {
        backdrop.onclick = (e) => e.target === backdrop && closePopup();
        const closeX = document.createElement('div');
        closeX.innerText = '×';
        setStyle(closeX, { position: 'absolute', top: '10px', right: '10px', cursor: 'pointer', fontSize: '20px', color: '#aaa', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        closeX.onclick = closePopup;
        popup.appendChild(closeX);
    }

    popup.append(titleElem, progressContainer);

    if (customContent) {
        setCustomContent(customContent);
        popup.appendChild(customContentElem);
    } else {
        popup.appendChild(contentElem);
        popup.appendChild(customContentElem);
    }

    popup.appendChild(btnContainer);
    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    // 啟動動畫
    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';
        popup.animate([
            { transform: 'rotateX(30deg)', opacity: 0 },
            { transform: 'rotateX(0deg)', opacity: 1 }
        ], { duration: 200, easing: 'ease-out' });
    });

    // 執行回調
    setButtons(buttons);

    if (typeof closeWhen === 'function') {
        // backward compatibility
        closeWhen(ctx.close, ctx.setContent, ctx.setButtons, ctx.setProgress);
    }

    if (typeof whenOpen === 'function') {
        // backward compatibility
        whenOpen(ctx.setContent, ctx.setButtons, ctx.setProgress, contentElem);
    }

    if (typeof onOpen === 'function') {
        onOpen(ctx);
    }

    return ctx;
}
/**
 * 簡易提示小標籤 (支援自動堆疊)
 */
export function simpleToast({
    content = "",
    timeout = 2000,
    type = "info"
} = {}) {
    let container = document.getElementById('hint-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'hint-container';
        container.style.cssText = `
            position: fixed;
            top: 0px;
            left: 0px;
            padding: 10px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            pointer-events: none;
            overflow-y: auto;
            max-height: 100vh;
        `;
        document.body.appendChild(container);
    }

    const popup = document.createElement('div');
    const color = { info: '#00bbff', error: '#ff4444', success: '#00ffcc', warning: '#ffcc00' }[type] || '#404040';

    // 核心樣式：預設設定一個足夠大的 max-height 以便動畫計算
    popup.style.cssText = `
        background: #202020;
        color: white;
        padding: 10px 15px;
        border-left: 4px solid ${color};
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        font-size: 13px;
        pointer-events: auto;
        width: fit-content;
        max-width: 300px;
        margin-bottom: 10px; /* 改用 margin 代替 gap，方便縮減空間 */
        overflow: hidden;
        height: 30px; 
        max-height: 100px; 
        flex-shrink: 0;
        opacity: 1;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑過渡 */
    `;
    popup.innerHTML = content;
    container.appendChild(popup);

    // --- 1. 出現動畫 (使用 WAAPI) ---
    popup.animate([
        { transform: 'translateX(-40px)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 }
    ], { duration: 300, easing: 'cubic-bezier(0.58, 0.18, 0.34, 1.41)' });

    // --- 2. 移除邏輯 ---
    let isRemoving = false;
    const removePopup = () => {
        if (isRemoving) return;
        isRemoving = true;

        // 【關鍵】同時將物理尺寸縮減至 0
        // 這樣 transition 就會接手讓下方的元素慢慢滑上來
        popup.style.maxHeight = '0px';
        popup.style.marginTop = '0px';
        popup.style.marginBottom = '0px';
        popup.style.paddingTop = '0px';
        popup.style.paddingBottom = '0px';
        popup.style.opacity = '0';
        popup.style.transform = 'translateX(-40px)';
        popup.style.pointerEvents = 'none';
        popup.style.zIndex -= 1;

        // 等 transition 結束後再真正移除 DOM
        popup.addEventListener('transitionend', () => {
            if (container.contains(popup)) container.removeChild(popup);
            if (container.childNodes.length === 0 && document.body.contains(container)) {
                document.body.removeChild(container);
            }
        }, { once: true });
    };

    const timer = setTimeout(removePopup, timeout);
    popup.onclick = () => {
        clearTimeout(timer);
        removePopup();
    };
}
const baseURL = './Skin/', baseImageKeys = [
    'sensor',
    'tap', 'tap_break', 'tap_each', 'tap_ex',
    'NormalArc', 'BreakArc', 'EachArc',
    'hold', 'hold_break', 'hold_each', 'hold_ex',
    'Hold_End', 'Hold_Break_End', 'Hold_Each_End',
    'touch', 'touch_each', 'touch_point', 'touch_point_each',
    'star', 'star_break', 'star_each', 'star_double', 'star_ex',
    'star_break_double', 'star_each_double', 'star_ex_double',
    'slide', 'slide_each', 'slide_break', 'SlideArc',
    'touchhold_0', 'touchhold_1', 'touchhold_2', 'touchhold_3', 'touchhold_border'
];
/**
 * 載入所有圖片素材，支援進度回報
 * @param {Function} onProgress - 回傳 (目前百分比, 當前 Key)
 */
export async function loadAllImages(onProgress) {
    const images = {};
    const wifiPrefixes = ['wifi_', 'wifi_break_', 'wifi_each_'];

    // 計算總數：基礎圖片數 + (3種前綴 * 11張)
    const total = baseImageKeys.length + (wifiPrefixes.length * 11);
    let loaded = 0;

    const report = (key) => {
        loaded++;
        if (onProgress) onProgress((loaded / total) * 100, key);
    };

    const loadQueue = [];

    // 處理基礎圖片
    baseImageKeys.forEach(key => {
        const url = `${baseURL}${key}.png`;
        const task = getImgWithCache(url, key).then(img => {
            if (img) images[key] = img;
        }).finally(() => report(key));
        loadQueue.push(task);
    });

    // 處理 WiFi 扇形圖片
    wifiPrefixes.forEach(prefix => {
        for (let i = 0; i < 11; i++) {
            const key = prefix + i;
            const url = `${baseURL}${key}.png`;
            const task = getImgWithCache(url, key).then(img => {
                if (img) images[key] = img;
            }).catch(() => {
                // WiFi 圖片容許部分失敗
            }).finally(() => report(key));
            loadQueue.push(task);
        }
    });

    await Promise.all(loadQueue);
    return images;
}
async function getImgWithCache(url, key) {
    // 1. 嘗試從 IndexedDB 取得 Blob
    let blob = await idbGet(`img_cache_${key}`);

    if (!blob) {
        // 2. 沒快取則抓取網路資料
        try {
            const response = await fetch(url);
            blob = await response.blob();
            // 3. 存入 IndexedDB
            await idbSet(`img_cache_${key}`, blob);
        } catch (e) {
            console.error(`圖片載入失敗: ${url}`, e);
            return null;
        }
    }

    // 4. 將 Blob 轉為 Image 物件
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = URL.createObjectURL(blob);
    });
}
export function generatePath(startPos, endPos) {
    console.warn("path missing, using straight line as fallback");
    const recorder = new PathRecorder();
    const startInfo = noteRefPos[startPos - 1];
    const endInfo = noteRefPos[endPos - 1];

    recorder.moveTo(startInfo.x, startInfo.y);
    recorder.lineTo(endInfo.x, endInfo.y);

    return recorder;
}
/**
 * 對圖像套用色調 (Flat Tint)
 */
function tintImage(img, r, g, b, amount = 0.5) {
    const w = img.width || img.naturalWidth || 0;
    const h = img.height || img.naturalHeight || 0;
    if (w === 0 || h === 0) return null;

    // 1. 優先使用 OffscreenCanvas (效能較佳且不影響 DOM)
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
    }

    const ctx = canvas.getContext('2d');

    // 2. 繪製原始圖像
    ctx.drawImage(img, 0, 0, w, h);

    // 3. 套用色彩合成
    // 'source-atop' 會保留原圖透明度，並在有像素的地方填色
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

    // 這裡我們直接用 amount 控制全域透明度，效果更精確
    ctx.globalAlpha = Math.max(0, Math.min(1, amount));
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    return canvas;
}
// 建議定義在全域或模組頂層
const _tintCache = new WeakMap();

/**
 * 取得染色後的圖片 (具備快取機制)
 */
export function getTintedImage(img, amount = 0.5, { r = 255, g = 255, b = 255, colorCode = null } = {}) {
    if (!img) return null;

    // 1. 初始化圖片對應的快取 Map (使用 WeakMap 避免記憶體洩漏)
    let map = _tintCache.get(img);
    if (!map) {
        map = new Map();
        _tintCache.set(img, map);
    }

    // 2. 處理 Hex 色碼 (支援 #號、3位與6位格式)
    if (colorCode !== null) {
        let hex = colorCode.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            console.warn("Invalid tint color code:", colorCode);
        }
    }

    // 3. 數值邊界檢查與正規化
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    r = clamp(r); g = clamp(g); b = clamp(b);

    // Amount 取到小數點後兩位，防止 key 跑掉 (例如 0.5000000001)
    const normalizedAmount = Math.round(amount * 100) / 100;

    // 4. 快取檢索
    const key = `${r}|${g}|${b}|${normalizedAmount}`;
    if (map.has(key)) return map.get(key);

    // 5. 執行真正的染色邏輯
    const canvas = tintImage(img, r, g, b, normalizedAmount);
    map.set(key, canvas);

    return canvas;
}

/**
 * 清除 tint 快取
 * 如果傳入 img 只清該圖的快取；不傳則清除全部快取
 * @param {HTMLImageElement} [img]
 */
export function clearTintCache(img) {
    if (img) {
        _tintCache.delete(img);
    } else {
        _tintCache = new WeakMap();
    }
}

async function cacheFontWithAPI(url) {
    const cache = await caches.open('font-assets-v1');

    // 檢查是否有快取
    let response = await cache.match(url);

    if (!response) {
        console.log("[CacheAPI] 抓取並儲存字體...");
        await cache.add(url);
    }

    // 即使在 Cache API 中，你最後還是要在 CSS 寫 @font-face 
    // 或者用上述的 FontFace API 來載入。
}
export function formatSize(size) {
    if (size < 1024) return `${size} B`;
    for (const unit of ['KiB', 'MiB', 'GiB']) {
        size /= 1024;
        if (size < 1024) return `${size.toFixed(1)} ${unit}`;
    }
}
export const wSlideRatio = [
    111, 68, -3, 0,
    160, 90, -3.5, -0.004,
    204, 110, -4.6, -0.0035,
    253, 136, -5.5, -0.004,
    298, 154, -6.5, -0.003,
    353, 179, -6.2, -0.003,
    410, 205, -5.75, -0.003,
    464, 226, -5.45, -0.003,
    519, 251, -5.4, -0.004,
    571, 271, -5.2, -0.003,
    653, 313, -3.9, -0.003,
];