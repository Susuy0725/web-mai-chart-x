import { SimaiRenderer as BaseSimaiRenderer } from '../Scripts/renderer.js';
import {
    scaleBase,
    innerCirleBase,
} from '../Scripts/core/chartGeometry.js';
import {
    touchPaths,
    easeOutQuad,
    easeInBack,
} from '../Scripts/helper.js';

// --- _play 專屬載入畫面常數與文字描邊輔助 ---

const LEVEL_COLORS = {
    1: "#248ACA",
    2: "#43C122",
    3: "#FFBA01",
    4: "#FE5963",
    5: "#A356E9",
    6: "#E3E6E5",
    7: "#FF6EFC",
};

const LEVEL_NAMES = {
    1: 'EAZY',
    2: 'BASIC',
    3: 'ADVANCED',
    4: 'EXPERT',
    5: 'MASTER',
    6: 'Re:MASTER',
    7: 'U•TA•GE'
};

let CARD_PATH = null;
let LV_PATH = null;
let CAPSULE_PATH = null;
if (typeof Path2D !== 'undefined') {
    CARD_PATH = new Path2D();
    CARD_PATH.arc(16, 25, 2, 0, Math.PI * 0.5);
    CARD_PATH.arc(-16, 25, 2, Math.PI * 0.5, Math.PI * 1);
    CARD_PATH.arc(-16, -33.5, 2, Math.PI * 1, Math.PI * 1.5);
    CARD_PATH.arc(-2, -33.5, 2, Math.PI * 1.5, Math.PI * 2);
    CARD_PATH.arc(2, -32, 2, Math.PI * 1, Math.PI * 0.5, true);
    CARD_PATH.arc(16, -28, 2, Math.PI * 1.5, Math.PI * 2);
    CARD_PATH.closePath();

    LV_PATH = new Path2D();
    LV_PATH.arc(16, -0.5, 2, 0, Math.PI * 0.5);
    LV_PATH.arc(7.5, 3.5, 2, Math.PI * 1.5, Math.PI * 1, true);
    LV_PATH.arc(3.5, 5.5, 2, 0, Math.PI * 0.5);
    LV_PATH.lineTo(18, 7.5);
    LV_PATH.closePath();

    CAPSULE_PATH = new Path2D();
    CAPSULE_PATH.arc(-2.5, -33, 2, Math.PI * 1.5, Math.PI * 0.5);
    CAPSULE_PATH.arc(-15.5, -33, 2, Math.PI * 0.5, Math.PI * 1.5);
    CAPSULE_PATH.closePath();
}

const charWidthCache = {};

function textMonospace(ctx, text, x, y, cellWidth, mode = 'stroke') {
    ctx.textAlign = 'left';
    const fontKey = ctx.font;
    let cache = charWidthCache[fontKey];
    if (!cache) {
        cache = charWidthCache[fontKey] = {};
    }

    const isStroke = (mode === 'stroke');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        let charWidth = cache[char];
        if (charWidth === undefined) {
            charWidth = ctx.measureText(char).width;
            cache[char] = charWidth;
        }

        const charX = x + (i * cellWidth) + ((cellWidth - charWidth) * 0.5);
        if (isStroke) {
            ctx.strokeText(char, charX, y);
        } else {
            ctx.fillText(char, charX, y);
        }
    }
}

function outlineText(ctx, text, x, y, fontSize, outlinePx = 2, {
    fillStyle = "#FFFFFF",
    strokeStyle = "#000000",
    strokeWidth = outlinePx,
    fontWeight = "bold",
    fontFamily = "combo",
    textAlign = "center",
    textBaseline = "middle",
    letterSpacing = "0px",
    shadowHeight = 0.3,
    cellWidth = fontSize * 0.8,
} = {}) {
    if (!text) return;
    const addedSpacing = letterSpacing ? fontSize * parseFloat(letterSpacing) : 0;
    const finalCellWidth = Math.max(cellWidth + addedSpacing, 0);

    let calX = x;
    if (textAlign === "center") {
        calX = x - ((text.length * finalCellWidth) * 0.5);
    } else if (textAlign === "right") {
        calX = x - (text.length * finalCellWidth);
    }

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = textBaseline;
    ctx.fillStyle = fillStyle;
    ctx.lineWidth = strokeWidth;

    if (strokeWidth > 0) {
        ctx.strokeStyle = "#000";
        textMonospace(ctx, text, calX, y + shadowHeight, finalCellWidth, 'stroke');
        ctx.strokeStyle = strokeStyle;
        textMonospace(ctx, text, calX, y, finalCellWidth, 'stroke');
    }
    textMonospace(ctx, text, calX, y, finalCellWidth, 'fill');
    ctx.restore();
}

