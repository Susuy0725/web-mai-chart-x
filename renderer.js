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
    wSlideRatio
} from './helper.js';

export class SimaiRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

        this.scale = 0.98;

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
    }


    getCanvasWH() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const invP = scaleBase / (Math.min(w, h) * this.scale);
        return { width: w * invP, height: h * invP, halfWidth: w * invP * 0.5, halfHeight: h * invP * 0.5 };
    }

    setImages(images) {
        this.images = images;
    }

    setContext(ctx) {
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
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.8 * this.settings.noteBaseSize * (1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    simpleHanabi(noteT, isCenter) {
        const t = noteT / (2 * this.settings.effectDecayTime);
        if (t < -1) return;
        const ease = (x) => 1 - Math.pow(1 - x, 2);
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = (2 + isCenter * 2) * this.settings.noteBaseSize * ease(1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    // --- 渲染流程 ---

    drawFrame(state) {
        const { ctx } = this;
        const { globalTime, buckets, dt, showSensor, showSensorText } = state;
        this.globalTime = globalTime;

        if (!this.images || this.images.length === 0) return;

        // 1. 清除畫布
        {
            let { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
            ctx.clearRect(-hw, -hh, w, h);
        }

        // 2. 基礎 UI
        this.drawStaticBackground();
        this.drawUI(dt, globalTime);

        // 3. 傳感器 (使用靜態快取繪製以提升效能)
        if (showSensor || showSensorText) this.drawCachedSensors(showSensor, showSensorText);

        this.drawMiddleDisplay();

        // 4. 桶子繪製 (順序由下而上)
        buckets.slide.forEach(n => this.drawSlide(n));
        buckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        buckets.touch.forEach(n => this.drawTouch(n));
    }

    drawUI(dt, globalTime) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();
        ctx.save();
        ctx.font = "3px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`FPS: ${dt === 0 ? 'N/A' : (1 / dt).toFixed(2)}`, -w / 2 + 2, -h / 2 + 2);
        ctx.fillText(`Time: ${globalTime.toFixed(2)}s`, -w / 2 + 2, -h / 2 + 6);
        ctx.restore();
    }

    drawStaticBackground() {
        const { ctx } = this;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawMiddleDisplay() {
        const { ctx } = this;
        ctx.save();
        function outlineText(text, x, y, fontSize, outlinePx) {
            ctx.lineWidth = outlinePx;
            ctx.font = `bold ${fontSize}px combo`;
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }
        switch (this.settings.middleDisplay) {
            case 1:
                if (this.settings.play_combo != 0) {
                    ctx.fillStyle = "#FF569B";
                    ctx.strokeStyle = "white";
                    ctx.lineWidth = 2;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.letterSpacing = "0px";
                    outlineText("COMBO", 0, -7, 4.4, 0.5);
                    ctx.letterSpacing = "0.5px";
                    outlineText(`${this.settings.play_combo}`, 0, 0, 7.4, 0.5);
                }
                ctx.letterSpacing = "0px";
                break;
            case 2:
                const trueScore = Math.round(Math.max(this.settings.play_score, 0));
                // use gamma correction for more natural progression
                //ctx.fillStyle = adjustBrightness("#498BFF", (1 - this.settings.backgroundDarkness) ** 0.45);
                if (trueScore > 800000) {
                    //ctx.fillStyle = adjustBrightness("#FF6353", (1 - this.settings.backgroundDarkness) ** 0.45);
                }
                if (trueScore > 1000000) {
                    //ctx.fillStyle = adjustBrightness("#FFD559", (1 - this.settings.backgroundDarkness) ** 0.45);
                }
                //ctx.strokeStyle = "white";
                //ctx.lineWidth = Math.floor(hbw * 0.015);
                //ctx.textAlign = "left";
                //ctx.letterSpacing = "0px";
                //ctx.font = "bold " + Math.floor(hbw * 0.13) + "px combo"
                //ctx.strokeText(`${((trueScore / 10000) % 1).toFixed(4).slice(1, 6)}`, hw - hbw * 0.085, hh + hbw * 0.06);
                //ctx.fillText(`${((trueScore / 10000) % 1).toFixed(4).slice(1, 6)}`, hw - hbw * 0.085, hh + hbw * 0.06);
                //const lastScoreL = ctx.measureText(`${((trueScore / 10000) % 1).toFixed(4).slice(2, 6)}`).width;
                //ctx.font = "bold " + Math.floor(hbw * 0.1) + "px combo"
                //ctx.strokeText(`%`, hw - hbw * 0.045 + lastScoreL, hh + hbw * 0.06);
                //ctx.fillText(`%`, hw - hbw * 0.045 + lastScoreL, hh + hbw * 0.06);
                //ctx.textAlign = "right";
                //ctx.letterSpacing = Math.floor(hbw * 0.01) + "px";
                //ctx.font = "bold " + Math.floor(hbw * 0.18) + "px combo"
                //ctx.strokeText(`${Math.floor(trueScore / 10000)}`, hw - hbw * 0.075, hh + hbw * 0.06);
                //ctx.fillText(`${Math.floor(trueScore / 10000)}`, hw - hbw * 0.075, hh + hbw * 0.06);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    drawSensors() {
        const { ctx } = this;
        ctx.save();
        ctx.strokeStyle = '#ffffff80';
        touchPaths.forEach(shape => {
            if (shape.type === 'D' || shape.type === 'C1' || shape.type === 'C2') return; // 目前不繪製 D 區域和 A 區域
            ctx.lineWidth = 0.3;
            if (shape.type === 'A') { ctx.lineWidth = 0.4; ctx.setLineDash([0.2, 0.8]); }
            else ctx.setLineDash([]);
            ctx.stroke(shape.path);
        });
        ctx.restore();
    }

    drawSensorText() {
        const { ctx } = this;
        ctx.save();
        ctx.fillStyle = '#ffffff40';
        ctx.font = "bold 5px combo";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ['A', 'B', 'D', 'E'].forEach(type => {
            const positions = touchRefPos[type];
            for (let i = 0; i < 8; i++) {
                const pos = positions[i];
                ctx.fillText(`${type}${i + 1}`, pos.x, pos.y);
            }
        });
        ctx.fillText("C", 0, 0);
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
            sctx.strokeStyle = '#ffffff80';
            touchPaths.forEach(shape => {
                if (shape.type === 'D' || shape.type === 'C1' || shape.type === 'C2') return;
                sctx.lineWidth = 0.3;
                if (shape.type === 'A') { sctx.lineWidth = 0.4; sctx.setLineDash([0.2, 0.8]); }
                else sctx.setLineDash([]);
                sctx.stroke(shape.path);
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
    drawCachedSensors(showSensor, showSensorText) {
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
        const noteT = (noteTime - this.globalTime);
        const progress = noteT * (this.settings.speed * 0.8833 + 0.8167);
        const t = 1 - this.timeFunction(progress);

        const img = this.images[isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap")];
        //if (imgNotExists(img)) return;

        const posInfo = noteRefPos[pos - 1];
        this.ctx.save();

        if (t >= 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
        } else {
            const displayT = Math.max(this.settings.middleDistance, t);
            const currentScale = t < this.settings.middleDistance ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance)) : 1;
            const size = this.settings.noteBaseSize * currentScale;

            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc")];
            this.ctx.save();
            this.ctx.rotate(posInfo.rot);
            this.ctx.globalAlpha = currentScale;
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(img, size);
            if (s.isEx) {
                const ex = getTintedImage(this.images["tap_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")] });
                this.drawImgAtcenter(ex, size);
            }
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));

        const img = this.images[isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
            : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"))
        ];
        //if (imgNotExists(img)) return;

        const posInfo = noteRefPos[pos - 1];
        this.ctx.save();

        if (t >= 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
        } else {
            const displayT = Math.max(this.settings.middleDistance, t);
            const currentScale = t < this.settings.middleDistance ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance)) : 1;
            const size = this.settings.noteBaseSize * currentScale;

            this.ctx.save();
            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "SlideArc")];
            this.ctx.rotate(posInfo.rot);
            this.ctx.globalAlpha = currentScale;
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(img, size);
            if (s.isEx) {
                const ex = getTintedImage(this.images[isMultiple ? "star_ex_double" : "star_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")] });
                this.drawImgAtcenter(ex, size * 0.95);
            }
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const posInfo = noteRefPos[pos - 1];

        if (-noteT >= holdDuration) {
            this.ctx.save();
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(holdDuration + noteT);
            this.ctx.restore();
        } else {
            const img = this.images[isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")];
            //if (imgNotExists(img)) return;

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
                const ex = getTintedImage(this.images["hold_ex"], 0.5, { colorCode: isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap) });
                this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
            }
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.simpleHitEffect(noteT);
            this.ctx.restore();
        }
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.touchSpeed * 0.8833 + 0.8167));
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        if (holdDuration) {
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i];
                //if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
            const touchBorder = this.images.touchhold_border;

            this.ctx.save();
            if (-noteT >= holdDuration) {
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
            }
            this.ctx.restore();
            return;
        }

        const img = this.images[isDouble ? "touch_each" : "touch"];
        const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
        //if (imgNotExists(img)) return;

        this.ctx.save();
        if (t >= 1) {
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
        const prefix = s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_");
        const standardKey = s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide");

        const imgs = [];
        if (s.slideType === "w") {
            for (let i = 0; i < 11; i++) {
                const target = this.images[prefix + i];
                //if (imgNotExists(target)) return;
                imgs.push(target);
            }
        } else {
            const target = this.images[standardKey];
            //if (imgNotExists(target)) return;
            imgs.push(target);
        }

        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path } = s;
        const noteT = noteTime - this.globalTime;
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.6 * ((t - this.settings.middleDistance) / (1 - this.settings.middleDistance));

        let slideProgress = 0;
        if (-noteT > slideDelay) {
            slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
        }

        this.drawPathWithArrows(p, slideProgress, imgs, s.slideType === "w");

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

    drawPathWithArrows(recorder, starProgress, imgs, typew, config = { spacing: 4.36 }) {
        const arrowCount = typew ? 11 : Math.floor((recorder.totalLength - 2) / config.spacing);
        const spacing = typew ? 7 : config.spacing;

        this.ctx.save();
        for (let i = arrowCount; i > Math.floor(starProgress * arrowCount); i--) {
            const imgIndex = Math.min(i - 1, imgs.length - 1);
            const img = typew ? imgs[imgIndex] : imgs[0];
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

        this.zoom = 200;

        this.passOpacity = 0.5;

        this.exColor = {
            tap: '#D8A2C9',
            star: '#00DBF4',
            double: '#DCDA6B',
            break: '#EBBA63',
        };
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
            const ex = getTintedImage(this.images["tap_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")] });
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
            const ex = getTintedImage(this.images[isMultiple ? "star_ex_double" : "star_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")] });
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
            this.ctx.globalAlpha = 0.3;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(0, holdDuration * -this.zoom);
            this.ctx.closePath();
            this.ctx.strokeStyle = "#FF0000";
            this.ctx.lineWidth = size * 0.8;
            this.ctx.stroke();
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
            const ex = getTintedImage(this.images["hold_ex"], 0.5, { colorCode: isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap) });
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

    render(isVisualMode, ensureVisualEditorContext, state) {
        if (!isVisualMode() || this.canvas.style.display === 'none') return;

        const ctx = this.ctx || (typeof ensureVisualEditorContext === 'function' ? ensureVisualEditorContext() : null);
        if (!ctx) return;

        const { width: w, height: h } = this.getCanvasWH();
        if (w <= 0 || h <= 0) return;
        const { globalTime, visualBuckets, audioBuffer, dt } = state;
        this.globalTime = globalTime;

        ctx.clearRect(-w, -h, w * 2, h * 2);
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
        ctx.strokeStyle = '#ccc';
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
    }
}

