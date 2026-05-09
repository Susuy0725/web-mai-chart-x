import {
    scaleBase,
    innerCirleBase,
    noteRefPos,
    visualNoteRefPos,
    touchRefPos,
    imgNotExists,
    getTintedImage,
    generatePath,
    touchPaths,
    wSlideRatio,
    clamp,
} from './helper.js';

export class SimaiRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

        this.scale = 0.98;

        this._tintCache = new Map();

        // EX 顏色定義
        this.exColor = {
            tap: '#D8A2C9',
            star: '#00DBF4',
            double: '#DCDA6B',
            break: '#EBBA63',
        };

        // 傳感器靜態快取 (pixel canvas)
        this._sensorShapeCache = null; // canvas for sensor shapes
        this._sensorTextCache = null;  // canvas for sensor labels
        this._sensorCacheParams = { w: 0, h: 0, scale: this.scale };

        // 靜態背景與中間顯示快取
        this._staticBackgroundCache = null;
        this._staticBackgroundCacheParams = { w: 0, h: 0, scale: this.scale };
        this._middleDisplayCache = null;
        this._middleDisplayCacheParams = {
            w: 0,
            h: 0,
            scale: this.scale,
            middleDisplay: null,
            play_combo: null,
            play_score: null,
            backgroundDarkness: null,
        };
    }


    getCanvasWH() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const invP = scaleBase / (Math.min(w, h) * this.scale);
        return { width: w * invP, height: h * invP, halfWidth: w * invP * 0.5, halfHeight: h * invP * 0.5 };
    }

    /**
     * 預算座標縮放比例，減少重複計算
     */
    updateCanvasMetrics() {
        const { width: w, height: h } = this.canvas;
        this._p = Math.min(w, h) / scaleBase * this.scale;
        this._invP = scaleBase / (Math.min(w, h) * this.scale);
        this._hw = w * this._invP * 0.5;
        this._hh = h * this._invP * 0.5;
    }

    setImages(images) {
        this.images = images;
    }

    /**
     * 優化染色圖片取得方式
     */
    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images[imgKey]) return null;
        const cacheKey = `${imgKey}_${opacity.toFixed(2)}_${config.colorCode}`;

        if (this._tintCache.has(cacheKey)) {
            return this._tintCache.get(cacheKey);
        }

        const tinted = getTintedImage(this.images[imgKey], opacity, config);
        // 限制快取大小，防止記憶體溢出
        if (this._tintCache.size > 200) this._tintCache.clear();
        this._tintCache.set(cacheKey, tinted);
        return tinted;
    }

    setContext(ctx) {
        this.canvas = ctx.canvas;
        this.ctx = ctx;
    }

    // --- 核心工具函式 ---

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        this.ctx.drawImage(
            img,
            -size / 2 * imgWidthMul + offsetX,
            -size / 2 * imgHeightMul + offsetY,
            size * imgWidthMul,
            size * imgHeightMul
        );
    }

    timeFunction(x) {
        return 0.02160482279616 * x * x * x - 0.07553691072 * x * x + 0.43509924 * x + 0.000250029;
    }

    touchTimeFunction(x) {
        if (x > 10.24938) return 1.62102;
        return 0.000753454 * x * x * x - 0.0298793 * x * x + 0.375038 * x + 0.104685;
    }

    // --- 視覺效果 ---

    simpleHitEffect(noteT) {
        const t = noteT / this.settings.effectDecayTime;
        if (t < -1) return;
        this.ctx.save();
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.8 * this.settings.noteBaseSize * (1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    simpleHanabi(noteT, isCenter) {
        const t = noteT / this.settings.hanabiEffectDecayTime;
        if (t < -1) return;
        this.ctx.save();
        const ease = (x) => 1 - Math.pow(1 - x, 2);
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = (3 + isCenter * 1) * this.settings.noteBaseSize * ease(1 - decayAlpha);
        const color = this.ctx.createLinearGradient(-radius, -radius, radius, radius);
        color.addColorStop(0, "#00D5FF");
        color.addColorStop(0.4, "#FF00FF");
        color.addColorStop(0.8, "#FFD823");
        color.addColorStop(1, "#FFD823");
        const white = this.ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
        white.addColorStop(0, "#ffffff00");
        white.addColorStop(0.4, "#ffffff00");
        white.addColorStop(0.8, "#ffffff8b");
        white.addColorStop(1, "#ffffff00");

        this.ctx.globalAlpha = decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = white;
        this.ctx.globalAlpha = decayAlpha * 0.8;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.lineWidth = 1.4 * decayAlpha * this.settings.noteBaseSize * (1 - ease(Math.max(0, -t)));
        this.ctx.strokeStyle = color;
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = decayAlpha * 0.5;
        this.ctx.fill();
        this.ctx.restore();
    }

    simpleHoldEffect(noteT) {
        this.ctx.save();
        const t = noteT * -2;
        const decayAlpha = 1 - Math.max(0, t % 1);
        const decayAlpha1 = 1 - Math.max(0, (t + 0.5) % 1);
        const radius = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha);
        const radius1 = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha1);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 * decayAlpha1})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius1, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    getNoteTransform(noteT, speedMult = 1) {
        const progress = noteT * (this.settings.speed * 0.8833 + 0.8167) * speedMult;
        const t = 1 - this.timeFunction(progress);
        const displayT = Math.max(this.settings.middleDistance, t);
        const currentScale = t < this.settings.middleDistance
            ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance))
            : 1;
        return { t, displayT, currentScale };
    }

    // --- 渲染流程 ---

    drawFrame(state) {
        const { ctx } = this;
        const { globalTime, buckets, dt, showSensor, showSensorText, playCombo, playScore, skipClear, nowIndex } = state;

        this.globalTime = globalTime;
        this.playCombo = playCombo;
        this.playScore = playScore;

        if (!this.images) return;

        // 1. 更新座標指標
        this.updateCanvasMetrics();
        const { _hw: hw, _hh: hh, canvas: { width: w, height: h } } = this;

        // 2. 清除畫面 (座標系已經 transform 過的話，注意清除範圍)
        if (!state.skipClear) {
            ctx.clearRect(-hw, -hh, w, h);
        }

        // 3. 繪製順序優化
        if (showSensor || showSensorText) this.drawSensors(showSensor, showSensorText);

        // 分數與 Combo 建議改為「動態繪製」而非「快取繪製」，因為變動頻率太高
        this.drawMiddleDisplay();

        // 4. 使用 for...of 代替 forEach (在某些瀏覽器中效能更好)
        for (const n of buckets.slide) this.drawSlide(n);

        for (const n of buckets.tapnhold) {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        }

        for (const n of buckets.touch) this.drawTouch(n);

        this.drawStaticBackground();
        if (this.settings.showUI) this.drawUI(dt, globalTime, nowIndex);
    }

    drawUI(dt, globalTime, nowIndex) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();
        ctx.save();
        ctx.font = "3px Google Sans";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`FPS: ${dt === 0 ? 'N/A' : (1 / dt).toFixed(2)}`, -w / 2 + 2, -h / 2 + 2);
        ctx.fillText(`Time: ${Math.floor(globalTime / 60)}:${(globalTime % 60).toFixed(2)}`, -w / 2 + 2, -h / 2 + 6);
        ctx.restore();
    }

    ensureStaticBackgroundCache() {
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;

        const params = this._staticBackgroundCacheParams;
        if (this._staticBackgroundCache && params.w === wPx && params.h === hPx && params.scale === scale) {
            return;
        }

        const cache = document.createElement('canvas');
        cache.width = wPx;
        cache.height = hPx;
        const cctx = cache.getContext('2d');
        const p = Math.min(wPx, hPx) / scaleBase * scale;
        cctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);

        cctx.save();
        cctx.beginPath();
        cctx.rect(-wPx, -hPx, wPx * 2, hPx * 2);
        cctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
        cctx.fill('evenodd');
        cctx.restore();

        this._staticBackgroundCache = cache;
        this._staticBackgroundCacheParams = { w: wPx, h: hPx, scale };
    }

    drawStaticBackground() {
        this.ensureStaticBackgroundCache();
        if (!this._staticBackgroundCache) return;

        const { ctx } = this;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._staticBackgroundCache, 0, 0);
        ctx.restore();
    }

    ensureMiddleDisplayCache() {
        //const {width: wPx, height: hPx} = this.getCanvasWH();
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;

        const current = {
            middleDisplay: this.settings.middleDisplay,
            play_combo: this.playCombo,
            play_score: Math.max(this.playScore, 0),
            backgroundDarkness: this.settings.backgroundDarkness ?? 0,
        };
        const params = this._middleDisplayCacheParams;
        if (this._middleDisplayCache
            && params.w === wPx
            && params.h === hPx
            && params.scale === scale
            && params.middleDisplay === current.middleDisplay
            && params.play_combo === current.play_combo
            && params.play_score === current.play_score
            && params.backgroundDarkness === current.backgroundDarkness) {
            return;
        }

        const cache = document.createElement('canvas');
        cache.width = wPx;
        cache.height = hPx;
        const cctx = cache.getContext('2d');
        const p = Math.min(wPx, hPx) / scaleBase * scale;
        cctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);

        this.renderMiddleDisplayToContext(cctx);

        this._middleDisplayCache = cache;
        this._middleDisplayCacheParams = { ...current, w: wPx, h: hPx, scale };
    }

    drawMiddleDisplay() {
        this.ensureMiddleDisplayCache();
        if (!this._middleDisplayCache) return;

        const { ctx } = this;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._middleDisplayCache, 0, 0);
        ctx.restore();
    }

    renderMiddleDisplayToContext(ctx) {
        ctx.save();
        function textMonospace(text, x, y, cellWidth, mode = 'stroke') {
            ctx.textAlign = 'left';
            const chars = text.split('');

            chars.forEach((char, i) => {
                // 測量單一字元的實際寬度
                const charWidth = ctx.measureText(char).width;

                // 計算置中偏移量，讓字元在格子內置中
                const offsetX = (cellWidth - charWidth) / 2;

                // 繪製
                if (mode === 'stroke') {
                    ctx.strokeText(char, x + (i * cellWidth) + offsetX, y);
                } else {
                    ctx.fillText(char, x + (i * cellWidth) + offsetX, y);
                }
            });
        }
        function outlineText(text, x, y, fontSize, outlinePx = 2, {
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
            cellWidth += letterSpacing ? fontSize * parseFloat(letterSpacing) : 0;
            cellWidth = Math.max(cellWidth, 0);
            let calX = x;
            if (textAlign === "center") {
                calX = x - ((text.length * cellWidth) / 2);
            }
            if (textAlign === "right") {
                calX = x - (text.length * cellWidth);
            }
            ctx.save();
            ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
            ctx.textBaseline = textBaseline;
            ctx.fillStyle = fillStyle;
            ctx.lineWidth = strokeWidth;
            if (strokeWidth > 0) {
                ctx.strokeStyle = "#000";
                textMonospace(text, calX, y + shadowHeight, cellWidth);
                ctx.strokeStyle = strokeStyle;
                textMonospace(text, calX, y, cellWidth);
            }
            textMonospace(text, calX, y, cellWidth, 'fill');
            ctx.restore();
        }
        switch (this.settings.middleDisplay) {
            case 1:
                if (this.playCombo != 0) {
                    outlineText("COMBO", 0, -7, 4.4, 0.5, { fillStyle: "#A1435D", strokeStyle: "#A6ABAE" });
                    outlineText(`${this.playCombo}`, 0, 0, 7.4, 0.5, { fillStyle: "#A1435D", strokeStyle: "#A6ABAE", letterSpacing: -0.1 });
                }
                break;
            case 2:
                const trueScore = Math.max(this.playScore, 0).toFixed(4);
                const sp = trueScore.split(".");
                let scoreColor = "#4061A8";
                if (trueScore > 80) {
                    scoreColor = "#9E3D2E";
                }
                if (trueScore > 100) {
                    scoreColor = "#99853A";
                }
                outlineText(`${sp[0]}`, -1.8, 0, 7.4, 0.5, { fillStyle: scoreColor, strokeStyle: "#A6ABAE", letterSpacing: -0.1, textAlign: "right" });
                outlineText(".", -2.3, 0.6, 5, 0.5, { fillStyle: scoreColor, strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" });
                outlineText(`${sp[1]}`, 0, 0.5, 5, 0.5, { fillStyle: scoreColor, strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" });
                outlineText("%", 14.4, 1.2, 3, 0.5, { fillStyle: scoreColor, strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" });
                break;
            default:
                break;
        }
        ctx.restore();
    }
    // 建立或確認靜態快取（在畫布尺寸或 scale 變動時會重建）
    ensureSensorCaches() {
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;
        const p = Math.min(wPx, hPx) / scaleBase * scale;

        const params = this._sensorCacheParams || {};
        if (this._sensorShapeCache && params.w === wPx && params.h === hPx && params.scale === scale) {
            return; // 快取仍有效
        }

        // 建立 shapes 快取
        try {
            const shapes = document.createElement('canvas');
            shapes.width = wPx;
            shapes.height = hPx;
            const sctx = shapes.getContext('2d');
            sctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);
            sctx.save();
            sctx.beginPath();
            sctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
            sctx.closePath();
            sctx.clip();
            sctx.fillStyle = '#80808025';
            sctx.strokeStyle = '#ffffff80';
            touchPaths.forEach(shape => {
                if (shape.type === 'D' || shape.type === 'C1' || shape.type === 'C2') return;
                sctx.lineWidth = 0.3;
                if (shape.type === 'A') {
                    sctx.lineWidth = 0.3;
                    sctx.setLineDash([0.2, 0.6]);
                    sctx.stroke(shape.path);
                } else {
                    sctx.setLineDash([]);
                    sctx.fill(shape.path);
                    sctx.stroke(shape.path);
                }
            });

            sctx.restore();

            // 建立文字快取
            const texts = document.createElement('canvas');
            texts.width = wPx;
            texts.height = hPx;
            const tctx = texts.getContext('2d');
            tctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);
            tctx.save();
            tctx.fillStyle = '#ffffff30';
            tctx.font = "5px combo";
            tctx.textAlign = "center";
            tctx.textBaseline = "middle";
            ['A', 'B', 'D', 'E'].forEach(type => {
                const positions = touchRefPos[type];
                for (let i = 0; i < positions.length; i++) {
                    const pos = positions[i];
                    tctx.fillText(`${type}${i + 1}`, pos.x, pos.y);
                }
            });
            tctx.fillText('C', 0, 0);
            tctx.restore();

            this._sensorShapeCache = shapes;
            this._sensorTextCache = texts;
            this._sensorCacheParams = { w: wPx, h: hPx, scale };
        } catch (e) {
            // 快取建立失敗時回退到原本的即時繪製
            console.error('建立傳感器靜態快取失敗:', e);
            this._sensorShapeCache = null;
            this._sensorTextCache = null;
            this._sensorCacheParams = { w: 0, h: 0, scale };
        }
    }

    // 使用靜態快取繪製傳感器（會依 flag 決定畫 shapes / text）
    drawSensors(showSensor, showSensorText) {
        this.ensureSensorCaches();
        if (!this._sensorShapeCache && !this._sensorTextCache) return;

        const { ctx } = this;
        ctx.save();
        // 快取是以 pixel canvas 儲存，因此臨時重設 transform 以直接 draw 到畫布
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try {
            if (showSensor && this._sensorShapeCache) ctx.drawImage(this._sensorShapeCache, 0, 0);
            if (showSensorText && this._sensorTextCache) ctx.drawImage(this._sensorTextCache, 0, 0);
        } finally {
            ctx.restore();
        }
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale } = this.getNoteTransform(noteT);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (t > 1) {
            ctx.save();
            ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            ctx.restore();
            return;
        }

        const br = isBreak ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const imgKey = isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap");
        const img = isBreak
            ? this.getMemoizedTintedImage(imgKey, br, { colorCode: "#fff8a6" })
            : this.images[imgKey];

        const size = this.settings.noteBaseSize * currentScale;

        // 合併繪製，減少 save/restore
        ctx.save();

        // 繪製 Arc
        const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc")];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        this.drawImgAtcenter(img, size);

        if (s.isEx) {
            const exImg = this.getMemoizedTintedImage("tap_ex", 0.6, {
                colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")]
            });
            this.drawImgAtcenter(exImg, size);
        }

        ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale } = this.getNoteTransform(noteT);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (t > 1) {
            ctx.save();
            ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            ctx.restore();
            return;
        }

        const br = isBreak ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const imgKey = isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
            : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"));
        const img = isBreak
            ? this.getMemoizedTintedImage(imgKey, br, { colorCode: "#fff8a6" })
            : this.images[imgKey];

        const size = this.settings.noteBaseSize * currentScale;

        // 合併繪製，減少 save/restore
        ctx.save();

        // 繪製 Arc
        const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "SlideArc")];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        this.drawImgAtcenter(img, size);

        if (s.isEx) {
            const exImg = this.getMemoizedTintedImage(isMultiple ? "star_ex_double" : "star_ex", 0.6, {
                colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")]
            });
            this.drawImgAtcenter(exImg, size);
        }

        ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const posInfo = noteRefPos[pos - 1];

        if (-noteT > holdDuration) {
            this.ctx.save();
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(holdDuration + noteT);
            this.ctx.restore();
        } else {
            const isOn = (noteTime - this.globalTime) <= -0.1;
            let br = s.isBreak ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
            const img = getTintedImage(this.images[isOn ?
                (isBreak ? "hold_break_on" : (isDouble ? "hold_each_on" : "hold_on")) :
                (isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold"))], br, {
                colorCode: "#fff8a6"
            });
            const t1 = 1 - this.timeFunction((noteTime - this.globalTime + holdDuration) * (this.settings.speed * 0.8833 + 0.8167));
            const displayT = Math.min(1, Math.max(this.settings.middleDistance, t));
            const currentScale = t < this.settings.middleDistance ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance)) : 1;
            const size = this.settings.noteBaseSize * currentScale;
            const sizeOffset = t < this.settings.middleDistance ? 0 :
                Math.min((holdDuration + noteT) * 0.9 * (this.settings.speed * 0.8833 + 0.8167),
                    Math.min((1 - this.settings.middleDistance) * 2.45,
                        Math.min((t - this.settings.middleDistance) * 2.45,
                            holdDuration * 0.9 * (this.settings.speed * 0.8833 + 0.8167))));

            this.ctx.save();
            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc")];
            this.ctx.rotate(posInfo.rot);
            this.ctx.globalAlpha = currentScale;
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            if (t1 > this.settings.middleDistance) {
                this.ctx.save();
                const endimg = this.images[isBreak ? "Hold_Break_End" : (isDouble ? "Hold_Each_End" : "Hold_End")];
                this.ctx.translate(posInfo.x * t1, posInfo.y * t1);
                this.drawImgAtcenter(endimg, size * 0.65);
                this.ctx.restore();
            }

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            this.ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            this.ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);

            if (s.isEx) {
                const ex = getTintedImage(this.images["hold_ex"], 0.6, { colorCode: isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap) });
                this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
            }
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.simpleHitEffect(noteT);
            if (isOn) this.simpleHoldEffect(noteT);
            this.ctx.restore();
        }
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.touchSpeed * 0.8833 + 0.8167));
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        if (holdDuration) {
            const isOn = (noteTime - this.globalTime) <= -0.1;
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i];
                //if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
            const touchBorder = this.images.touchhold_border;

            this.ctx.save();
            if (-noteT > holdDuration) {
                this.ctx.translate(posInfo.x, posInfo.y);
                this.simpleHitEffect(holdDuration + noteT);
                if (s.isHanabi) this.simpleHanabi(holdDuration + noteT, s.touchPos === "C");
            } else {
                const size = this.settings.noteBaseSize * 0.7;
                const holdP = Math.max(0, Math.min(1, -noteT / holdDuration));
                const a = this.touchTimeFunction(18 * (1 - Math.min(1, t)) / 1.5) * 1.6;

                this.ctx.translate(posInfo.x, posInfo.y);
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.arc(0, 0, size * 1.3, -Math.PI * 0.5, Math.PI * holdP * 2 - Math.PI * 0.5);
                this.ctx.closePath();
                this.ctx.clip();
                this.drawImgAtcenter(touchBorder, size * 2.6);
                this.ctx.restore();
                this.ctx.rotate(Math.PI * -0.75);
                this.ctx.globalAlpha = Math.max(0, 1 - (1 - Math.min(1, t)) * 0.55);
                for (let i = 0; i < 4; i++) {
                    this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                    this.ctx.rotate(Math.PI / 2);
                }
                this.ctx.globalAlpha = 1;
                this.drawImgAtcenter(touchPoint, size * 0.4);
                this.simpleHitEffect(noteT);
                if (isOn) this.simpleHoldEffect(noteT);
            }
            this.ctx.restore();
            return;
        }

        const img = this.images[isDouble ? "touch_each" : "touch"];
        const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
        //if (imgNotExists(img)) return;

        this.ctx.save();
        if (t > 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            if (s.isHanabi) this.simpleHanabi(noteT, s.touchPos === "C");
        } else {
            const size = this.settings.noteBaseSize * 0.7;
            const a = this.touchTimeFunction(18 * (1 - t) / 1.5) * 1.6;

            this.ctx.translate(posInfo.x, posInfo.y);
            this.ctx.globalAlpha = Math.max(0, 1 - (1 - t) * 0.55);
            for (let i = 0; i < 4; i++) {
                this.ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                this.ctx.rotate(Math.PI / 2);
            }
            this.ctx.globalAlpha = 1;
            this.drawImgAtcenter(touchPoint, size * 0.4);
        }
        this.ctx.restore();
    }

    drawSlide(s) {
        const prefix = (s.isIllegal && this.settings.slideIllegalRed) ? "wifi_" : (s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_"));
        const standardKey = (s.isIllegal && this.settings.slideIllegalRed) ? "slide" : (s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide"));

        const imgs = [];
        if (s.slideType === "w") {
            for (let i = 0; i < 11; i++) {
                const target = this.images[prefix + i];
                imgs.push(target);
            }
        } else {
            const target = this.images[standardKey];
            imgs.push(target);
        }

        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path } = s;
        const noteT = noteTime - this.globalTime;
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.75 * clamp(((t - this.settings.middleDistance) / (1 - this.settings.middleDistance)) + this.settings.slideSpeed, 0, 1);

        let slideProgress = 0;
        if (-noteT > slideDelay) {
            slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
        }
        let br = (s.isBreak && !(s.isIllegal && this.settings.slideIllegalRed)) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        this.drawPathWithArrows(p, slideProgress, imgs, s.slideType === "w", br, (s.isIllegal && this.settings.slideIllegalRed));

        const sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);
        if (noteT <= 0 && slideProgress < 1) {
            if (!s.hideHead || sz >= 1) {
                const { x, y, rot } = p.getPointAt(slideProgress);
                this.ctx.save();
                this.ctx.globalAlpha = slideDelay < 1e-4 ? 1 : sz;
                this.ctx.translate(x, y);
                this.ctx.rotate(rot + Math.PI * 0.5);
                const starImg = this.images[s.isBreak ? "star_break" : (s.isDouble ? "star_each" : "star")];
                this.drawImgAtcenter(starImg, this.settings.noteBaseSize * sz * 1.45);
                this.ctx.restore();
            }
        }
        this.ctx.restore();
    }

    drawPathWithArrows(recorder, starProgress, imgs, typew, br, isIllegal, config = { spacing: 4.36 }) {
        const arrowCount = typew ? 11 : Math.floor((recorder.totalLength - 2) / config.spacing);
        const spacing = typew ? 7 : config.spacing;
        this.ctx.save();
        for (let i = arrowCount; i > Math.floor(starProgress * arrowCount); i--) {
            const imgIndex = Math.min(i - 1, imgs.length - 1);
            const img = getTintedImage(typew ? imgs[imgIndex] : imgs[0], isIllegal ? 1 : br, {
                colorCode: isIllegal ? "#ff3838" : "#fff8a6"
            });
            const dist = i * spacing + (typew ? wSlideRatio[imgIndex * 4 + 2] : 0);
            const { x, y, rot } = recorder.getPointAt(dist / recorder.totalLength);

            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(rot + (typew ? (Math.PI * -0.3745) : Math.PI));
            const dw = typew ? wSlideRatio[imgIndex * 4] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 7 * 0.9;
            const dh = typew ? wSlideRatio[imgIndex * 4 + 1] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 9.4 * 0.9;
            this.drawImgAtcenter(img, 1, 0, 0, dw, dh);
            this.ctx.restore();
        }
        this.ctx.restore();
    }
}