function darkenHexColor(hex, percent) {
    let cleanHex = hex.replace(/^#/, '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    const num = parseInt(cleanHex, 16);
    const factor = 1 - (percent / 100);

    const r = Math.max(0, Math.floor((num >> 16) * factor));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * factor));
    const b = Math.max(0, Math.floor((num & 0x0000FF) * factor));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getAnimationProgress(t = 0, duration = 1) {
    return Math.min(Math.max(t / duration, 0), 1);
}

function aniCurve1(t) {
    return Math.pow(1 - 2 * t, 4);
}

/**
 * 遊玩模式專用 SimaiRenderer
 * 繼承主線 BaseSimaiRenderer 以自動同步所有渲染器與特效更新，
 * 僅透過鉤子與方法覆寫保留 _play 的判定狀態、感應區高亮、101%- 計分與開場動畫。
 */
export class SimaiRenderer extends BaseSimaiRenderer {
    constructor(canvas, settings) {
        super(canvas, settings);
    }

    // --- 1. 開關策略（未明確設為 false 時預設啟用） ---

    shouldDrawHitEffects() {
        return this.settings?.drawHitEffect !== false;
    }

    shouldDrawHanabiEffects() {
        return this.settings?.drawHanabiEffect !== false;
    }

    // --- 2. 真實遊玩判定與 Slide JUST / Break 分級 ---

    canSpawnJudgeEffect(note, judgeResult) {
        return !!(this.isPlaying && this.settings && this.settings.showJudge !== false && note && judgeResult);
    }

    shouldDrawJudgeEffects() {
        return !!(this.isPlaying && this.settings && this.settings.showJudge !== false && this.judgeEffects && this.judgeEffects.length > 0);
    }

    resolveJudgeEffectInfo(note, judgeResult) {
        const isBreak = !!note.isBreak;
        const grade = judgeResult.grade;
        let breakScoreValue = judgeResult.breakScoreValue;

        if (isBreak && (breakScoreValue === undefined || breakScoreValue === null)) {
            if (grade === 'CRITICAL_PERFECT') {
                breakScoreValue = 2600;
            } else if (grade === 'PERFECT') {
                breakScoreValue = (judgeResult.breakMultiplier === 0.5) ? 2500 : 2550;
            } else if (grade === 'GREAT') {
                breakScoreValue = (judgeResult.scoreMultiplier <= 0.5) ? 1250 : ((judgeResult.scoreMultiplier <= 0.6) ? 1500 : 2000);
            } else if (grade === 'GOOD') {
                breakScoreValue = 1000;
            } else {
                breakScoreValue = 0;
            }
        }

        const text = isBreak ? `${breakScoreValue}` : (grade === 'CRITICAL_PERFECT' ? 'PERFECT' : grade);
        const info = this._tempJudgeInfo;
        info.isBreak = isBreak;
        info.grade = grade;
        info.breakScoreValue = breakScoreValue;
        info.text = text;
        return info;
    }

    resolveSlideJustImageKeyByGrade(eff, state, showCP) {
        if (eff.grade === 'MISS') {
            return `miss_${state}`;
        }
        if (eff.grade === 'CRITICAL_PERFECT') {
            return showCP ? `just_${state}` : `just_${state}_p`;
        }
        if (eff.grade === 'PERFECT') {
            // 參照 SlideJudge.cs L215-248：FastPerfect / LatePerfect 不顯示 Critical，一律使用 Perfect
            return `just_${state}_p`;
        }
        if (eff.grade === 'GREAT') {
            return (eff.subGrade === 'FAST') ? `just_${state}_fast_gr` : `just_${state}_late_gr`;
        }
        if (eff.grade === 'GOOD') {
            return (eff.subGrade === 'FAST') ? `just_${state}_fast_gd` : `just_${state}_late_gd`;
        }
        return null;
    }

