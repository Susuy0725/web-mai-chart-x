/**
 * 編輯器背景高亮疊層渲染器 (Canvas Overlay)
 * 將「目前音符高亮」與「失焦選取高亮」繪製在獨立的 <canvas> 層，
 * 避免在擁有數萬 DOM 節點的 #highlight-layer 內部變動 DOM 或觸發 Layerize / 全文件 Layout。
 */

const DEFAULT_CURRENT_NOTE_FILL = 'rgba(68, 153, 238, 0.32)';
const SELECTION_HIGHLIGHT_FILL = 'rgba(46, 204, 113, 0.28)';

/**
 * 將 CSS 色彩字串（hex 或 rgb/rgba）轉為指定透明度的 rgba() 字串。
 * @param {string} cssColor - CSS 色彩字串
 * @param {number} [alpha=0.32] - 目標透明度 (0~1)
 * @param {string} [fallback=DEFAULT_CURRENT_NOTE_FILL] - 解析失敗時的備援色
 * @returns {string}
 */
export function parseCssColorToRgba(cssColor, alpha = 0.32, fallback = DEFAULT_CURRENT_NOTE_FILL) {
    if (typeof cssColor !== 'string') return fallback;
    const trimmed = cssColor.trim();
    if (!trimmed) return fallback;

    if (trimmed[0] === '#') {
        const hex = trimmed.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        } else if (hex.length === 6 || hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }
        return fallback;
    }

    const rgbMatch = trimmed.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i);
    if (rgbMatch) {
        const r = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1]))));
        const g = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2]))));
        const b = Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3]))));
        if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    }

    return fallback;
}

/**
 * 合併同一視覺行的 DOMClientRect，並轉換為相對於 highlightLayer 內容原點的膠囊矩形陣列。
 * @param {ArrayLike<{left:number,top:number,right:number,bottom:number,width:number,height:number}>} rawRects
 * @param {number} originX - highlightLayer 內容原點 X (layerRect.left + clientLeft - scrollLeft)
 * @param {number} originY - highlightLayer 內容原點 Y (layerRect.top + clientTop - scrollTop)
 * @param {number} [padX=2] - 水平內距
 * @returns {Array<{x:number,y:number,w:number,h:number}>}
 */
export function mergeClientRectsToContentRects(rawRects, originX, originY, padX = 2) {
    const merged = [];
    for (let i = 0; i < rawRects.length; i++) {
        const r = rawRects[i];
        if (!r || r.width < 0.5 || r.height < 0.5) continue;
        const prev = merged[merged.length - 1];
        if (prev && Math.abs(r.top - prev.top) < 2 && Math.abs(r.bottom - prev.bottom) < 2 && r.left <= prev.right + 2) {
            prev.right = Math.max(prev.right, r.right);
            prev.top = Math.min(prev.top, r.top);
            prev.bottom = Math.max(prev.bottom, r.bottom);
            prev.width = prev.right - prev.left;
            prev.height = prev.bottom - prev.top;
        } else {
            merged.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
        }
    }

    const result = new Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
        const mr = merged[i];
        result[i] = {
            x: Math.max(0, mr.left - originX - padX),
            y: Math.max(0, mr.top - originY),
            w: mr.width + padX * 2,
            h: mr.height,
        };
    }
    return result;
}

/**
 * 使用二分搜尋在文字節點索引表中定位字元偏移量對應的 DOM 節點與內部偏移。
 * @param {Array<{node:Text,start:number,end:number}>} textIndex
 * @param {number} offset
 * @param {boolean} [isEnd=false]
 * @returns {{node:Text,offset:number}|null}
 */