export class SimaiVisualEditor {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

        this.audioWaveformWidthRatio = 0.3;
        this.zoom = 200;

        this.passOpacity = 0.7;

        this.exColor = {
            tap: '#D8A2C9',
            star: '#00DBF4',
            double: '#DCDA6B',
            break: '#EBBA63',
        };
        // marker state: 方塊表示現在游標位置（綠色），按下時變紅
        this.markerPressed = false;
        this.markerColors = { normal: '#00FF00', pressed: '#FF0000' };
        this.mouseX = 0;
        this.mouseY = 0;
        this.markerX = 0;

        // 綁定滑鼠事件以切換方塊顏色並更新位置
        if (this.canvas && this.canvas.addEventListener) {
            this._onPointerDown = this._onPointerDown.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onPointerMove = this._onPointerMove.bind(this);
            // use capture to ensure marker events are detected before other handlers
            this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true, passive: false });
            this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
            this.canvas.addEventListener('pointercancel', this._onPointerUp, { capture: true });
            this.canvas.addEventListener('pointerleave', this._onPointerUp, { capture: true });
            this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true, passive: false });
        }
    }

    getCanvasWH() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const invP = scaleBase / Math.min(w, h) * 0.5;
        return { width: w * invP, height: h * invP };
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    setImages(images) {
        this.images = images;
    }

    setContext(ctx) {
        this.ctx = ctx;
    }

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        this.ctx.drawImage(
            img,
            -size / 2 * imgWidthMul + offsetX,
            -size / 2 * imgHeightMul + offsetY,
            size * imgWidthMul,
            size * imgHeightMul
        );
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const t = (noteTime - this.globalTime);

        const img = this.images[isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap")];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;

        this.ctx.save();
        this.ctx.translate(visualNoteRefPos[pos - 1].x, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size);
        if (s.isEx) {
            const ex = getTintedImage(this.images["tap_ex"], 0.6, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")] });
            this.drawImgAtcenter(ex, size);
        }
        this.ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
        const t = (noteTime - this.globalTime);

        const img = this.images[isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
            : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"))
        ];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;

        this.ctx.save();
        this.ctx.translate(visualNoteRefPos[pos - 1].x, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size);
        if (s.isEx) {
            const ex = getTintedImage(this.images[isMultiple ? "star_ex_double" : "star_ex"], 0.4, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")] });
            this.drawImgAtcenter(ex, size * 0.95);
        }
        this.ctx.restore();
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
        const t = (noteTime - this.globalTime);
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        if (holdDuration) {
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i];
                if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];

            this.ctx.save();

            const size = this.settings.noteBaseSize * 0.6;

            this.ctx.translate(posInfo.x, t * -this.zoom);
            this.ctx.globalAlpha = 0.4;
            this.ctx.lineWidth = size * 0.6;
            this.ctx.globalCompositeOperation = "lighter";
            let hp = (holdDuration / 4) * -this.zoom;
            for (let i = 0; i < 4; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, hp * i);
                this.ctx.lineTo(0, hp * (i + 1));
                this.ctx.closePath();
                switch (i) {
                    case 0:
                        this.ctx.strokeStyle = "#EC4402";
                        break;
                    case 1:
                        this.ctx.strokeStyle = "#F6EE01";
                        break;
                    case 2:
                        this.ctx.strokeStyle = "#0CA163";
                        break;
                    case 3:
                        this.ctx.strokeStyle = "#0197F5";
                        break;
                }
                this.ctx.stroke();
            }
            this.ctx.globalCompositeOperation = "source-over";
            this.ctx.globalAlpha = 1;
            this.ctx.rotate(Math.PI * -0.75);
            if (t <= 0) {
                this.ctx.globalAlpha = this.passOpacity;
            }
            for (let i = 0; i < 4; i++) {
                this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, 0, size * 1.365, size);
                this.ctx.rotate(Math.PI / 2);
            }
            this.drawImgAtcenter(touchPoint, size * 0.4);
            this.ctx.restore();
            return;
        }

        const img = this.images[isDouble ? "touch_each" : "touch"];
        const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
        if (imgNotExists(img)) return;

        this.ctx.save();

        const size = this.settings.noteBaseSize * 0.6;
        const a = 1.5;

        this.ctx.translate(posInfo.x, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        for (let i = 0; i < 4; i++) {
            this.ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
            this.ctx.rotate(Math.PI / 2);
        }
        this.drawImgAtcenter(touchPoint, size * 0.4);

        this.ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const t = (noteTime - this.globalTime);
        const posInfo = visualNoteRefPos[pos - 1];

        const img = this.images[isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")];
        if (imgNotExists(img)) return;

        const size = this.settings.noteBaseSize;
        const sizeOffset = holdDuration * 0.0555 * this.zoom;

        this.ctx.save();
        this.ctx.translate(posInfo.x, t * -this.zoom);
        this.ctx.rotate(Math.PI);
        if (t <= -holdDuration) {
            this.ctx.globalAlpha = this.passOpacity;
        }

        this.ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
        this.ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
        this.ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);

        if (s.isEx) {
            const ex = getTintedImage(this.images["hold_ex"], 0.6, { colorCode: isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap) });
            this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
        }
        this.ctx.restore();
    }

    drawSlide(s) {
        const target = this.images[s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide")];
        if (imgNotExists(target)) return;

        const { time: noteTime, pos, slideDelay, slideDuration } = s;
        const t = noteTime - this.globalTime;

        this.drawPathWithArrows(target, visualNoteRefPos[pos - 1].x, t + slideDelay, slideDuration, -(t + slideDelay) / slideDuration);
    }

    drawPathWithArrows(img, x, t, len, passT, config = { spacing: 4.36 }) {
        const arrowCount = Math.floor((len * this.zoom) / config.spacing);

        this.ctx.save();
        for (let i = arrowCount; i > 0; i--) {
            this.ctx.save();
            this.ctx.translate(x, -t * this.zoom - i * config.spacing);
            this.ctx.rotate(Math.PI / 2);
            if (passT >= i / arrowCount) {
                this.ctx.globalAlpha = this.passOpacity;
            }
            this.drawImgAtcenter(img, 1, 0, 0, 7 * 0.9, 9.4 * 0.9);
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawTag(tag) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();
        const zoom = this.zoom || 1;
        const bs = this.settings.noteBaseSize;
        const lineWidth = bs * (tag.type === 'bpm' ? 6 : 4);

        ctx.save();
        ctx.lineWidth = 0.5;

        // 計算時間週期 (BPM 通常建議用 60/tag.value 代表每拍一條線)
        const period = (tag.type === 'bpm') ? (240 / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        const delta = tag.time - this.globalTime;

        if (period > 0) {
            // 1. 計算螢幕範圍內的索引
            let minI = Math.ceil((-h / zoom - delta) / period);
            let maxI = Math.floor((h / zoom - delta) / period);

            // 2. 邏輯約束：起點永遠從 0 開始
            minI = Math.max(0, minI);

            // 3. 【關鍵修復】：限制 BPM 的渲染終點
            if (tag.type === 'bpm') {
                // 如果你有計算 nextTime (下一個 BPM 變化的時間)
                if (tag.nextTime) {
                    const duration = tag.nextTime - tag.time;
                    // 算出在下一個標籤前，最多能畫幾條線 (減去極小值防止壓線重疊)
                    const maxLines = Math.floor((duration - 0.001) / period);
                    maxI = Math.min(maxI, maxLines);
                }
            } else {
                // Split 等標籤本來的邏輯
                maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
            }

            for (let i = minI; i <= maxI; i++) {
                const y = (delta + i * period) * -zoom;

                if (tag.type === 'bpm') {
                    ctx.strokeStyle = '#ffe865c0';
                    ctx.setLineDash([]); // 樣式設定移到迴圈外，效能更好

                    // 僅在節拍線起點繪製文字
                    if (i === 0) {
                        ctx.save(); // 保存當前狀態
                        ctx.fillStyle = '#bdaa40';
                        ctx.font = "5px Arial";
                        ctx.textAlign = "left";

                        // 移動到繪製點並旋轉
                        ctx.translate(bs * -4 - 1.5, y - 1);
                        ctx.rotate(-Math.PI / 2);

                        ctx.fillText(tag.value.toString(), 0, 0);
                        ctx.restore(); // 自動還原所有 translate 與 rotate
                    }
                } else {
                    ctx.strokeStyle = '#ffffff';
                    if (i === 0) {
                        ctx.globalAlpha = 1; // 起點的線條保持不透明
                        ctx.save(); // 保存當前狀態
                        ctx.fillStyle = '#9c9c9c';
                        ctx.font = "5px Arial";
                        ctx.textAlign = "right";

                        // 移動到繪製點並旋轉
                        ctx.translate(bs * 4 + 1.5, y - 1);
                        ctx.rotate(Math.PI / 2);

                        ctx.fillText(tag.value.toString(), 0, 0);
                        ctx.restore(); // 自動還原所有 translate 與 rotate
                    } else {
                        ctx.globalAlpha = 0.4; // 非起點的線條降低透明度
                    }
                }

                ctx.beginPath();
                ctx.moveTo(-lineWidth, y);
                ctx.lineTo(lineWidth, y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawAudioWaveform(audioBuffer, offset = 0) {
        if (!audioBuffer) return;
        const ctx = this.ctx;
        const { width: w, height: h } = this.getCanvasWH();
        if (!ctx || w <= 0 || h <= 0) return;

        const channelData = audioBuffer.getChannelData ? audioBuffer.getChannelData(0) : (audioBuffer.data || audioBuffer);
        const sampleRate = audioBuffer.sampleRate || 44100;
        if (!channelData || channelData.length === 0) return;

        const zoom = this.zoom || 1;
        const gt = this.globalTime + offset;
        const waveHalfWidth = w * this.audioWaveformWidthRatio;
        const totalSamples = channelData.length;

        ctx.save();

        // 樣式
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#888';
        ctx.globalAlpha = 0.8;

        /**
         * 【關鍵修正 1】：對齊絕對時間基準
         * 計算螢幕最上方像素對應的「絕對時間」，並進行「格點化」
         */
        const timePerPixel = 1 / zoom;
        const topTime = gt - (h / zoom); // 畫布中心的 y=0 (hh) 對應 gt，回推 y=0 的時間

        // 算出第一個像素格點的偏移量（子像素位移），用來消除滑動時的抖動
        const subPixelOffset = (topTime % timePerPixel) * zoom;

        // 為了涵蓋裁剪邊緣，多畫 2 像素
        for (let y = -1; y < h * 2 + 1; y++) {
            // 【關鍵修正 2】：計算絕對的取樣區間，不受當前 gt 的浮點數微動影響
            // 使用絕對格點時間 t = (格點編號 * 時間步進) + 基準時間
            const pixelTime = Math.floor(topTime / timePerPixel) * timePerPixel + (y * timePerPixel);

            let startIdx = Math.floor(pixelTime * sampleRate);
            let endIdx = Math.floor((pixelTime + timePerPixel) * sampleRate);

            if (endIdx <= 0 || startIdx >= totalSamples) continue;
            startIdx = Math.max(0, startIdx);
            endIdx = Math.min(totalSamples, endIdx);

            // 穩定 Peak 偵測
            let peak = 0;
            if (endIdx - startIdx <= 1) {
                peak = Math.abs(channelData[startIdx] || 0);
            } else {
                for (let i = startIdx; i < endIdx; i++) {
                    const v = Math.abs(channelData[i]);
                    if (v > peak) peak = v;
                }
            }

            const amp = Math.min(1, peak * (this.audioAmp || 1));
            const pxW = amp * waveHalfWidth;

            // 繪製座標補上 subPixelOffset 修正
            const drawY = h - Math.round(y - subPixelOffset);

            ctx.beginPath();
            ctx.moveTo(-pxW, drawY);
            ctx.lineTo(pxW, drawY);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawBackground(w, h) {
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "4px Arial";
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#555' : '#333';
            ctx.fillRect(visualNoteRefPos[i].x - this.settings.noteBaseSize / 2, -h, this.settings.noteBaseSize, h * 2);
            ctx.fillStyle = "gray";
            ctx.fillText(i + 1, visualNoteRefPos[i].x, h - 2);
        }
        ctx.restore();
    }

    render(isVisualMode, ensureVisualEditorContext, state) {
        if (!isVisualMode || this.canvas.style.display === 'none') return;
        console.log("rendered");

        const ctx = this.ctx/* || (typeof ensureVisualEditorContext === 'function' ? ensureVisualEditorContext() : null)*/;
        if (!ctx) return;

        const { width: w, height: h } = this.getCanvasWH();
        if (w <= 0 || h <= 0) return;
        this._state = state;
        const { globalTime, visualBuckets, audioBuffer, tags, offset } = this._state;
        this.globalTime = globalTime;
        this.tags = tags;

        ctx.clearRect(-w, -h, w * 2, h * 2);
        this.drawBackground(w, h);
        this.drawAudioWaveform(audioBuffer, offset);
        visualBuckets.tags.forEach(t => this.drawTag(t));
        ctx.strokeStyle = '#ff0000ce';
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
        visualBuckets.slide.forEach(n => this.drawSlide(n));
        visualBuckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        visualBuckets.touch.forEach(n => this.drawTouch(n));
        // this._drawMarker();
    }

    _upd() {
        this.render(true, null, this._state);
    }

    _updMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // 1. 取得相對於畫布左上角的「物理像素」座標
        const physicalX = (e.clientX - rect.left) * dpr;
        const physicalY = (e.clientY - rect.top) * dpr;

        // 2. 取得畫布目前的物理寬高
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 3. 計算與渲染器一致的縮放比例 p[cite: 2, 3]
        // 渲染器使用的是：p = Math.min(w, h) / scaleBase
        const p = Math.min(w, h) / scaleBase;

        // 4. 逆向轉換：(物理座標 - 畫布中心) / 縮放比例
        this.mouseX = (physicalX - w / 2) / p;
        this.mouseY = (physicalY - h / 2) / p;
    }

    _drawMarker() {
        const ctx = this.ctx;
        // 使用 settings 中的 noteBaseSize 作為方塊大小[cite: 2]
        const size = this.settings.noteBaseSize;

        ctx.save();
        ctx.globalAlpha = 0.6;
        // 根據按下狀態切換顏色
        ctx.fillStyle = this.markerPressed ? this.markerColors.pressed : this.markerColors.normal;

        ctx.translate(this.mouseX, this.mouseY);
        // 繪製中心對齊的方塊
        ctx.fillRect(-size / 2, -size / 2, size, size);

        // 加入邊框增加辨識度
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();
    }

    _onPointerDown(e) {
        if (e.button !== 0) return;
        this.markerPressed = true;
        this._updMousePos(e);

        // 只有在循環沒有執行時才手動重繪
        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerUp() {
        this.markerPressed = false;

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerMove(e) {
        // 1. 永遠更新座標，以便下一幀渲染時使用新位置
        this._updMousePos(e);
        this.markerX = this.mouseX;

        // 2. 判斷是否需要手動觸發渲染
        // 如果主循環 (Playing 或 KeepRendering) 正在跑，我們就不手動呼叫 render
        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    /**
     * 輔助方法：檢查 main_4.js 的渲染循環是否正在執行
     */
    _isLoopActive() {
        // 檢查播放按鈕狀態
        const playButton = document.querySelector('[data-buttonAction="play/pause"]');
        const isPlaying = playButton && playButton.dataset.playing === 'true';

        // 檢查是否開啟了暫停時持續渲染 (假設此變數在 window 或 settings 中)
        const isKeepRendering = window.keepRenderingWhilePause || false;

        return isPlaying || isKeepRendering;
    }
}

export class SimaiPreviewRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.globalTime = 0;

        this.zoom = 200;

        this.noteBaseSize = 0.1;

        this.color = {
            tap: '#EE5393',
            star: '#00B9F7',
            double: '#FFDF00',
            break: '#FF640D',
            slide: '#00FBFC',
        };
        this.RENDER_LIMET = 1000;
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    getCanvasWH() {
        const w = this.canvas.width || 0;
        const h = this.canvas.height || 0;
        return {
            width: w,
            height: h,
            halfWidth: w * 0.5,
            halfHeight: h * 0.5,
        };
    }

    drawLine(x1, y1, x2, y2, color = '#fff', width = 1) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawTag(tag) {
        const { ctx } = this;
        const { width: w, height: h, halfWidth: hw } = this.getCanvasWH();
        const zoom = this.zoom || 1;
        const bs = this.settings.noteBaseSize;
        //const lineWidth = bs * (tag.type === 'bpm' ? 6 : 4);

        ctx.save();

        // 計算時間週期 (BPM 通常建議用 60/tag.value 代表每拍一條線)
        const period = (tag.type === 'bpm') ? (240 / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        const delta = tag.time - this.globalTime;

        if (period > 0) {
            // 1. 計算螢幕範圍內的索引
            let minI = Math.ceil((-hw / zoom - delta) / period);
            let maxI = Math.floor((hw / zoom - delta) / period);

            // 2. 邏輯約束：起點永遠從 0 開始
            minI = Math.max(0, minI);

            // 3. 【關鍵修復】：限制 BPM 的渲染終點
            if (tag.type === 'bpm') {
                // 如果你有計算 nextTime (下一個 BPM 變化的時間)
                if (tag.nextTime) {
                    const duration = tag.nextTime - tag.time;
                    // 算出在下一個標籤前，最多能畫幾條線 (減去極小值防止壓線重疊)
                    const maxLines = Math.floor((duration - 0.001) / period);
                    maxI = Math.min(maxI, maxLines);
                }
            } else {
                // Split 等標籤本來的邏輯
                maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
            }
            maxI = minI + Math.min(maxI - minI, this.RENDER_LIMET);

            for (let i = minI; i <= maxI; i++) {
                const posx = (delta + i * period) * zoom + hw;

                if (tag.type === 'bpm') {
                    ctx.strokeStyle = 'rgb(255, 217, 0)';
                    ctx.lineWidth = 2;
                } else {
                    ctx.lineWidth = 1;
                    if (i === 0) {
                        ctx.strokeStyle = '#ffffff';
                    } else {
                        ctx.strokeStyle = 'rgb(128, 128, 128)';
                    }
                }

                ctx.beginPath();
                ctx.moveTo(posx, 0);
                ctx.lineTo(posx, h);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();
        ctx.lineWidth = size * 0.4;
        ctx.strokeStyle = isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap);
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h * 0.9;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();
        ctx.lineWidth = size * 0.4;
        ctx.strokeStyle = isBreak ? this.color.break : (isDouble ? this.color.double : this.color.star);
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            // 外徑 R 與 內徑 r
            const r = (i % 2 === 0) ? size : size * 0.4;

            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const ctx = this.ctx;
        const { height: h } = this.getCanvasWH(); // h 為中心到邊緣的距離
        const t = (noteTime - this.globalTime);

        const size = this.settings.noteBaseSize * this.h * 0.01;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();

        // 3. 樣式設定
        ctx.lineWidth = size * 0.4;
        ctx.strokeStyle = isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap);

        ctx.translate(this.hw + t * this.zoom, y);

        // 4. 繪製正六角形
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            // i * (Math.PI / 3) 產生六個頂點
            // 加上 Math.PI / 6 的偏移可以讓「平邊」朝上，視覺上更像 maimai 的 Hold 頭
            const angle = i * (Math.PI / 3);

            const of = !(i < 5 && i > 1) ? holdDuration : 0;

            const px = Math.cos(angle) * size * 0.5 + of * this.zoom;
            const py = Math.sin(angle) * size * 0.5;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    drawSlide(s) {
        const { time: noteTime, pos, isBreak, isDouble, slideDelay, slideDuration } = s;
        const t = (noteTime + slideDelay - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();
        ctx.lineWidth = size;
        ctx.strokeStyle = isBreak ? this.color.break : (isDouble ? this.color.double : this.color.slide);
        ctx.setLineDash([size * 0.4, size * 0.3]);
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(slideDuration * this.zoom, 0);
        ctx.stroke();
        ctx.restore();
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration, isHanabi } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = touchPos === "C" ? this.hh : ((pos - 0.5 * !(touchPos === "E" || touchPos === "D")) / 8 * this.h);

        ctx.save();
        ctx.lineWidth = size * 0.4;
        ctx.strokeStyle = isDouble ? this.color.double : this.color.star;
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        if (holdDuration) {
            const hp = (holdDuration * this.zoom) / 4;
            ctx.lineWidth = size * 0.8;
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.8;
            for (let i = 0; i < 4; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(hp * i, 0);
                this.ctx.lineTo(hp * (i + 1), 0);
                this.ctx.closePath();
                switch (i) {
                    case 0:
                        this.ctx.strokeStyle = "#EC4402";
                        break;
                    case 1:
                        this.ctx.strokeStyle = "#F6EE01";
                        break;
                    case 2:
                        this.ctx.strokeStyle = "#0CA163";
                        break;
                    case 3:
                        this.ctx.strokeStyle = "#0197F5";
                        break;
                }
                this.ctx.stroke();
            }
            if (isHanabi) {
                const color = this.ctx.createLinearGradient((holdDuration * this.zoom), -y, (holdDuration * this.zoom) + size * 4, this.h - y);
                color.addColorStop(0, "#00D5FF");
                color.addColorStop(0.4, "#FF00FF");
                color.addColorStop(0.8, "#FFD823");
                color.addColorStop(1, "#FFD823");

                const width = Math.round(size * 4);
                const height = this.h + y;

                this.ctx.save();
                this.ctx.fillStyle = color;

                for (let x = 0; x < width; x += 4) {
                    // 從左到右透明度由 1.0 降至 0.0
                    this.ctx.globalAlpha = 1 - (x / width);
                    // 繪製 1px 寬的垂直色條
                    this.ctx.fillRect((holdDuration * this.zoom) + x, -y, 4, height);
                }

                this.ctx.restore();
            }
        } else {
            if (isHanabi) {
                ctx.globalCompositeOperation = "lighter";
                // 沿用你原本定義的垂直/斜向漸層
                const color = this.ctx.createLinearGradient(0, -y, size * 4, this.h - y);
                color.addColorStop(0, "#00D5FF");
                color.addColorStop(0.4, "#FF00FF");
                color.addColorStop(0.8, "#FFD823");
                color.addColorStop(1, "#FFD823");

                const width = Math.round(size * 4);
                const height = this.h + y; // 確保延伸到底部

                this.ctx.save();
                this.ctx.fillStyle = color;

                for (let x = 0; x < width; x += 4) {
                    // 從左到右透明度由 1.0 降至 0.0
                    this.ctx.globalAlpha = 1 - (x / width);
                    // 繪製 1px 寬的垂直色條
                    this.ctx.fillRect(x, -y, 4, height);
                }

                this.ctx.restore();
            }
            ctx.strokeRect(-size * 0.5, -size * 0.5, size, size);
        }
        ctx.restore();
    }

    drawAudioWaveform(audioBuffer, offset = 0) {
        if (!audioBuffer) return;
        const ctx = this.ctx;
        const { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
        if (!ctx || w <= 0 || h <= 0) return;

        // 取得音訊資料
        const channelData = audioBuffer.getChannelData ? audioBuffer.getChannelData(0) : (audioBuffer.data || audioBuffer);
        const sampleRate = audioBuffer.sampleRate || 44100;
        if (!channelData || channelData.length === 0) return;

        const zoom = this.zoom || 200;
        const gt = this.globalTime + offset;
        const totalSamples = channelData.length;

        // 參數設定：波形高度佔畫布的比例與增益
        const waveMaxHeight = h * (this.settings.audioWaveformHeightRatio || 0.4);
        const audioAmp = this.settings.audioAmp || 1.0;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(136, 136, 136, 0.2)'; // 灰色波形

        /**
         * 【防止跳動關鍵 1】：格點化時間步進
         * 1 像素代表的時間長度
         */
        const timePerPixel = 1 / zoom;
        // 算出畫布最左側 (x=0) 對應的絕對時間
        const leftTime = gt - (hw / zoom);

        // 子像素位移：消除當 gt 變化時造成的物理位移抖動
        const subPixelOffset = (leftTime % timePerPixel) * zoom;

        /**
         * 【防止跳動關鍵 2】：以像素格點為基準循環
         * 為了覆蓋邊緣，從 -1 畫到 w + 1
         */
        for (let x = -1; x <= w + 1; x++) {
            // 計算這行像素對應的穩定絕對時間點
            const pixelTime = Math.floor(leftTime / timePerPixel) * timePerPixel + (x * timePerPixel);

            let startIdx = Math.floor(pixelTime * sampleRate);
            let endIdx = Math.floor((pixelTime + timePerPixel) * sampleRate);

            // 範圍檢查
            if (endIdx <= 0 || startIdx >= totalSamples) continue;
            startIdx = Math.max(0, startIdx);
            endIdx = Math.min(totalSamples, endIdx);

            // 穩定 Peak 偵測：取區間內最大振幅
            let peak = 0;
            if (endIdx - startIdx <= 1) {
                peak = Math.abs(channelData[startIdx] || 0);
            } else {
                for (let i = startIdx; i < endIdx; i++) {
                    const v = Math.abs(channelData[i]);
                    if (v > peak) peak = v;
                }
            }

            const amp = Math.min(1, peak * audioAmp);
            const pxH = amp * waveMaxHeight;

            // 計算最終繪製的 X 座標 (扣除子像素位移)
            const drawX = x - subPixelOffset;

            // 在中心線 hh 上下繪製垂直線
            ctx.beginPath();
            ctx.moveTo(drawX, hh - pxH);
            ctx.lineTo(drawX, hh + pxH);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawTriangle(x0, y0, x1, y1, x2, y2, color = '#fff', width = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = width;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawFrame(state) {
        const { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
        this.w = w;
        this.h = h;
        this.hw = hw;
        this.hh = hh;

        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineJoin = 'bevel';

        const { globalTime, visualBuckets, audioBuffer, offset, indexTime, cursorIndexTime } = state;
        this.globalTime = globalTime;
        this.indexTime = indexTime ?? 0;
        this.drawAudioWaveform(audioBuffer, offset);
        visualBuckets.tags.forEach(t => this.drawTag(t));
        visualBuckets.slide.forEach(n => this.drawSlide(n));
        visualBuckets.touch.forEach(n => this.drawTouch(n));
        visualBuckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        console.log(this.indexTime);
        const ct = hw + (cursorIndexTime - globalTime) * this.zoom;
        this.drawTriangle(
            ct - h * 0.1, 0,
            ct, h * 0.1,
            ct + h * 0.1, 0,
            '#ffd11b', 1);
        const t = hw + (this.indexTime - globalTime) * this.zoom;
        this.drawTriangle(
            t - h * 0.1, 0,
            t, h * 0.1,
            t + h * 0.1, 0,
            '#ff0000ce', 1);
        this.drawLine(hw, 0, hw, h, '#ff0000ce', 1);
    }
}