    drawSlideJustBreakOverlay(ctx, eff, img, drawX, drawY, judgeWidth, judgeHeight, elapsed) {
        // 參照 SlideJudge.cs L250-286：Break Slide 於 Critical 判定時疊加 SpriteRenderAdd 脈動閃光
        if (!eff.isBreak || eff.grade !== 'CRITICAL_PERFECT' || !img) return;
        const frameCount = Math.floor(elapsed * 60);
        const pulse = 0.5 + Math.sin(frameCount * Math.PI * 0.5) * 0.5;
        const addAlpha = 0.25 * pulse;
        if (addAlpha <= 0.005) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= addAlpha;
        ctx.drawImage(img, drawX, drawY, judgeWidth, judgeHeight);
        ctx.restore();
    }

    resolveJudgeTextImageKey(eff) {
        const res = this._tempJudgeImageInfo;
        res.isBreakFlashing = false;

        if (eff.isBreak) {
            if (eff.grade === 'CRITICAL_PERFECT') {
                const showCP = (this.settings.showBreakCriticalPerfect !== false) && (this.settings.showCriticalPerfect !== false);
                res.imgKey = showCP ? 'judge_text_cPerfect_break' : 'judge_text_perfect_break';
                res.isBreakFlashing = true;
            } else if (eff.grade === 'PERFECT') {
                res.imgKey = 'judge_text_perfect_break';
            } else if (eff.grade === 'GREAT') {
                res.imgKey = 'judge_text_great';
            } else if (eff.grade === 'GOOD') {
                res.imgKey = 'judge_text_good';
            } else {
                res.imgKey = 'judge_text_miss';
            }
        } else {
            if (eff.grade === 'CRITICAL_PERFECT') {
                res.imgKey = (this.settings.showCriticalPerfect !== false) ? 'judge_text_normal' : 'judge_text_perfect';
            } else if (eff.grade === 'PERFECT') {
                res.imgKey = 'judge_text_perfect';
            } else if (eff.grade === 'GREAT') {
                res.imgKey = 'judge_text_great';
            } else if (eff.grade === 'GOOD') {
                res.imgKey = 'judge_text_good';
            } else {
                res.imgKey = 'judge_text_miss';
            }
        }
        return res;
    }

    // --- 3. 音符遊玩判定狀態鉤子（triggered / isHolding / holdFinish / slideProgress） ---

    handleHoldCompletedOrTriggered(s, noteT, posInfo, drawHitEffect) {
        if (!s.holdFinish) return false;
        if (drawHitEffect && s.judgeResult && s.judgeResult.grade !== 'MISS') {
            this.queueHitEffect(s.pos, s.holdDuration + noteT, s.judgeResult, posInfo.x, posInfo.y);
        }
        return true;
    }

    resolveHoldVisualState(s, noteT) {
        const state = this._tempHoldState;
        const isHoldingClean = !!s.isHolding && !s.isMine;
        if (noteT > -0.1) {
            state.img = this.getHoldImage(s.isMine, s.isBreak, s.isDouble, false);
            state.isOn = false;
            state.holdJudge = null;
        } else if (isHoldingClean) {
            state.img = this.getHoldImage(s.isMine, s.isBreak, s.isDouble, true);
            state.isOn = true;
            state.holdJudge = s._headJudge || s.judgeResult || null;
        } else {
            state.img = this.images[s.isMine ? "hold_mine" : "hold_off"];
            state.isOn = false;
            state.holdJudge = null;
        }
        return state;
    }

