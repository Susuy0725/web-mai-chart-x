export const
    scaleBase = 100,
    innerCirleBase = (() => { const innerCirleScale = 0.889; return scaleBase * innerCirleScale / 2 })();

export async function getImg(imageSrc) { const img = new Image(); img.src = imageSrc; await img.decode(); return img; }
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
export function drawArrowShape(ctx) {
    const size = 2.5; // 箭頭大小
    ctx.beginPath();
    ctx.moveTo(-size, -size); // 左後
    ctx.lineTo(size, 0);      // 尖端 (朝向前方)
    ctx.lineTo(-size, size);  // 右後
    ctx.lineTo(-size * 0.6, 0); // 往內凹一點點，看起來更像箭頭
    ctx.closePath();
    ctx.fill();
}
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
class AudioManager {
    constructor() {
        this.globalGain = 0.7; // 預設音量

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

        this.soundFiles = {
            'clock': './Sounds/clock.wav',
            'judge': './Sounds/judge.wav',
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

        this.activeLongSounds = new Map();
        this.loopPoints = {
            'touchHold_riser': { start: 10, end: 11.8 }
        };
    }

    /**
     * 動態調整全域音量 (0.0 到 1.0)
     */
    setGlobalVolume(value) {
        this.globalGain = Math.max(0, Math.min(1, value));
        // 使用 exponentialRamp 讓音量調整聽起來更自然，且防止爆音
        this.masterGain.gain.setTargetAtTime(this.globalGain, this.ctx.currentTime, 0.05);
    }

    /**
     * 初始化並預載入所有音效
     */
    async init() {
        const loadTasks = Object.entries(this.soundFiles).map(async ([key, url]) => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.bufferMap.set(key, audioBuffer);
                console.log(`[Audio] 載入完成: ${key}`);
            } catch (e) {
                console.error(`[Audio] 載入失敗: ${key}`, e);
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
        this._checkAndPush(sample, targetTime, true);
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
                if (note.isBreak) {
                    key = "judge_break"
                    this._checkAndPush("break", targetTime, true);
                };
                this._checkAndPush("answer", targetTime, false);
                break;
            case "hold":
                this._checkAndPush("answer", targetTime, false);
                if (!note.startEffectPlayed) {
                    if (note.isBreak) {
                        key = "judge_break";
                        this._checkAndPush("break", targetTime, true);
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
                if (note.isHanabi) {
                    if (note.holdDuration >= 0) {
                        if (note.startEffectPlayed) {
                            key = "hanabi"
                            isMono = true;
                        } else return;
                    } else {
                        key = "hanabi"
                        isMono = true;
                    }
                }
                this._checkAndPush("answer", targetTime, false);
                if (note.startEffectPlayed && !note.isHanabi) return;
                break;
            case "slide":
                if (!note.startEffectPlayed && note.isBreak) {
                    this._checkAndPush("break_slide", targetTime, true);
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

        this._checkAndPush(key, targetTime, isMono);
    }

    /**
     * 內部檢查冷卻時間並推入佇列
     */
    _checkAndPush(key, targetTime, isMono) {
        const now = performance.now();
        const lastTime = this.lastQueuedTimes.get(key) || 0;

        // --- 攔截 B: 防止機槍音 (15ms 內同類音效不重複觸發) ---
        if (now - lastTime < this.MIN_INTERVAL) return;

        this.lastQueuedTimes.set(key, now);
        this.soundQueue.push({ key, targetTime, isMono });

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
            const { key, isMono } = this.soundQueue.shift();
            this.play(key, isMono);
        }
    }

    /**
     * 執行最終播放 (Web Audio API 核心)
     */
    play(key, isMono = false) {
        const buffer = this.bufferMap.get(key);
        if (!buffer) return;

        // 解鎖 iOS/Chrome 的音訊限制 (如果 ctx 處於 suspended 狀態)
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // 如果是 Mono 模式，中斷該類型上一個正在播放的聲音
        if (isMono && this.playingSources.has(key)) {
            try {
                this.playingSources.get(key).stop();
            } catch (e) { }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.masterGain);

        if (isMono) {
            this.playingSources.set(key, source);
        }

        source.start(0); // 立即發聲
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
        gainNode.connect(this.masterGain);

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