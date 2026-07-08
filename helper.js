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

const baseURL = './Skin/', baseImageKeys = [
    'no_image',
    'tap', 'tap_break', 'tap_each', 'tap_ex', 'tap_mine',
    'NormalArc', 'BreakArc', 'EachArc', 'SlideArc', 'MineArc',
    'hold', 'hold_break', 'hold_each', 'hold_ex', 'hold_mine',
    'hold_break_on', 'hold_each_on', 'hold_on',
    'Hold_End', 'Hold_Break_End', 'Hold_Each_End', 'Hold_Mine_End',
    'touch', 'touch_each', 'touch_mine', 'touch_point', 'touch_point_each', 'touch_point_mine',
    'touch_border_2', 'touch_border_3', 'touch_border_2_each', 'touch_border_3_each', 'touch_border_2_mine', 'touch_border_3_mine',
    'star', 'star_pink', 'star_break', 'star_each', 'star_ex', 'star_mine',
    'star_double', 'star_pink_double', 'star_break_double', 'star_each_double', 'star_ex_double', 'star_mine_double',
    'slide', 'slide_each', 'slide_break', 'slide_mine',
    'touchhold_0', 'touchhold_1', 'touchhold_2', 'touchhold_3', 'touchhold_border',
    'touchhold_0_mine', 'touchhold_1_mine', 'touchhold_2_mine', 'touchhold_3_mine', 'touchhold_border_mine',
];
const wifiPrefixes = ['wifi_', 'wifi_break_', 'wifi_each_', 'wifi_mine_'];