    handleTapOrStarCompletedOrTriggered(s, noteT, posInfo, drawHitEffect) {
        if (!s.triggered) return false;
        if (drawHitEffect && (!s.judgeResult || s.judgeResult.grade !== 'MISS')) {
            this.queueHitEffect(s.pos, s.triggeredTime - this.globalTime, s.judgeResult, posInfo.x, posInfo.y);
        }
        return true;
    }

    isNoteHiddenForEachGuide(s) {
        return s.type === 'hold' ? !!s.holdFinish : !!s.triggered;
    }

    getTouchHanabiTiming(s) {
        if (!s.isHanabi) return null;
        if (s.holdDuration) {
            if (!s.holdFinish || !s.judgeResult || s.judgeResult.grade === 'MISS') return null;
        } else {
            if (!s.triggered || (s.judgeResult && s.judgeResult.grade === 'MISS')) return null;
        }
        const noteT = (s.triggered && s.triggeredTime !== undefined)
            ? (s.triggeredTime - this.globalTime)
            : (s.time - this.globalTime);
        const out = this._tempTouchHanabi;
        out.effT = s.holdDuration ? (s.holdDuration + noteT) : noteT;
        out.clearIfNotHanabi = false;
        return out;
    }

    handleTouchHoldCompletedOrTriggered(s, noteT, posInfo) {
        if (!s.holdFinish) return false;
        if (this.shouldDrawHitEffects() && s.judgeResult && s.judgeResult.grade !== 'MISS') {
            this.queueHitEffect(null, s.holdDuration + noteT, s.judgeResult, posInfo.x, posInfo.y);
        }
        return true;
    }

    resolveTouchHoldVisualState(s, noteT) {
        const isActiveVisual = noteT > -0.1 || !!s.isHolding;
        const state = this._tempTouchHoldState;
        state.borderKey = (isActiveVisual ? "touchhold_border" : "touchhold_off") + (s.isMine ? "_mine" : "");
        state.isOn = isActiveVisual && noteT <= -0.1;
        state.holdJudge = s._headJudge || s.judgeResult || null;
        return state;
    }

    shouldQueueTouchHoldHeadHitEffect() {
        return false;
    }

    handleTouchTapCompletedOrTriggered(s, noteT, posInfo) {
        if (!s.triggered) return false;
        if (this.shouldDrawHitEffects() && (!s.judgeResult || s.judgeResult.grade !== 'MISS')) {
            this.queueHitEffect(null, s.triggeredTime - this.globalTime, s.judgeResult, posInfo.x, posInfo.y);
        }
        return true;
    }

    drawTouchExtraOverlay(s, noteT, size) {
        if (noteT < 0 && this.images?.touch_just) {
            this.drawImgAtcenter(this.images.touch_just, size * 1.8);
        }
    }

    shouldSkipSlideTrack(s) {
        const tail = s.chainTail || s;
        return !!(tail.slideFinish || s.chainFinished);
    }

    getSlideTrackProgress(s, noteT) {
        const tail = s.chainTail || s;
        const isNoteReached = -noteT >= 0;
        if (s.isMine || !isNoteReached) return 0;
        if (tail.slideFinish) return 1;
        return Math.min(1, Math.max(0, s.slideProgress || 0));
    }

    shouldSkipSlideStar(s) {
        const tail = s.chainTail || s;
        return !!(s.hideStar || tail.slideFinish || s.chainFinished);
    }

    // --- 4. 即時感應區高亮與觸控範圍偵測 ---

    hasActiveSensorOverlay(activeSensors) {
        return (this.settings.sensorHighlight !== false) && !!(activeSensors && activeSensors.size > 0);
    }