export function findHighlightDomPos(textIndex, offset, isEnd = false) {
    if (!textIndex || textIndex.length === 0) return null;
    const clamped = Math.max(0, offset);
    let lo = 0;
    let hi = textIndex.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const entry = textIndex[mid];
        const hit = isEnd
            ? (clamped > entry.start && clamped <= entry.end)
            : (clamped >= entry.start && clamped < entry.end);
        if (hit) {
            return { node: entry.node, offset: clamped - entry.start };
        }
        if (clamped < entry.start || (isEnd && clamped === entry.start)) {
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    if (!isEnd && clamped >= textIndex[textIndex.length - 1].end) {
        const last = textIndex[textIndex.length - 1];
        return { node: last.node, offset: last.node.nodeValue.length };
    }
    return { node: textIndex[0].node, offset: 0 };
}

function drawPillRect(ctx, x, y, w, h, radius) {
    if (w <= 0 || h <= 0) return;
    const r = Math.min(radius, w * 0.5, h * 0.5);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    ctx.fill();
}

/**
 * 編輯器高亮 Canvas 控制器：維護音符內容矩形快取與高效能 Canvas 重繪。
 */
export class EditorHighlightOverlay {
    /**
     * @param {{canvas:HTMLCanvasElement|null, highlightLayer:HTMLElement, getDPR?:()=>number}} options
     */
    constructor({ canvas, highlightLayer, getDPR }) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.highlightLayer = highlightLayer;
        this.getDPR = getDPR || (() => Math.min(window.devicePixelRatio || 1, 2));
        this.sharedRange = typeof document !== 'undefined' ? document.createRange() : null;
        this.textIndex = [];
        this.rectCache = new Map();
        this.cachedLayoutWidth = -1;
        this.cachedCanvasW = 0;
        this.cachedCanvasH = 0;
        this.cachedClientLeft = 0;
        this.cachedClientTop = 0;
        this.cachedClipW = 0;
        this.cachedClipH = 0;
        this.cachedDpr = 1;
        this.activeCurrentRects = null;
        this.activeSelectionRects = null;
        this.currentNoteFill = DEFAULT_CURRENT_NOTE_FILL;
        this.selectionFill = SELECTION_HIGHLIGHT_FILL;
        this.layoutDirty = true;
        if (canvas?.style) {
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '0';
        }
        this.resizeObserver = null;
        if (typeof ResizeObserver === 'function' && highlightLayer && typeof highlightLayer === 'object') {
            try {
                this.resizeObserver = new ResizeObserver(() => {
                    this.invalidateLayout();
                    if (this.activeCurrentRects || this.activeSelectionRects) {
                        this.render();
                    }
                });
                this.resizeObserver.observe(highlightLayer);
            } catch {
                this.resizeObserver = null;
            }
        }
        this.refreshAccentColor();
    }

    /**
     * 重新從根樣式讀取 --accent-color，同步高亮填滿色。
     */
    refreshAccentColor() {
        if (typeof window === 'undefined' || typeof document === 'undefined' || !window.getComputedStyle) {
            this.currentNoteFill = DEFAULT_CURRENT_NOTE_FILL;
            return;
        }
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--accent-color');
        this.currentNoteFill = parseCssColorToRgba(raw, 0.32, DEFAULT_CURRENT_NOTE_FILL);
    }

    /**
     * 重建 #highlight-layer 的文字節點偏移索引並清空矩形快取。
     */
    invalidateText() {
        this.rectCache.clear();
        this.layoutDirty = true;
        this.textIndex = [];
        if (!this.highlightLayer || typeof document === 'undefined') return;
        let acc = 0;
        const walker = document.createTreeWalker(this.highlightLayer, NodeFilter.SHOW_TEXT);
        let tNode;
        while ((tNode = walker.nextNode())) {
            const len = tNode.nodeValue.length;
            if (len > 0) {
                this.textIndex.push({ node: tNode, start: acc, end: acc + len });
                acc += len;
            }
        }
    }

    /**
     * 標記幾何尺寸可能已變更；若文字寬度改變會同時清空矩形快取。
     */
    invalidateLayout() {
        this.layoutDirty = true;
    }

    /**
     * 同步視口大小、Canvas 解析度與換行寬度。
     * @private
     */
    _syncGeometry() {
        const hl = this.highlightLayer;
        if (!hl) return;
        const clientW = hl.clientWidth;
        const clientH = hl.clientHeight;
        if (this.cachedLayoutWidth !== -1 && clientW !== this.cachedLayoutWidth) {
            this.rectCache.clear();
        }
        if (clientW > 0) {
            this.cachedLayoutWidth = clientW;
        }
        this.cachedClientLeft = hl.clientLeft;
        this.cachedClientTop = hl.clientTop;
        this.cachedClipW = clientW;
        this.cachedClipH = clientH;

        const cssW = this.canvas ? this.canvas.clientWidth || clientW : clientW;
        const cssH = this.canvas ? this.canvas.clientHeight || clientH : clientH;
        const dpr = this.getDPR();
        this.cachedCanvasW = cssW;
        this.cachedCanvasH = cssH;
        this.cachedDpr = dpr;

        if (this.canvas && cssW > 0 && cssH > 0) {
            const targetW = Math.round(cssW * dpr);
            const targetH = Math.round(cssH * dpr);
            if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
                this.canvas.width = targetW;
                this.canvas.height = targetH;
            }
        }
        this.layoutDirty = false;
    }

    /**
     * 取得指定字元範圍在 #highlight-layer 內容座標系中的膠囊矩形（優先命中快取）。
     * @param {number} startOffset
     * @param {number} endOffset
     * @param {number} [padX=2]
     * @param {boolean} [useCache=true]
     * @returns {Array<{x:number,y:number,w:number,h:number}>|null}
     */
    measureContentRects(startOffset, endOffset, padX = 2, useCache = true) {
        if (startOffset >= endOffset || this.textIndex.length === 0 || !this.highlightLayer || !this.sharedRange) {
            return null;
        }
        if (this.layoutDirty) {
            this._syncGeometry();
        }
        const cacheKey = useCache ? `${startOffset}:${endOffset}:${padX}` : null;
        if (cacheKey && this.rectCache.has(cacheKey)) {
            return this.rectCache.get(cacheKey);
        }

        const startPos = findHighlightDomPos(this.textIndex, startOffset, false);
        const endPos = findHighlightDomPos(this.textIndex, endOffset, true);
        if (!startPos || !endPos) return null;

        this.sharedRange.setStart(startPos.node, startPos.offset);
        this.sharedRange.setEnd(endPos.node, endPos.offset);
        const rawRects = this.sharedRange.getClientRects();
        const hl = this.highlightLayer;
        const layerRect = hl.getBoundingClientRect();
        const originX = layerRect.left + hl.clientLeft - hl.scrollLeft;
        const originY = layerRect.top + hl.clientTop - hl.scrollTop;
        const rects = mergeClientRectsToContentRects(rawRects, originX, originY, padX);

        if (cacheKey) {
            this.rectCache.set(cacheKey, rects);
        }
        return rects;
    }

    setCurrentNoteRects(rects) {
        this.activeCurrentRects = rects && rects.length > 0 ? rects : null;
        this.render();
    }

    clearCurrentNoteRects() {
        if (this.activeCurrentRects !== null) {
            this.activeCurrentRects = null;
            this.render();
        }
    }

    setSelectionRects(rects) {
        this.activeSelectionRects = rects && rects.length > 0 ? rects : null;
        this.render();
    }

    clearSelectionRects() {
        if (this.activeSelectionRects !== null) {
            this.activeSelectionRects = null;
            this.render();
        }
    }

    /**
     * 將目前作用中的高亮膠囊繪製至 <canvas>（依據捲動偏移平移並裁切至視口）。
     */
    render() {
        if (!this.canvas || !this.ctx || !this.highlightLayer) return;
        if (this.layoutDirty || this.cachedCanvasW <= 0 || this.cachedCanvasH <= 0) {
            this._syncGeometry();
        }
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (w <= 0 || h <= 0) return;

        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);

        if (!this.activeSelectionRects && !this.activeCurrentRects) {
            return;
        }

        const dpr = this.cachedDpr;
        const clipW = this.cachedClipW;
        const clipH = this.cachedClipH;
        const scrollX = this.highlightLayer.scrollLeft;
        const scrollY = this.highlightLayer.scrollTop;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.beginPath();
        ctx.rect(this.cachedClientLeft, this.cachedClientTop, clipW, clipH);
        ctx.clip();

        const offsetX = this.cachedClientLeft - scrollX;
        const offsetY = this.cachedClientTop - scrollY;

        if (this.activeSelectionRects) {
            ctx.fillStyle = this.selectionFill;
            for (let i = 0; i < this.activeSelectionRects.length; i++) {
                const r = this.activeSelectionRects[i];
                const drawY = r.y + offsetY;
                if (drawY + r.h < 0 || drawY > clipH) continue;
                drawPillRect(ctx, r.x + offsetX, drawY, r.w, r.h, 3);
            }
        }

        if (this.activeCurrentRects) {
            ctx.fillStyle = this.currentNoteFill;
            for (let i = 0; i < this.activeCurrentRects.length; i++) {
                const r = this.activeCurrentRects[i];
                const drawY = r.y + offsetY;
                if (drawY + r.h < 0 || drawY > clipH) continue;
                drawPillRect(ctx, r.x + offsetX, drawY, r.w, r.h, 4);
            }
        }

        ctx.restore();
    }
}