export const exColor = {
    tap: '#D8A2C9',
    star: '#00DBF4',
    double: '#DCDA6B',
    break: '#EBBA63',
};
export function drawImgAtcenter(ctx, img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
    ctx.drawImage(
        img,
        -size / 2 * imgWidthMul + offsetX,
        -size / 2 * imgHeightMul + offsetY,
        size * imgWidthMul,
        size * imgHeightMul
    );
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

export function throttle(func, delay = 16) {
    let lastCall = 0;

    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        }
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
        x: (3.5 - i) * innerCirleBase / 4,
    };
});
class AudioManager {
    constructor() {
        this.globalGain = 0.65; // 預設音量

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
        this.playbackRate = 1.0;

        this.sfxGainNode = this.ctx.createGain();
        this.sfxGainNode.connect(this.masterGain);
        this.sfxMasterVolume = 0.5;
        this.sfxGainNode.gain.value = this.sfxMasterVolume;

        this.longSoundGainNode = this.ctx.createGain();
        this.longSoundGainNode.gain.value = 0.25;

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
        this.scheduledSources = [];
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
     * 設定背景音樂播放速率
     * @param {number} rate - 播放速率（例如 1.0、1.5、0.75）
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.1, Math.min(4, Number(rate) || 1));
        if (this.bgmSource) {
            // 使用 .setTargetAtTime 防止速率突變造成耳朵不適
            this.bgmSource.playbackRate.setTargetAtTime(this.playbackRate, this.ctx.currentTime, 0.05);
        }
    }

    /**
 * 播放背景音樂
 * @param {number} startTime - 從歌曲的第幾秒開始 (對應 globalTime)
 * @param {number} volume - 音量 (0.0 到 1.0)
 */
    playBGM(startTime = 0, volume = 1) {
        if (!this.bgmBuffer) return;
        this.stopBGM();

        this.bgmSource = this.ctx.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;

        // --- 關鍵：套用當前速率 ---
        this.bgmSource.playbackRate.value = this.playbackRate;

        const sourceGain = this.ctx.createGain();
        sourceGain.gain.value = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : this.bgmVolume;
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
            } catch (e) {
                // 防止 Source 尚未 start 就呼叫 stop 導致報錯
            }
            this.bgmSource = null;
        }
    }

    stopAllScheduledSounds() {
        for (const src of this.scheduledSources) {
            try {
                src.stop();
            } catch (e) { }
        }
        this.scheduledSources = [];
    }

    /**
 * 取得目前 BGM 播放的精確秒數 (同步核心)
 */
    getBGMTime() {
        if (!this.bgmSource || this.ctx.state === 'suspended') return null;

        // 公式：((現在時間 - 開始時間) * 播放速率) + 起始偏移量
        const elapsedContextTime = this.ctx.currentTime - this.bgmStartTime;
        return (elapsedContextTime * this.playbackRate) + this.bgmOffset;
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

    setSFXVolumes(volumes) {
        for (const [key, vol] of Object.entries(volumes)) {
            if (this.sfxVolumes[key] !== undefined) {
                this.sfxVolumes[key] = Math.max(0, Math.min(1, vol));
            }
        }
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

        // --- 攔截 A: 防止同一個物件在短時間內重複進入 ---
        if (note._lastQueued && (now - note._lastQueued < this.MIN_INTERVAL)) return;
        note._lastQueued = now;

        // 透過 helper 產生事件清單，之後透過 _checkAndPush 實際 push
        const events = this.getSfxEventsForNote(note, targetTime);
        for (const ev of events) {
            this._checkAndPush(ev.key, ev.time, ev.isMono, ev.volume);
        }
    }

    /**
     * 產生單一 note 在指定時間應該觸發的 SFX 事件（不會直接推入佇列）
     * 回傳陣列：{ key, time, isMono, volume }
     */
    getSfxEventsForNote(note, targetTime) {
        const events = [];
        let key = 'judge';
        let isMono = true;

        switch (note.type) {
            case 'tap':
                if (note.isEx) key = 'judge_ex';
                if (note.isBreak) {
                    key = 'judge_break';
                    events.push({ key: 'break', time: targetTime, isMono: true, volume: this.sfxVolumes['break'] });
                }
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: this.sfxVolumes['answer'] });
                break;
            case 'hold':
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: this.sfxVolumes['answer'] });
                if (!note._startEffectPlayed) {
                    if (note.isBreak) {
                        key = 'judge_break';
                        events.push({ key: 'break', time: targetTime, isMono: true, volume: this.sfxVolumes['break'] });
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
                events.push({ key: 'answer', time: targetTime, isMono: false, volume: this.sfxVolumes['answer'] });
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
                if (!note._startEffectPlayed && note.isBreak) {
                    events.push({ key: 'break_slide', time: targetTime, isMono: true, volume: this.sfxVolumes['break_slide'] });
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

        events.push({ key, time: targetTime, isMono, volume: this.sfxVolumes[key] });
        return events;
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
        const buffer = this.bufferMap.get(key);
        if (!buffer) return;

        // 解鎖音訊限制
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // Mono 模式處理 (預約在未來新音效開始播放時才中斷舊音效，避免提早中斷產生靜音間隙)
        if (isMono && this.playingSources.has(key)) {
            try {
                const oldSource = this.playingSources.get(key);
                const stopTime = playTime !== null ? Math.max(this.ctx.currentTime, playTime) : this.ctx.currentTime;
                oldSource.stop(stopTime);
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

        if (playTime !== null) {
            const timeToPlay = Math.max(this.ctx.currentTime, playTime);
            source.start(timeToPlay);
            this.scheduledSources.push(source);
            source.onended = () => {
                const index = this.scheduledSources.indexOf(source);
                if (index !== -1) {
                    this.scheduledSources.splice(index, 1);
                }
            };
        } else {
            source.start(0);
        }
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

    clearSoundQueue() {
        this.soundQueue = [];
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

export function getHighlight(text, errpos = []) {
    if (!text) {
        return '';
    }

    const escapeHTML = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const normalizeRanges = (pos) => {
        if (!Array.isArray(pos) || pos.length === 0) return [];

        const normalizeRange = ({ start, end }) => {
            const s = Number(start);
            const e = Number(end);
            if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return null;
            return { start: Math.max(0, Math.min(text.length, s)), end: Math.max(0, Math.min(text.length, e)) };
        };

        const mergeRanges = (validRanges) => {
            const merged = [];
            for (const current of validRanges) {
                if (merged.length === 0) {
                    merged.push(current);
                } else {
                    const last = merged[merged.length - 1];
                    if (current.start <= last.end) {
                        last.end = Math.max(last.end, current.end);
                    } else {
                        merged.push(current);
                    }
                }
            }
            return merged;
        };

        if (pos.every(item => item && typeof item === 'object' && 'start' in item && 'end' in item)) {
            const valid = pos
                .map(normalizeRange)
                .filter(Boolean)
                .sort((a, b) => a.start - b.start);
            return mergeRanges(valid);
        }

        if (pos.length === 2 && Array.isArray(pos[0]) && Array.isArray(pos[1])) {
            const [starts, ends] = pos;
            const ranges = [];
            for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
                const range = normalizeRange({ start: starts[i], end: ends[i] });
                if (range) ranges.push(range);
            }
            const valid = ranges.sort((a, b) => a.start - b.start);
            return mergeRanges(valid);
        }

        return [];
    };

    const ranges = normalizeRanges(errpos);

    const combinedRegex = /(\|\|.*$)|((?:&lt;[A-Za-z][^&]*?&gt;)|(?:pp)|(?:qq)|[-^vpqszVw]|(?:&lt;)|(?:&gt;))|(\([^()]*\))|(\{[^{}]*\})|(\[[^[\]]*\])|(\,)|(h)|(f)|(b)|(x)|(([ABCDE])(\d+)|C|C(d+))/gm;

    const highlightText = (segment) => {
        const escaped = escapeHTML(segment);
        return escaped.replace(combinedRegex, (match, comment, slide, bpm, split, time, comm, hold, f, bk, ex, touch) => {
            if (comment) return `<span style="color: #468A55;">${comment}</span>`;
            if (slide) {
                if (slide.startsWith('&lt;') && slide.endsWith('&gt;')) {
                    return `<span style="color: #c586c0;">${slide}</span>`;
                }
                return `<span style="color: #7EBAF0;">${slide}</span>`;
            }
            if (touch) return `<span style="color: #7EBAF0;">${touch}</span>`;
            if (bpm) return `<span style="color: #ffbf5f; font-weight: bold;">${bpm}</span>`;
            if (split) return `<span style="color: #ce9178;">${split}</span>`;
            if (time) return `<span style="color: #b5cea8;">${time}</span>`;
            if (bk) return `<span style="color: #FF9707;">${bk}</span>`;
            if (ex) return `<span style="color: #d1c70f;">${ex}</span>`;
            if (hold) return `<span style="color: #9DC284;">${hold}</span>`;
            if (f) return `<span style="color: #d092ef;">${f}</span>`;
            if (comm) return `<span style="color: #7f888a;">${comm}</span>`;
            return match;
        });
    };

    let html = '';
    let cursor = 0;
    for (const range of ranges) {
        if (cursor < range.start) {
            html += highlightText(text.slice(cursor, range.start));
        }
        html += `<span class="highlight-warning">${highlightText(text.slice(range.start, range.end))}</span>`;
        cursor = range.end;
    }
    if (cursor < text.length) {
        html += highlightText(text.slice(cursor));
    }

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
    maxWidth = 600,
    height = undefined,
    maxHeight = "100vh",
    unclosable = false,
    onOpen,
    onClose,
    closeWhen,
    whenOpen
} = {}) {
    const setStyle = (el, styles) => Object.assign(el.style, styles);
    const popupWidth = typeof width === 'number' ? `${width}px` : width;
    const popupHeight = height ? (typeof height === 'number' ? `${height}px` : height) : 'auto';
    const popupMaxHeight = maxHeight ? (typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight) : '100vh';

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
        background: '#202020', color: 'white', padding: '15px',
        border: '1px solid #404040', borderRadius: '5px',
        maxWidth: maxWidth ? (typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth) : '90%',
        width: title ? popupWidth : 'fit-content',
        height: popupHeight,
        maxHeight: popupMaxHeight,
        boxShadow: '0 0 15px rgba(0, 0, 0, 0.7)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden'
    });

    // 3. 內部組件
    const titleElem = document.createElement('h3');
    setStyle(titleElem, { margin: '5px 0 10px 5px', minHeight: '30px', display: title ? 'flex' : 'none', alignItems: 'center', userSelect: 'none' });
    titleElem.innerText = title;

    const progressContainer = document.createElement('div');
    const progressBar = document.createElement('div');
    setStyle(progressContainer, { width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden', display: 'none', marginBottom: '10px' });
    setStyle(progressBar, { width: '0%', height: '100%', background: '#00ffcc', transition: 'width 0.3s ease' });
    progressContainer.appendChild(progressBar);

    // Scrollable content wrapper
    const bodyElem = document.createElement('div');
    setStyle(bodyElem, {
        flex: '1 1 auto',
        overflowY: 'auto',
        minHeight: '0',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    });

    const contentElem = document.createElement('div');
    setStyle(contentElem, {
        fontFamily: 'monospace', fontSize: '12px', background: '#151515',
        padding: '10px', borderRadius: '3px', whiteSpace: 'pre-wrap',
        display: content ? 'block' : 'none'
    });
    applyContent(contentElem, typeof content === 'string' ? content.trim() : content);

    const customContentElem = document.createElement('div');
    setStyle(customContentElem, {
        padding: '10px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '3px',
        display: 'none',
        height: "100%",
    });

    bodyElem.append(contentElem, customContentElem);

    const btnContainer = document.createElement('div');
    setStyle(btnContainer, { display: 'flex', gap: '10px', marginTop: '10px', overflowX: 'auto', flexWrap: 'nowrap', flexShrink: '0' });

    // --- 功能函式 ---

    let closed = false;
    const closePopup = () => {
        if (closed) return;
        closed = true;
        ctx.isClosed = true;
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
        isClosed: false,
        elements: {
            backdrop,
            popup,
            body: bodyElem,
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
        setStyle(closeX, { position: 'absolute', top: '10px', right: '10px', cursor: 'pointer', fontSize: '20px', color: '#aaa', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10' });
        closeX.onclick = closePopup;
        popup.appendChild(closeX);
    }

    popup.append(titleElem, progressContainer, bodyElem, btnContainer);

    if (customContent) {
        setCustomContent(customContent);
    }

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
export function simpleToast({
    content = "",
    timeout = 2000,
    type = "info"
} = {}) {

    const MAX_TOASTS = 3;

    let container = document.getElementById('hint-container');

    if (!container) {

        container = document.createElement('div');

        container.id = 'hint-container';

        container.style.cssText = `
            position: fixed;
            top: 40px;
            left: 0;
            padding: 10px;
            z-index: 10000;

            display: flex;
            flex-direction: column;

            pointer-events: none;

            overflow: hidden;

            max-height: 100vh;
        `;

        document.body.appendChild(container);
    }

    // =========================
    // 限制最大 toast 數量
    // =========================

    const activeToasts =
        [...container.children]
            .filter(v => !v._isRemoving);

    if (activeToasts.length >= MAX_TOASTS) {

        const oldest = activeToasts[0];

        oldest?._triggerRemove?.();
    }

    // =========================
    // 建立 toast
    // =========================

    const popup = document.createElement('div');

    const colorMap = {
        info: '#00bbff',
        error: '#ff4444',
        success: '#00ffcc',
        warning: '#ffcc00'
    };

    const color =
        colorMap[type] || '#404040';

    popup.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: flex-start;

        background: #202020;
        color: white;

        padding: 10px 15px;

        border-left: 4px solid ${color};

        border-radius: 4px;

        box-shadow:
            0 4px 12px rgba(0,0,0,0.5);

        font-size: 13px;

        pointer-events: auto;

        width: fit-content;
        max-width: 300px;

        margin-bottom: 10px;

        overflow: hidden;

        min-height: 20px;
        max-height: 100px;

        flex-shrink: 0;

        opacity: 1;

        transform: translateX(0);

        transition:
            opacity 0.4s cubic-bezier(0.4,0,0.2,1),
            transform 0.4s cubic-bezier(0.4,0,0.2,1),
            max-height 0.4s cubic-bezier(0.4,0,0.2,1),
            margin 0.4s cubic-bezier(0.4,0,0.2,1),
            padding 0.4s cubic-bezier(0.4,0,0.2,1);
    `;

    // 安全版
    popup.textContent = content;

    container.appendChild(popup);

    // =========================
    // 出現動畫
    // =========================

    popup.animate(
        [
            {
                transform: 'translateX(-40px)',
                opacity: 0
            },
            {
                transform: 'translateX(0)',
                opacity: 1
            }
        ],
        {
            duration: 300,
            easing:
                'cubic-bezier(0.58,0.18,0.34,1.41)'
        }
    );

    // =========================
    // 移除邏輯
    // =========================

    const removePopup = () => {

        if (popup._isRemoving) return;

        popup._isRemoving = true;

        clearTimeout(timer);

        popup.style.maxHeight = '0px';

        popup.style.marginTop = '0px';
        popup.style.marginBottom = '0px';

        popup.style.paddingTop = '0px';
        popup.style.paddingBottom = '0px';

        popup.style.opacity = '0';

        popup.style.transform =
            'translateX(-40px)';

        popup.style.pointerEvents = 'none';

        // transitionend 有時不穩
        // 直接 timeout 最穩

        setTimeout(() => {

            popup.remove();

            if (
                container &&
                container.children.length === 0
            ) {
                container.remove();
            }

        }, 450);
    };

    popup._triggerRemove = removePopup;

    // =========================
    // 自動關閉
    // =========================

    const timer =
        setTimeout(removePopup, timeout);

    // =========================
    // 點擊關閉
    // =========================

    popup.onclick = removePopup;
}

/**
 * 載入所有圖片素材，支援進度回報
 * @param {Function} onProgress - 回傳 (目前百分比, 當前 Key)
 */
export async function loadAllImages(onProgress) {
    const images = {};

    // 1. 先把所有要載入的 Key 整理成一個陣列
    const allKeys = [...baseImageKeys];
    wifiPrefixes.forEach(prefix => {
        for (let i = 0; i < 11; i++) {
            allKeys.push(prefix + i);
        }
    });

    // 2. 直接用陣列長度當總數，絕對不會算錯
    const total = allKeys.length;
    let loaded = 0;

    const report = (key) => {
        loaded++;
        if (onProgress) onProgress((loaded / total) * 100, key);
    };

    // 3. 使用 map 建立任務隊列，確保每一個 key 都會回報進度
    const loadQueue = allKeys.map(async key => {
        const url = `${baseURL}${key}.png`;
        try {
            try {
                const img = await getImgWithCache(url, key);
                if (img) images[key] = img;
            } catch (err) {
                // 如果是那個忘記刪的舊 Key，這裡會抓到錯誤但不會卡住
                console.warn(`[資源缺失] 無法載入 ${key}:`, err);
            }
        } finally {
            return report(key);
        } // 無論成功失敗都必須 report
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
            if (!response.ok) {
                throw new Error(`HTTP status ${response.status}`);
            }
            blob = await response.blob();
            // 3. 存入 IndexedDB
            await idbSet(`img_cache_${key}`, blob);
        } catch (e) {
            console.error(`圖片載入失敗: ${url}`, e);
            throw e; // 拋出錯誤以利呼叫端捕獲
        }
    }

    if (!blob) {
        throw new Error(`Blob is null for key: ${key}`);
    }

    // 4. 將 Blob 轉為 Image 物件
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to decode image blob for key: ${key}`));
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

    if (amount <= 0) return canvas;

    // 3. 使用 GPU 混合模式套用色彩乘法混合 (若有 CORS 限制則會拋錯降級)
    try {
        // 建立一個暫時的 Canvas 用來染色
        let tintCanvas;
        if (typeof OffscreenCanvas !== 'undefined') {
            tintCanvas = new OffscreenCanvas(w, h);
        } else {
            tintCanvas = document.createElement('canvas');
            tintCanvas.width = w;
            tintCanvas.height = h;
        }
        const tctx = tintCanvas.getContext('2d');

        // a. 在 tintCanvas 上繪製原圖
        tctx.drawImage(img, 0, 0, w, h);

        // b. 將顏色填充至非透明區域 (source-in 取得純色剪影)
        tctx.save();
        tctx.globalCompositeOperation = 'source-in';
        tctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        tctx.fillRect(0, 0, w, h);
        tctx.restore();

        // c. 與原圖進行色彩乘法混合 (multiply)
        tctx.save();
        tctx.globalCompositeOperation = 'multiply';
        tctx.drawImage(img, 0, 0, w, h);
        tctx.restore();

        // d. 確保透明度通道完全正確
        tctx.save();
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(img, 0, 0, w, h);
        tctx.restore();

        // 4. 將染色圖像按 amount 的透明度疊加至主 canvas 上
        ctx.save();
        ctx.globalAlpha = amount;
        ctx.drawImage(tintCanvas, 0, 0);
        ctx.restore();
    } catch (e) {
        console.warn("GPU tint failed: falling back to source-atop method.", e);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        ctx.globalAlpha = Math.max(0, Math.min(1, amount));
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    return canvas;
}
// 建議定義在全域或模組頂層
let _tintCache = new WeakMap();

/**
 * 取得染色後的圖片 (具備快取機制)
 */
export function getTintedImage(img, amount = 0.5, { r = 255, g = 255, b = 255, colorCode = null } = {}) {
    if (!img) return null;

    // 快速通道：若不需染色，直接回傳原圖，避開快取與 Canvas 染色負載
    if (amount <= 0) return img;

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
    const clampVal = (v) => Math.max(0, Math.min(255, Math.round(v)));
    r = clampVal(r); g = clampVal(g); b = clampVal(b);

    // Amount 正規化為 0.05 粒度，提高閃爍時的快取命中率
    const normalizedAmount = Math.round(amount * 20) / 20;

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
export function isObject(val) {
    return val instanceof Object;
}
export const contantRotate = (selected, direction) => {
    if (typeof selected !== 'string' || selected.length === 0) return selected;

    const bracketPairs = {
        '[': ']',
        '{': '}',
        '(': ')'
    };

    const rotateDigit = (digit) => {
        const base = parseInt(digit, 10);
        if (Number.isNaN(base) || base < 1 || base > 8) return digit;
        return String(((base - 1 + direction) % 8 + 8) % 8 + 1);
    };

    const extractEdgeTags = (token) => {
        let prefix = '';
        let current = token;
        while (current.startsWith('<')) {
            const closeIndex = current.indexOf('>');
            if (closeIndex <= 0) break;
            const inner = current.slice(1, closeIndex);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            prefix += current.slice(0, closeIndex + 1);
            current = current.slice(closeIndex + 1);
        }

        let suffix = '';
        while (current.endsWith('>')) {
            const openIndex = current.lastIndexOf('<');
            if (openIndex < 0) break;
            const inner = current.slice(openIndex + 1, current.length - 1);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            suffix = current.slice(openIndex) + suffix;
            current = current.slice(0, openIndex);
        }

        return { prefix, content: current, suffix };
    };

    const processContent = (content) => {
        const stack = [];
        let result = '';
        let lastOldDigit = null;
        let lastNewDigit = null;
        let firstOldDigit = null;
        let firstNewDigit = null;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            if (bracketPairs[ch]) {
                stack.push(bracketPairs[ch]);
                result += ch;
                continue;
            }
            if (stack.length > 0) {
                if (ch === stack[stack.length - 1]) {
                    stack.pop();
                }
                result += ch;
                continue;
            }
            if (ch >= '1' && ch <= '8') {
                const oldD = parseInt(ch, 10);
                const rotated = rotateDigit(ch);
                const newD = parseInt(rotated, 10);

                lastOldDigit = oldD;
                lastNewDigit = newD;
                if (firstOldDigit === null) {
                    firstOldDigit = oldD;
                    firstNewDigit = newD;
                }
                result += rotated;
            } else if (ch === '*') {
                lastOldDigit = firstOldDigit;
                lastNewDigit = firstNewDigit;
                result += ch;
            } else if (ch === '<' || ch === '>') {
                if (lastOldDigit !== null && lastNewDigit !== null) {
                    const oldFlip = (lastOldDigit >= 3 && lastOldDigit <= 6);
                    const newFlip = (lastNewDigit >= 3 && lastNewDigit <= 6);
                    if (oldFlip !== newFlip) {
                        result += (ch === '<' ? '>' : '<');
                    } else {
                        result += ch;
                    }
                } else {
                    result += ch;
                }
            } else {
                result += ch;
            }
        }
        return result;
    };

    return selected.split(/(\s*,\s*)/).map((part, index) => {
        if (index % 2 === 1) return part;
        const { prefix, content, suffix } = extractEdgeTags(part);
        return prefix + processContent(content) + suffix;
    }).join('');
};
export function flipSelectedText(selected, deMap, transformDigit, swapPairs = {}) {
    if (typeof selected !== 'string') return selected;

    const bracketPairs = {
        '[': ']',
        '{': '}',
        '(': ')'
    };

    const extractEdgeTags = (token) => {
        let prefix = '';
        let current = token;

        while (current.startsWith('<')) {
            const closeIndex = current.indexOf('>');
            if (closeIndex <= 0) break;
            const inner = current.slice(1, closeIndex);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            prefix += current.slice(0, closeIndex + 1);
            current = current.slice(closeIndex + 1);
        }

        let suffix = '';
        while (current.endsWith('>')) {
            const openIndex = current.lastIndexOf('<');
            if (openIndex < 0) break;
            const inner = current.slice(openIndex + 1, current.length - 1);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            suffix = current.slice(openIndex) + suffix;
            current = current.slice(0, openIndex);
        }

        return { prefix, content: current, suffix };
    };

    const processContent = (content) => {
        const stack = [];
        let result = '';

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            if (bracketPairs[ch]) {
                stack.push(bracketPairs[ch]);
                result += ch;
                continue;
            }

            if (stack.length > 0) {
                if (ch === stack[stack.length - 1]) {
                    stack.pop();
                }
                result += ch;
                continue;
            }

            const up = ch.toUpperCase();
            if (up === 'C') {
                const next = content[i + 1];
                if (next === '1') {
                    result += ch + next;
                    i++;
                    continue;
                }
                result += ch;
                continue;
            }

            if (up === 'D' || up === 'E') {
                const next = content[i + 1];
                if (next && /\d/.test(next)) {
                    const d = parseInt(next, 10);
                    if (d >= 1 && d <= 8) {
                        const mapped = deMap[d];
                        result += ch + mapped.toString();
                        i++;
                        continue;
                    }
                }
                result += ch;
                continue;
            }

            if (/\d/.test(ch)) {
                result += transformDigit(ch);
                continue;
            }

            if (swapPairs[ch]) {
                result += swapPairs[ch];
                continue;
            }

            result += ch;
        }

        return result;
    };

    return selected.split(/(\s*,\s*)/).map((part, index) => {
        if (index % 2 === 1) return part;
        const { prefix, content, suffix } = extractEdgeTags(part);
        return prefix + processContent(content) + suffix;
    }).join('');
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// 確保 .backgroundContainer 永遠為父容器內最大的正方形
function updateBackgroundSquare(canvasContainerEl) {
    if (!canvasContainerEl) return;
    const bg = canvasContainerEl.querySelector('.backgroundContainer');
    if (!bg) return;
    const rect = canvasContainerEl.getBoundingClientRect();
    const side = Math.max(0, Math.min(rect.width, rect.height));
    bg.style.width = side + 'px';
    bg.style.height = side + 'px';
    // keep centered
    bg.style.left = '50%';
    bg.style.top = '50%';
    bg.style.transform = 'translate(-50%, -50%)';
}
const _cEl = document.getElementById('canvasContainer');
// 監聽容器尺寸變化（ResizeObserver 優先），並在視窗 resize 時也更新
try {
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => updateBackgroundSquare(_cEl));
        ro.observe(_cEl);
    }
} catch (e) {
    // ignore
}
window.addEventListener('resize', () => updateBackgroundSquare(_cEl));
// 初次更新
setTimeout(() => updateBackgroundSquare(_cEl), 0);

export const createLabeledInput1 = ({
    value,
    labelText,
    type = 'text', // 現在支援 'text' | 'textarea' | 'select' | 'number' | 'range' | 'color' 等等
    assign,
    data = {},
    ref = {},
    options = []
} = {}) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = "display:flex;flex-direction:column;margin-bottom:6px;";

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = "font-size:12px;color:#888;margin-bottom:2px;";

    let input;
    if (type === 'textarea') {
        input = document.createElement('textarea');
    } else if (type === 'select') {
        input = document.createElement('select');
        // 填充選項的邏輯保持你寫的，寫得很好
        if (Array.isArray(options)) {
            options.forEach(opt => {
                const optionEl = document.createElement('option');
                if (opt && typeof opt === 'object' && ('value' in opt || 'label' in opt)) {
                    optionEl.value = opt.value != null ? String(opt.value) : String(opt.label ?? '');
                    optionEl.textContent = opt.label != null ? String(opt.label) : String(opt.value ?? opt);
                } else {
                    optionEl.value = optionEl.textContent = String(opt);
                }
                input.appendChild(optionEl);
            });
        } else if (options && typeof options === 'object') {
            Object.keys(options).forEach(k => {
                const optionEl = document.createElement('option');
                optionEl.value = k;
                optionEl.textContent = options[k];
                input.appendChild(optionEl);
            });
        }
    } else {
        input = document.createElement('input');
        input.type = type; // 讓它能直接支援 number、color、range、checkbox 等原生類型！
    }

    if (type !== 'select') {
        input.value = value ?? '';
    } else {
        if (value != null) input.value = String(value);
    }

    input.title = labelText;
    if (type !== 'select' && type !== 'color' && type !== 'range') {
        input.placeholder = labelText;
    }

    input.style.cssText = "border:1px solid #333;border-radius:4px;background:#111;color:#fff;font-size:12px;resize:vertical;padding:8px;box-sizing:border-box;";

    const handleChange = () => {
        let newValue = input.value;

        // 貼心小優化：如果類型是數字，自動轉成數字型態再存進 data，免得以後計算還要 parseInt
        if (type === 'number' || type === 'range') {
            newValue = Number(newValue);
        }

        if (assign) data[assign] = newValue;
    };

    if (type === 'select') {
        input.addEventListener('change', handleChange);
    } else {
        input.addEventListener('input', handleChange);
    }

    if (assign) ref[assign] = input;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return { wrapper, input };
};

export const createCustomSlider = (initialValue, min = 0, max = 1, step = 0.1, onInputCallback) => {
    const thumbSize = 24;
    const animation = "ease 0.3s";

    // 1. 主容器 (模擬 input 元素，讓外部可以讀取 .value)
    const container = document.createElement('div');
    container.type = 'range'; // 欺騙 createRow 的判斷
    container.value = initialValue;
    container.min = min;
    container.max = max;
    container.step = step;
    container.style.cssText = `
        height: 24px;
        display: flex;
        align-items: center;
        position: relative;
        cursor: pointer;
        user-select: none;
        touch-action: none;
        border: 2px solid #fff;
        border-radius: 999px;
    `;

    // 2. 底層軌道 (Track)
    const track = document.createElement('div');
    track.style.cssText = `
        right: 0;
        width: 100%;
        height: 100%;
        background: #222;
        border-radius: 999px;
        position: relative;
    `;

    // 3. 已填滿進度條 (Fill)
    const fill = document.createElement('div');
    fill.style.cssText = `
        height: 100%;
        background: #4a90e2;
        border-radius: 40px 0 0 40px;
        position: absolute;
        left: 0;
        top: 0;
        width: 0%;
        transition: width ${animation};
    `;

    // 4. 滑鈕 (Thumb)
    const thumb = document.createElement('div');
    thumb.style.cssText = `
        width: ${thumbSize}px;
        height: ${thumbSize}px;
        background: #4a90e2;
        border-radius: 20px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        transition: left ${animation}, background 0.2s, transform 0.2s;
        user-select: none;
        box-sizing: border-box;
    `;

    const text = document.createElement('div');
    text.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${thumbSize}px;
        height: ${thumbSize}px;
        position: absolute;
        top: 50%;
        left: 10px;
        transform: translateY(-50%);
        transition: left ${animation}, background 0.2s, transform 0.2s, box-shadow 0.2s;
        user-select: none;
        text-align: center;
        font-size: 12px;
        text-shadow: 0px 1px 2px black;
    `;
    text.textContent = initialValue.toFixed(2);

    track.appendChild(fill);
    track.appendChild(thumb);
    track.appendChild(text);
    container.appendChild(track);

    // 內部更新視覺與數值的函式
    const updateVisuals = (val) => {
        // 限制範圍 (Clamp)
        val = Math.max(min, Math.min(max, val));

        // 四捨五入到最接近的 step
        const percent = (val - min) / (max - min);

        // 更新這群 div 的樣式
        /*if (!triggerAnimate) {
            fill.style.transition = 'none';
            thumb.style.transition = 'none';
        } else {
            fill.style.transition = 'width ease 0.15s';
            thumb.style.transition = 'left ease 0.15s, background 0.2s, transform 0.2s';
        }*/
        // 🟢 這裡同步調整：Fill 寬度可以稍微扣除滑鈕半寬，看起來會更貼合滑鈕中心
        fill.style.width = `calc(${percent * 100}% - ${(percent - 0.5) * thumbSize}px)`;

        // 🔴 核心修正：利用神奇公式，讓滑鈕永遠不超出邊界
        thumb.style.left = `calc(${percent * 100}% - ${percent * thumbSize}px)`;

        text.textContent = val.toFixed(2); // 顯示數值，保留兩位小數

        container.value = val; // 寫回主容器
    };

    // 處理拖曳/點擊邏輯
    let isDragging = false;

    const handlePointerMove = (e) => {
        const rect = track.getBoundingClientRect();

        // 🔴 修正：扣除滑鈕本身的寬度影響，算出正確的點擊/拖曳比例
        let clickX = e.clientX - rect.left;
        let availableWidth = rect.width;

        let pct = clickX / availableWidth;
        pct = Math.max(0, Math.min(1, pct));

        let rawVal = min + pct * (max - min);
        let steppedVal = Math.round(rawVal / step) * step;

        steppedVal = parseFloat(steppedVal.toFixed(4));
        steppedVal = Math.max(min, Math.min(max, steppedVal));

        updateVisuals(steppedVal, !isDragging);
        if (onInputCallback) onInputCallback(steppedVal);
    };

    container.addEventListener('pointerdown', (e) => {
        isDragging = true;
        container.setPointerCapture(e.pointerId);
        thumb.style.transform = 'translateY(-50%) scale(1.2)'; // 🔴 只縮放，不改 X 軸
        thumb.style.background = '#5ca0f2';
        thumb.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
        handlePointerMove(e);
    });

    container.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        handlePointerMove(e);
    });

    const stopDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        thumb.style.transform = 'translateY(-50%) scale(1)'; // 🔴 還原
        thumb.style.background = '#4a90e2';
        thumb.style.boxShadow = 'none';
    };

    container.addEventListener('pointerup', stopDrag);
    container.addEventListener('pointercancel', stopDrag);

    // 懸停動畫效果
    container.addEventListener('mouseenter', () => {
        if (!isDragging) thumb.style.transform = 'translateY(-50%) scale(1.1)';
    });
    container.addEventListener('mouseleave', () => {
        if (!isDragging) thumb.style.transform = 'translateY(-50%) scale(1)';
    });

    // 初始化數值視覺
    updateVisuals(initialValue);

    // 外掛一個外部重置更新介面
    container._updateDisplay = () => {
        updateVisuals(container.value);
    };

    return container;
};

const activeDebug = () => {
    const debugInfoEl = document.createElement('div');
    debugInfoEl.style.position = 'fixed';
    debugInfoEl.style.minWidth = '50px';
    debugInfoEl.style.minHeight = '50px';
    debugInfoEl.style.top = '10px';
    debugInfoEl.style.right = '10px';
    debugInfoEl.style.padding = '5px 10px';
    debugInfoEl.style.backgroundColor = 'rgba(24, 171, 122, 0.58)';
    debugInfoEl.style.color = '#fff';
    debugInfoEl.style.fontSize = '12px';
    debugInfoEl.style.zIndex = '10000';
    debugInfoEl.style.cursor = 'move'; // 提示使用者這可以拖曳
    debugInfoEl.style.userSelect = 'none'; // 防止拖曳時不小心選取到文字

    // 拖曳邏輯變數
    let isDragging = false;
    let offsetX, offsetY;

    debugInfoEl.addEventListener('mousedown', (e) => {
        isDragging = true;
        // 計算滑鼠點擊點與元素左上角的相對距離
        const rect = debugInfoEl.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    });

    // 監聽 window 而不是元素本身，這樣滑鼠移太快才不會斷掉
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        // 計算新位置
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        // 限制不要拖出視窗外（選用，如果你想讓它隨便飛可以刪掉邊界限制）
        const maxX = window.innerWidth - debugInfoEl.offsetWidth;
        const maxY = window.innerHeight - debugInfoEl.offsetHeight;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // 因為原本設定了 right: 10px，拖曳時我們改用 left 和 top 來精準定位
        debugInfoEl.style.right = 'auto';
        debugInfoEl.style.left = `${newX}px`;
        debugInfoEl.style.top = `${newY}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.body.appendChild(debugInfoEl);
    window.debugInfoEl = debugInfoEl;
}

window.activeDebug = activeDebug;

async function resampleAudioBuffer(audioBuffer, targetSampleRate = 44100) {
    if (audioBuffer.sampleRate === targetSampleRate) {
        return audioBuffer;
    }
    const numberOfChannels = audioBuffer.numberOfChannels;
    const duration = audioBuffer.duration;
    const offlineCtx = new OfflineAudioContext(
        numberOfChannels,
        Math.max(1, Math.ceil(targetSampleRate * duration)),
        targetSampleRate
    );
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start();
    return await offlineCtx.startRendering();
}

function padAudioBuffer(audioBuffer, targetLength) {
    if (audioBuffer.length >= targetLength) {
        return audioBuffer;
    }
    const nb = new AudioBuffer({
        length: targetLength,
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
    });
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        nb.getChannelData(ch).set(audioBuffer.getChannelData(ch));
    }
    return nb;
}

export async function videoRender(audioManager, canvas, renderer, {
    start = 0,
    end = 0,
    fps = 30,
    width = 1080,
    height = 720,
    bgmVolume = 0.8,
    sfxVolume = 1.0,
    includeAudio = true,
    includeBgm = true,
    includeSfx = true,
    musicDelay = 0,
    editorBackgroundImage = null,
    editorBackgroundVideo = null,
    notes = [],
    playScoreRes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 },
} = {}) {
    const settings = renderer.settings || window.settings || {};
    const {
        Output,
        BufferTarget,
        Mp4OutputFormat,
        CanvasSource,
        AudioBufferSource,
        QUALITY_HIGH
    } = window.Mediabunny;

    const outlineImage = await (async () => {
        try {
            const response = await fetch('./Skin/outline.png');
            if (!response.ok) throw new Error('fetch failed: ' + response.status);
            const blob = await response.blob();
            try {
                if (window.createImageBitmap) return await createImageBitmap(blob);
            } catch (e) {
                console.warn('createImageBitmap 失敗，改用 Image element', e);
            }
            return await new Promise((res, rej) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
                img.onerror = (err) => { URL.revokeObjectURL(img.src); rej(err); };
                img.src = URL.createObjectURL(blob);
            });
        } catch (e) {
            console.error(`外框圖片載入失敗`, e);
            return null;
        }
    })();

    if (end <= start) {
        console.log(end, start);
        simpleToast({ content: '結束時間需大於開始時間', type: 'error' });
        return;
    }

    const mainCtx = canvas.getContext('2d');

    let exportVideo = null;
    let output = null;

    const popup = popupWindow({
        title: "渲染影片",
        content: "準備中...",
        unclosable: true,
        buttons: [{ text: '取消', hideOnClick: true }],
    })
    try {
        if (popup.isClosed) return;

        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        const offCtx = off.getContext('2d');

        const scaleValue = renderer?.scale ?? scale;
        const p = Math.min(width, height) / scaleBase * scaleValue;
        offCtx.setTransform(p, 0, 0, p, width / 2, height / 2);

        const target = new BufferTarget();
        const format = new Mp4OutputFormat({ fastStart: 'in-memory' });
        output = new Output({ format, target });

        // 視訊軌設定
        const encodingConfig = {
            codec: 'avc',
            bitrate: QUALITY_HIGH,
            keyFrameInterval: 0.5,
            latencyMode: 'quality'
        };

        const videoSource = new CanvasSource(off, encodingConfig);
        output.addVideoTrack(videoSource, { frameRate: fps });

        let exportVideoReady = false;
        if (editorBackgroundVideo && editorBackgroundVideo.src) {
            try {
                exportVideo = document.createElement('video');
                exportVideo.src = editorBackgroundVideo.src;
                exportVideo.muted = true;
                exportVideo.crossOrigin = 'anonymous';
                exportVideo.preload = 'auto';
                exportVideo.style.position = 'fixed';
                exportVideo.style.left = '-9999px';
                exportVideo.style.top = '0';
                exportVideo.style.width = '1px';
                exportVideo.style.height = '1px';
                exportVideo.style.opacity = '0.01';
                exportVideo.style.pointerEvents = 'none';
                document.body.appendChild(exportVideo);
                await new Promise((res) => {
                    let done = false;
                    const onloaded = () => { if (done) return; done = true; res(); };
                    exportVideo.addEventListener('loadedmetadata', onloaded);
                    setTimeout(() => { if (done) return; done = true; res(); }, 1500);
                });
                exportVideoReady = true;
            } catch (e) {
                console.warn('建立匯出用背景影片失敗', e);
            }
        }

        if (popup.isClosed) return;

        let audioSource = null;
        let slicedAudio = null;

        // 🔴 核心重構：先完整合成好音訊，拿到規格後再向 output 註冊音軌
        if (includeAudio) {
            if (includeBgm) {
                const t = audioManager.getBGMDuration();
                if (start < t && start < end) {
                    const sliceAudioBuffer = (buf, s, e) => {
                        const sr = buf.sampleRate;
                        const startSample = Math.max(0, Math.floor(s * sr));
                        const endSample = Math.min(buf.length, Math.floor(e * sr));
                        const len = Math.max(0, endSample - startSample);
                        if (len <= 0) return null;
                        const nb = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
                        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
                            const data = buf.getChannelData(ch).subarray(startSample, endSample);
                            nb.getChannelData(ch).set(data);
                        }
                        return nb;
                    };

                    const bgmBuf = audioManager.bgmBuffer;
                    slicedAudio = bgmBuf ? sliceAudioBuffer(bgmBuf, start, end) : null;
                }
            }

            if (includeSfx) {
                const sfxEvents = [];
                const longSoundEvents = [];
                const sfxFrameSet = new Set();

                for (let ni = 0; ni < notes.length; ni++) {
                    const note = notes[ni];
                    const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);
                    const startT = note.time + musicDelay;
                    const endT = note.time + skipT + musicDelay;

                    if (startT >= start && startT <= end) {
                        note._startEffectPlayed = false;
                        const evs = audioManager.getSfxEventsForNote(note, startT + (note.slideDelay ?? 0));
                        if (!(note.type === "slide" && !note.firstSlide)) {
                            for (const ev of evs) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                            note._startEffectPlayed = true;
                        }
                    }
                    if (endT >= start && endT <= end) {
                        note._startEffectPlayed = true;
                        const shouldPlayEndSound =
                            (note.type === "slide" && note.lastSlide && note.isBreak) ||
                            note.isHanabi ||
                            (note.holdDuration !== undefined && note.type !== "tap");
                        if (shouldPlayEndSound) {
                            const evsEnd = audioManager.getSfxEventsForNote(note, endT);
                            for (const ev of evsEnd) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                        }
                        note._endEffectPlayed = true;
                    }
                    if (note.type === 'touch' && note.holdDuration > 0) {
                        if (startT < end && endT > start) {
                            longSoundEvents.push({ key: 'touchHold_riser', startSec: startT, endSec: endT });
                        }
                    }
                }

                sfxEvents.sort((a, b) => a.time - b.time);

                // 內部核心混音工廠
                const mixSfxInto = (baseBuf, events, longEvents, s, e) => {
                    const sr = baseBuf ? baseBuf.sampleRate : (audioManager.ctx.sampleRate || 48000);
                    const outLen = Math.max(1, Math.ceil((e - s) * sr));
                    const bgmChannels = baseBuf ? baseBuf.numberOfChannels : 0;

                    let sfxMaxCh = 1;
                    for (const [k, b] of audioManager.bufferMap.entries()) {
                        if (b && b.numberOfChannels > sfxMaxCh) sfxMaxCh = b.numberOfChannels;
                    }
                    const outCh = Math.max(bgmChannels || 0, sfxMaxCh || 1);
                    const out = new AudioBuffer({ length: outLen, numberOfChannels: outCh, sampleRate: sr });

                    if (baseBuf) {
                        for (let ch = 0; ch < outCh; ch++) {
                            const dst = out.getChannelData(ch);
                            const src = baseBuf.getChannelData(ch < baseBuf.numberOfChannels ? ch : 0);
                            const copyLen = Math.min(src.length, outLen);
                            for (let i = 0; i < copyLen; i++) {
                                dst[i] = src[i] * bgmVolume;
                            }
                        }
                    }

                    const addLoopingBufferAt = (key, eventStartSec, eventEndSec) => {
                        const sfxBuf = audioManager.bufferMap.get(key);
                        if (!sfxBuf) return;
                        const loop = audioManager.loopPoints[key];
                        const finalVol = 0.5 * sfxVolume;
                        const sfxRate = sfxBuf.sampleRate || sr;

                        const audibleStartSec = Math.max(s, eventStartSec);
                        const audibleEndSec = Math.min(e, eventEndSec);
                        if (audibleStartSec >= audibleEndSec) return;

                        const startIdx = Math.floor((audibleStartSec - s) * sr);
                        const endIdx = Math.floor((audibleEndSec - s) * sr);

                        for (let ch = 0; ch < sfxBuf.numberOfChannels; ch++) {
                            const src = sfxBuf.getChannelData(ch);
                            const dst = out.getChannelData(ch < outCh ? ch : 0);

                            for (let idx = startIdx; idx < endIdx; idx++) {
                                if (idx < 0 || idx >= outLen) continue;
                                const timeSinceEventStart = (s + idx / sr) - eventStartSec;
                                let sampleSec = timeSinceEventStart;

                                if (loop) {
                                    if (sampleSec >= loop.end) {
                                        sampleSec = loop.start + ((sampleSec - loop.end) % (loop.end - loop.start));
                                    }
                                } else if (sampleSec >= sfxBuf.length / sfxRate) {
                                    continue;
                                }

                                const srcPos = sampleSec * sfxRate;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                const frac = srcPos - srcIdx0;
                                const s0 = (srcIdx0 >= 0 && srcIdx0 < src.length) ? src[srcIdx0] : 0;
                                const s1 = (srcIdx1 >= 0 && srcIdx1 < src.length) ? src[srcIdx1] : 0;
                                const sampleVal = s0 * (1 - frac) + s1 * frac;
                                dst[idx] += sampleVal * finalVol;
                            }
                        }
                    };

                    for (const lev of longEvents) {
                        addLoopingBufferAt(lev.key, lev.startSec, lev.endSec);
                    }

                    const addBufferAt = (sfxBuf, atSec, baseVol, isMono, cutoffSec) => {
                        if (!sfxBuf) return;
                        const finalVol = (baseVol ?? 1) * sfxVolume;
                        const dstRate = sr;
                        const srcRate = sfxBuf.sampleRate || sr;
                        const dstStart = Math.floor((atSec - s) * dstRate);
                        const ratio = srcRate / dstRate;

                        let maxDurationSec = sfxBuf.length / srcRate;
                        if (isMono && cutoffSec !== undefined) {
                            maxDurationSec = Math.min(maxDurationSec, cutoffSec - atSec);
                        }
                        const maxDstSamples = Math.floor(maxDurationSec * dstRate);

                        for (let ch = 0; ch < outCh; ch++) {
                            const src = sfxBuf.getChannelData(ch < sfxBuf.numberOfChannels ? ch : 0);
                            const dst = out.getChannelData(ch);

                            for (let i = 0; i < maxDstSamples; i++) {
                                const dstIdx = dstStart + i;
                                if (dstIdx < 0) continue;
                                if (dstIdx >= outLen) break;

                                const srcPos = i * ratio;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                if (srcIdx0 >= src.length) break;

                                const frac = srcPos - srcIdx0;
                                const s0 = src[srcIdx0] || 0;
                                const s1 = src[srcIdx1] || 0;
                                const sample = s0 * (1 - frac) + s1 * frac;

                                dst[dstIdx] += sample * finalVol;
                            }
                        }
                    };

                    const lastTriggerTimes = new Map();

                    for (let i = 0; i < events.length; i++) {
                        const ev = events[i];
                        if (lastTriggerTimes.has(ev.key)) {
                            const lastTime = lastTriggerTimes.get(ev.key);
                            if (ev.time - lastTime == 0) {
                                continue;
                            }
                        }
                        lastTriggerTimes.set(ev.key, ev.time);

                        const sfxBuf = audioManager.bufferMap.get(ev.key);
                        if (!sfxBuf) continue;

                        let cutoffSec = undefined;
                        if (ev.isMono) {
                            for (let j = i + 1; j < events.length; j++) {
                                if (events[j].key === ev.key && events[j].isMono) {
                                    cutoffSec = events[j].time;
                                    break;
                                }
                            }
                        }
                        addBufferAt(sfxBuf, ev.time, ev.volume, ev.isMono, cutoffSec);
                    }

                    let peak = 0;
                    for (let ch = 0; ch < outCh; ch++) {
                        const d = out.getChannelData(ch);
                        for (let i = 0; i < d.length; i++) {
                            const v = Math.abs(d[i]);
                            if (v > peak) peak = v;
                        }
                    }
                    if (peak > 1) {
                        const scale = 1 / peak;
                        for (let ch = 0; ch < outCh; ch++) {
                            const d = out.getChannelData(ch);
                            for (let i = 0; i < d.length; i++) {
                                d[i] *= scale;
                            }
                        }
                    }
                    return out;
                };

                slicedAudio = mixSfxInto(slicedAudio, sfxEvents, longSoundEvents, start, end);
            }

            if (slicedAudio) {
                // 🔴 關鍵修正：強制將採樣率轉換為 48000 Hz (Opus 編碼器要求)
                slicedAudio = await resampleAudioBuffer(slicedAudio, 44100);

                // 🔴 補上靜音，使音軌長度與視訊精確對齊
                const targetLen = Math.max(1, Math.ceil((end - start) * slicedAudio.sampleRate));
                slicedAudio = padAudioBuffer(slicedAudio, targetLen);
            }
        }

        if (popup.isClosed) {
            try { renderer.setContext(mainCtx); } catch (e) { }
            return;
        }

        if (slicedAudio) {
            audioSource = new AudioBufferSource({
                codec: 'aac',
                bitrate: QUALITY_HIGH,
                sampleRate: slicedAudio.sampleRate,
                numberOfChannels: slicedAudio.numberOfChannels
            });
            output.addAudioTrack(audioSource);
        }

        // 🔴 順序修正：此時音、視訊軌皆已配置完整，安心啟動
        await output.start();

        // 啟動後，將音訊資料塞入
        if (includeAudio && audioSource && slicedAudio) {
            await audioSource.add(slicedAudio);
        }

        renderer.setContext(offCtx);

        const seekVideoTo = (video, time) => {
            if (!video) return Promise.resolve();
            return new Promise((res) => {
                let done = false;
                const onseek = () => {
                    if (done) return;
                    done = true;
                    video.removeEventListener('seeked', onseek);
                    res();
                };
                video.addEventListener('seeked', onseek);
                try {
                    video.currentTime = time;
                } catch (e) {
                    console.error("seek video failed", e);
                }
                setTimeout(() => {
                    if (done) return;
                    done = true;
                    res();
                }, 150);
            });
        };

        const total = end - start;
        const frameCount = Math.max(1, Math.ceil(total * fps));
        const step = 1 / fps;

        const simaiLogicControler = new SimaiLogicControler();
        let nowIndexLocal = 0;

        popup.setContent(`開始逐幀渲染：${frameCount} 幀`);
        for (let i = 0; i < frameCount; i++) {
            if (popup.isClosed) {
                console.log('逐幀渲染已取消');
                try { renderer.setContext(mainCtx); } catch (e) { }
                return;
            }

            const t = start + i * step;
            const globalT = t - (musicDelay || 0);

            const {
                buckets,
                playCombo: playComboLocal,
                playScore: playScoreLocal,
                noteQuantity,
                nowIndex: updatedNowIndex
            } = simaiLogicControler.get({
                renderer,
                globalTime: globalT,
                realTime: t,
                musicDelay,
                playing: false,
                timeControlSliding: false,
                readyBeat: false,
                playedClock: [],
                settings,
                visualHeight: 0,
                notes,
                decodedTags: [],
                playScoreRes,
                nowIndex: nowIndexLocal,
                skipAudioQueue: true,
            });
            nowIndexLocal = updatedNowIndex;

            try {
                offCtx.save();
                offCtx.setTransform(1, 0, 0, 1, 0, 0);
                offCtx.fillStyle = settings.backgroundColor || '#000';
                offCtx.fillRect(0, 0, off.width, off.height);
                const rs = renderer.scale || scale;

                const boxSize = Math.min(off.width, off.height);
                const boxX = Math.round((off.width - boxSize) / 2);
                const boxY = Math.round((off.height - boxSize) / 2);
                const boxW = boxSize, boxH = boxSize;

                const drawContain = (srcW, srcH, drawFn) => {
                    if (!srcW || !srcH) return drawFn(0, 0, srcW, srcH, boxX, boxY, boxW, boxH);
                    const scale = Math.min(boxW / srcW, boxH / srcH) * rs;
                    const dw = Math.round(srcW * scale);
                    const dh = Math.round(srcH * scale);
                    const dx = Math.round(boxX + (boxW - dw) / 2);
                    const dy = Math.round(boxY + (boxH - dh) / 2);
                    return drawFn(0, 0, srcW, srcH, dx, dy, dw, dh);
                };

                if (exportVideo && exportVideoReady && (exportVideo.duration || exportVideo.videoWidth)) {
                    const bgTarget = Math.max(0, Math.min((exportVideo.duration || 0) - 0.001, t));
                    await seekVideoTo(exportVideo, bgTarget);
                    try { offCtx.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    const vw = exportVideo.videoWidth || exportVideo.width || boxW;
                    const vh = exportVideo.videoHeight || exportVideo.height || boxH;
                    drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(exportVideo, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                } else if (editorBackgroundImage && editorBackgroundImage.src && editorBackgroundImage.complete) {
                    const img = editorBackgroundImage;
                    const iw = img.naturalWidth || img.width || boxW;
                    const ih = img.naturalHeight || img.height || boxH;
                    try { offCtx.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    drawContain(iw, ih, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(img, sx, sy, sw || iw, sh || ih, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                }

                if (outlineImage) {
                    offCtx.setTransform(p, 0, 0, p, width / 2, height / 2);
                    offCtx.drawImage(outlineImage, scaleBase * -0.5 * 0.9, scaleBase * -0.5 * 0.9, scaleBase * 0.9, scaleBase * 0.9);
                }
            } finally {
                offCtx.restore();
            }

            renderer.drawFrame({
                globalTime: globalT,
                buckets,
                dt: step,
                showSensor: settings.showSensor,
                showSensorText: false,
                playCombo: playComboLocal,
                playScore: playScoreLocal,
                nowIndex: nowIndexLocal,
                skipClear: true,
                noteQuantity,
                playScoreRes,
            });

            const tsRelative = i * step;
            await videoSource.add(tsRelative, step);

            popup.setProgress(((i + 1) / frameCount) * 100);
            popup.setContent(`渲染中：第 ${i + 1} / ${frameCount} 幀 (${(((i + 1) / frameCount) * 100).toFixed(2)}%)`);

            // 讓出主執行緒，供瀏覽器重繪 UI 與處理點擊取消事件
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        await output.finalize();
        const mime = await output.getMimeType();
        const ext = output.format?.fileExtension || '.mp4';
        const buf = target.buffer;
        if (!buf) throw new Error('未取得輸出 buffer');

        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `simai_render${ext}`; document.body.appendChild(a); a.click(); a.remove();

        simpleToast({ content: '逐幀渲染完成，檔案已下載', type: 'success', timeout: 2500 });

        renderer.setContext(mainCtx);
        popup.setProgress(100);
        popup.setContent('完成');

        setTimeout(() => {
            popup.close();
        }, 3000);
    } catch (err) {
        console.error('逐幀渲染失敗', err);
        simpleToast({ content: '渲染失敗：' + String(err), type: 'error' });
        try { popup.setContent('錯誤：' + String(err)); } catch (e) { }
        try { renderer.setContext(mainCtx); } catch (e) { }
    } finally {
        if (exportVideo && exportVideo.parentNode) {
            exportVideo.parentNode.removeChild(exportVideo);
        }
        if (output && output.state !== 'finalized' && output.state !== 'canceled') {
            output.cancel().catch(e => console.error("Error cancelling output:", e));
        }
    }
}

export class SimaiLogicControler {
    constructor() {
    }

    get({
        renderer,
        globalTime,
        realTime,
        musicDelay,
        playing,
        timeControlSliding,
        readyBeat,
        playedClock,
        settings = {},
        visualHeight,
        notes = [],
        decodedTags,
        playScoreRes,
        nowIndex,
        skipAudioQueue = false,
    }) {
        const V = visualHeight / settings.visualZoom;
        const effectDecayTime = settings.effectDecayTime;
        const hanabiEffectDecayTime = settings.hanabiEffectDecayTime;
        const maxSlideCount = settings.maxSlideCount;
        const middleDistance = settings.middleDistance;
        const notesLength = notes.length;

        // 初始化 index
        if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
            nowIndex = 0;
        }

        // 節拍器邏輯
        if (playing && readyBeat) {
            const beatDuration = 240 / clockBpm;
            for (let i = 0; i < 4; i++) {
                const clockT = (i / 4) * beatDuration - globalTime;
                if (clockT > 0) {
                    playedClock[i] = false;
                } else if (!playedClock[i]) {
                    audioManager.queueSoundSingle('clock', clockT);
                    playedClock[i] = true;
                }
            }
        }

        // 準備繪製桶子
        const buckets = { slide: [], tapnhold: [], touch: [] };
        const visualBuckets = { slide: [], tapnhold: [], touch: [], tags: [] };

        const noteQuantity = { slide: 0, tap: 0, hold: 0, touch: 0, break: 0 };

        let playCombo = 0;
        let playScore = 0;
        let slideOnScreenCount = 0;
        let foundIndexForThisFrame = false;

        // 核心音符迴圈
        for (let i = notesLength - 1; i >= 0; i--) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;
            const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0);

            const calcPiecewiseSpeed = (x) => {
                if (x >= 1) {
                    return x * 0.8833 + 0.8167;
                } else if (x <= -1) {
                    return x * 0.8833 - 0.8167;
                } else {
                    return x * 1.7;
                }
            };
            const noteHispeed = note.hispeed ?? 1;
            // 2. 精準套用至常規速度與 Touch 速度
            const speedCoeff = calcPiecewiseSpeed(settings.speed * noteHispeed);
            const touchSpeedCoeff = calcPiecewiseSpeed(settings.touchSpeed * noteHispeed);


            // 索引追蹤（早期完成以減少迴圈計算）
            if (!foundIndexForThisFrame && realTime >= (note.time + musicDelay) && noteType !== "slide") {
                nowIndex = note.index ?? nowIndex;
                foundIndexForThisFrame = true;
            }

            // Combo 計算：提前計算避免重複條件檢查
            if (noteT < 0) {
                const shouldCountCombo =
                    (noteType === "slide" ? (note.lastSlide && skipT + noteT < 0) :
                        noteType === "hold" ? (skipT + noteT < 0) :
                            noteType === "touch" && note.holdDuration !== undefined ? (skipT + noteT < 0) :
                                noteType !== "slide");
                if (shouldCountCombo) {
                    if (note.isBreak) {
                        noteQuantity.break++;
                    } else if (note.isHold) {
                        noteQuantity.hold++;
                    } else {
                        noteQuantity[noteType]++;
                    }
                    playCombo++;
                    playScore += ((note.isBreak ? 5 :
                        (noteType === "slide" ? 3 :
                            note.holdDuration !== undefined ? 2 : 1)
                    ) * playScoreRes.invScore) * 100 + (note.isBreak ? playScoreRes.breakScore : 0);
                }
            }

            // 音效和狀態管理
            if (!skipAudioQueue) {
                if (playing && !timeControlSliding) {
                    // Riser 邏輯
                    if (noteType === "touch" && note.holdDuration > 0) {
                        const isInsideHold = noteT <= 0 && -noteT < note.holdDuration;
                        const noteId = `riser_${note.pos}_${note.time}`;
                        if (isInsideHold && !note._riserActive) {
                            audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                            note._riserActive = true;
                        } else if (!isInsideHold && note._riserActive) {
                            audioManager.stopLongSound(noteId);
                            note._riserActive = false;
                        }
                    }

                    const lookAhead = 0.1; // 100ms look-ahead

                    // 開始音效 (含前瞻)
                    const startTargetT = note.time + (note.slideDelay ?? 0);
                    const startNoteT = startTargetT - globalTime;
                    if (startNoteT <= lookAhead && !note._startEffectPlayed) {
                        if (!(noteType === "slide" && !note.firstSlide)) {
                            audioManager.queueSound(note, startTargetT);
                        }
                        note._startEffectPlayed = true;
                    }
                    // 結束音效 (含前瞻)
                    const endTargetT = note.time + skipT;
                    const endNoteT = endTargetT - globalTime;
                    if (endNoteT <= lookAhead && !note._endEffectPlayed) {
                        const shouldPlayEndSound =
                            (noteType === "slide" && note.lastSlide && note.isBreak) ||
                            note.isHanabi ||
                            (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd);
                        if (shouldPlayEndSound) {
                            audioManager.queueSound(note, endTargetT);
                        }
                        note._endEffectPlayed = true;
                    }
                } else {
                    // 倒帶或拖動時重置狀態
                    const lookAhead = 0.1;
                    const startTargetT = note.time + (note.slideDelay ?? 0);
                    const endTargetT = note.time + skipT;
                    if (startTargetT - globalTime > lookAhead) {
                        note._startEffectPlayed = false;
                    }
                    if (endTargetT - globalTime > lookAhead) {
                        note._endEffectPlayed = false;
                    }
                    if (note.time - globalTime > 0) {
                        if (note._riserActive) {
                            audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                            note._riserActive = false;
                        }
                    }
                }
            }

            // 繪製可見性判斷
            const t = 1 - renderer.timeFunction(noteT * Math.abs(speedCoeff));
            const touchT = 1 - renderer.timeFunction(noteT * Math.abs(touchSpeedCoeff));

            const isVisible =
                (noteType === "slide" ? t >= middleDistance :
                    noteType === "touch" ? touchT >= -1 :
                        t >= -1)
                && -noteT <= skipT + (note.isHanabi ? hanabiEffectDecayTime : (note.type === 'slide' ? 0 : effectDecayTime));

            const isVisualVisible = noteT >= 0
                ? Math.abs(noteT) <= V
                : -noteT <= V + skipT;

            // 快速分類到桶子
            if (isVisible) {
                if (noteType === 'slide') {
                    if (slideOnScreenCount < maxSlideCount) {
                        buckets.slide.push(note);
                        slideOnScreenCount++;
                    }
                } else if (noteType === 'hold' || noteType === 'tap') {
                    buckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    buckets.touch.push(note);
                }
            }

            if (isVisualVisible) {
                if (noteType === 'slide') {
                    visualBuckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    visualBuckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    visualBuckets.touch.push(note);
                }
            }
        }

        const tagsLength = decodedTags.length;
        for (let i = 0; i < tagsLength; i++) {
            const tag = decodedTags[i];
            visualBuckets.tags.push(tag);
            if (Math.abs(tag.time - globalTime) <= V) {
                // 標籤邏輯保留（如果需要額外處理）
            }
        }

        return { buckets, playCombo, playScore, visualBuckets, noteQuantity, nowIndex };
    }
}