    drawActiveSensorOverlay(activeSensors) {
        if (!activeSensors || activeSensors.size === 0) return;
        const { ctx } = this;
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const p = Math.min(wPx, hPx) / scaleBase * this.scale;
        ctx.setTransform(p, 0, 0, p, wPx * 0.5, hPx * 0.5);

        // 1. 內圈感應區高亮
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
        ctx.strokeStyle = '#ffffffff';
        ctx.lineWidth = 0.6;

        for (let j = 0; j < touchPaths.length; j++) {
            const shape = touchPaths[j];
            const normId = (shape.id === 'C1' || shape.id === 'C2') ? 'C' : shape.id;
            if (activeSensors.has(normId)) {
                ctx.fill(shape.path);
                ctx.stroke(shape.path);
            }
        }
        ctx.restore();

        // 2. 外鍵延伸區域高亮 (1~8)
        const outerR1 = innerCirleBase * 1.05;
        const outerR2 = innerCirleBase * 1.28;
        for (let i = 1; i <= 8; i++) {
            if (activeSensors.has('K' + i) || activeSensors.has('A' + i)) {
                const startAng = -Math.PI / 2 + (i - 1) * (Math.PI / 4);
                const endAng = -Math.PI / 2 + i * (Math.PI / 4);
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, outerR2, startAng, endAng);
                ctx.arc(0, 0, outerR1, endAng, startAng, true);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fill();
                ctx.restore();
            }
        }
    }

    /**
     * 遊玩模式外圈按鍵區域映射為 K1~K8（供手動點擊外鍵判定）；
     * Slide 路徑感應區蒐集則透過基底 getTouchSensorIdAtPoint 一律維持 A1~A8。
     */
    getOuterSensorPrefix() {
        return 'K';
    }

    shouldHideSlideArrowsBySensor() {
        return false;
    }

    /**
     * 肥手指 (Fat Finger) 區域擴張採樣：
     * 以 (x, y) 為中心，在半徑 radius 範圍內進行多點圓形取樣，返回接觸面覆蓋的所有感應器 ID 集合
     */
    getSensorsAtPointWithRadius(x, y, radius = 4.2, ignoreD = false) {
        const sensors = new Set();
        const centerId = this.getSensorIdAtPoint(x, y, ignoreD);
        if (centerId) sensors.add(centerId);

        if (radius <= 0) return sensors;

        const outerR = radius;
        const innerR = radius * 0.55;

        const angles8 = [0, 0.785398, 1.570796, 2.356194, 3.141593, 3.926991, 4.712389, 5.497787];
        for (let i = 0; i < 8; i++) {
            const a = angles8[i];
            const sid = this.getSensorIdAtPoint(x + Math.cos(a) * outerR, y + Math.sin(a) * outerR, ignoreD);
            if (sid) sensors.add(sid);
        }

        const angles4 = [0.392699, 1.963495, 3.534292, 5.105088];
        for (let i = 0; i < 4; i++) {
            const a = angles4[i];
            const sid = this.getSensorIdAtPoint(x + Math.cos(a) * innerR, y + Math.sin(a) * innerR, ignoreD);
            if (sid) sensors.add(sid);
        }

        return sensors;
    }

    // --- 5. 遊玩專屬外圍計數 / 101%- 減分制 & 開場資訊卡動畫 ---

    drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore) {
        const { width: w, height: h } = this.getCanvasWH();
        if (h >= w) return;
        const { ctx } = this;
        const allRes = playScoreRes.tap + playScoreRes.hold + playScoreRes.slide + playScoreRes.touch + playScoreRes.break;

        const absTime = Math.abs(globalTime % 60).toFixed(2).padStart(5, '0');
        const minTime = globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60);

        ctx.save();
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font = "9px mono";
        ctx.letterSpacing = "-1px";
        ctx.fillText(`${minTime}:${absTime}`, scaleBase / -2 - 5, -1);

        ctx.letterSpacing = "0px";
        ctx.font = '4px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('Powered by', scaleBase / -2 - 3, h * 0.5 - 5);
        ctx.font = '2.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('susuy0725/web-mai-chart-x', scaleBase / -2 - 3, h * 0.5 - 2);

        const allPassed = noteQuantity.break + noteQuantity.touch + noteQuantity.slide + noteQuantity.hold + noteQuantity.tap;

        ctx.textAlign = "left";
        const aux = this._auxTextList;
        aux[0] = `${allPassed}/${allRes}`;
        aux[1] = `ALL:`;
        aux[2] = `${noteQuantity.break}/${playScoreRes.break}`;
        aux[3] = `BRK:`;
        aux[4] = `${noteQuantity.touch}/${playScoreRes.touch}`;
        aux[5] = `TOH:`;
        aux[6] = `${noteQuantity.slide}/${playScoreRes.slide}`;
        aux[7] = `SLD:`;
        aux[8] = `${noteQuantity.hold}/${playScoreRes.hold}`;
        aux[9] = `HOD:`;
        aux[10] = `${noteQuantity.tap}/${playScoreRes.tap}`;
        aux[11] = `TAP:`;

        const sp = 6;
        const lil = (aux.length * sp - Math.floor(aux.length / 2)) * 0.5 + sp;
        for (let i = 0; i < aux.length; i++) {
            const isLabel = (i % 2 !== 0);
            ctx.font = `${isLabel ? "bold 5" : "4"}px mono`;
            ctx.fillText(aux[i], scaleBase * 0.5 + 3, lil - i * sp - (isLabel ? 0 : 1));
        }

        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.font = "bold 5px mono";
        const isMinus = (this.settings.middleDisplay === 3);
        ctx.fillText(isMinus ? 'DELUXE Rate (101%-):' : 'DELUXE Rate:', scaleBase / -2 - 3, 1);
        ctx.font = "7px mono";
        const displayScore = isMinus ? (this.playScoreMinus ?? 101) : (playScore ?? 0);
        ctx.fillText(displayScore.toFixed(4) + "%", scaleBase / -2 - 3, 8);

        ctx.restore();
    }

    /**
     * 繪製載入與譜面資訊卡動畫
     */
    drawLoadingIntro({
        t = 0,
        duration = 5,
        backgroundImage = null,
        chartInfo = {},
    } = {}) {
        const ctx = this.ctx;
        ctx.save();
        this.updateCanvasMetrics();
        const dur = (duration - t);

        let img = null;
        if (backgroundImage) {
            if (backgroundImage instanceof HTMLImageElement || backgroundImage instanceof HTMLCanvasElement || (window.ImageBitmap && backgroundImage instanceof ImageBitmap)) {
                img = backgroundImage;
            } else if (backgroundImage instanceof Blob || backgroundImage instanceof File) {
                if (!this._introBlobImgCache || this._introBlobImgCache._blob !== backgroundImage) {
                    if (this._introBlobImgCache && this._introBlobImgCache._url) {
                        URL.revokeObjectURL(this._introBlobImgCache._url);
                    }
                    const url = URL.createObjectURL(backgroundImage);
                    const imgEl = new Image();
                    imgEl._blob = backgroundImage;
                    imgEl._url = url;
                    imgEl.src = url;
                    this._introBlobImgCache = imgEl;
                }
                if (this._introBlobImgCache.complete && this._introBlobImgCache.naturalWidth > 0) {
                    img = this._introBlobImgCache;
                }
            } else if (typeof backgroundImage === 'string') {
                if (!this._introStrImgCache || this._introStrImgCache.src !== backgroundImage) {
                    const imgEl = new Image();
                    imgEl.src = backgroundImage;
                    this._introStrImgCache = imgEl;
                }
                if (this._introStrImgCache.complete && this._introStrImgCache.naturalWidth > 0) {
                    img = this._introStrImgCache;
                }
            }
        }

        if (!img && this.images && this.images['no_image']) {
            img = this.images['no_image'];
        }

        ctx.beginPath();
        ctx.arc(0, 0, scaleBase * 0.5, 0, Math.PI * 2);
        ctx.clip('evenodd');

        if (dur > 0.6) {
            ctx.save();
            ctx.filter = 'blur(10px) brightness(0.8)';
            this.drawImgAtcenter(img, 110);
            ctx.restore();

            ctx.save();
            const introProgress = getAnimationProgress(t, 0.5);
            const scaleP = 1 - easeOutQuad(introProgress);
            ctx.globalAlpha = 1 - scaleP;
            ctx.scale(scaleP * 0.3 + 1, scaleP * 0.3 + 1);

            const levelColor = LEVEL_COLORS[chartInfo.difficulty ?? 5] || "#A356E9";
            const levelColorDark = darkenHexColor(levelColor, 40);
            const lvText = (chartInfo.lv || '').replaceAll('+', '');
            const isPlus = (chartInfo.lv || '').includes('+');
            const difficultyText = LEVEL_NAMES[chartInfo.difficulty] || '';

            if (CARD_PATH) {
                ctx.strokeStyle = levelColorDark;
                ctx.lineWidth = 0.25;
                ctx.stroke(CARD_PATH);
                ctx.clip(CARD_PATH);
            }

            ctx.fillStyle = levelColor;
            ctx.fillRect(-20, -50, 40, 100);

            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.beginPath();
            ctx.lineWidth = 1.6;
            ctx.arc(0, -12.5, 17, Math.PI * 0.25, Math.PI * 0.75, true);
            ctx.stroke();

            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath();
            ctx.arc(0, -12.5, 16, Math.PI * 0.25, Math.PI * 0.75, true);
            ctx.stroke();

            ctx.fillStyle = "black";
            ctx.fillRect(-15, -27.5, 30, 30);
            ctx.fillStyle = "#093F80";
            ctx.fillRect(-20, 7.5, 40, 5);
            ctx.fillStyle = "#052E5B";
            ctx.fillRect(-20, 12.5, 40, 3.5);
            ctx.fillStyle = "white";
            ctx.fillRect(-20, 16, 40, 15);
            if (CAPSULE_PATH) ctx.fill(CAPSULE_PATH);

            ctx.font = "1.9px title";
            ctx.textAlign = "center";
            ctx.fillText(chartInfo.title || '', 0, 11);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.artist || '', 0, 14.8);

            ctx.fillStyle = "#093F80";
            ctx.textAlign = "left";
            ctx.font = "1.2px title";
            ctx.fillText("NOTES DESIGNER", -17, 23.5);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.des || '', -17, 25.5);

            ctx.font = "bold 2.5px title";
            ctx.textAlign = "center";
            ctx.fillText("CUSTOM", -9, -32);

            if (img) {
                this.drawImgAtcenter(img, 29.8 - scaleP * 10, 0, -12.5);
            }

            if (LV_PATH) {
                ctx.lineWidth = 0.3;
                ctx.strokeStyle = levelColor;
                ctx.stroke(LV_PATH);
                ctx.fillStyle = "rgba(255,255,255,0.5)";
                ctx.fill(LV_PATH);
            }

            ctx.fillStyle = "white";
            ctx.shadowColor = "#000000a0";
            ctx.shadowBlur = 4;
            ctx.textAlign = "center";
            ctx.lineWidth = 0.75;
            ctx.font = 'bold 3.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            outlineText(ctx, difficultyText, -6.4, 6);

            ctx.shadowColor = "";
            ctx.shadowBlur = 0;
            ctx.strokeStyle = levelColorDark;
            ctx.textAlign = "left";
            ctx.lineWidth = 0.4;
            ctx.font = 'bold 2.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            outlineText(ctx, "LV", 6.4, 6);

            ctx.textAlign = "center";
            ctx.font = 'bold 5.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.letterSpacing = "-0.5px";
            ctx.lineWidth = 0.5;
            outlineText(ctx, lvText, 12, 6.5);

            ctx.font = 'bold 3.6px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.textAlign = "left";
            outlineText(ctx, isPlus ? "+" : "", 13.8 + (lvText.length - 1), 3.5);
            ctx.restore();
        }

        // 入場閃光動畫
        ctx.save();
        if (t < 0.2) {
            const s = getAnimationProgress(t, 0.2);
            const offset = easeInBack(s);
            ctx.rotate(Math.PI * 0.25);

            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);

            ctx.rotate(Math.PI);
            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);
        }
        ctx.restore();

        // 退場轉場動畫
        if (dur < 0.8 && t < duration) {
            ctx.save();
            const s = getAnimationProgress(0.8 - dur, 0.4);
            const offset = aniCurve1(s);
            ctx.rotate(Math.PI * 0.25);

            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);

            ctx.rotate(Math.PI);
            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);
            ctx.restore();
        }

        ctx.restore();
    }
}
