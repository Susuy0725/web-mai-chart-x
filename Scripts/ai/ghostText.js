/**
 * Ghost Text (幽靈文字) 控制器模組
 * 管理 Debounce、AbortController、競態保護、Tab/Esc 鍵盤操作、手機浮動操作列與原生提示
 */

import { completeWithGemini, DEFAULT_GEMINI_MODEL } from "./gemini.js";
import { getContext, buildPrompt, shouldComplete } from "./context.js";

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export class GhostTextController {
    /**
     * @param {Object} options
     * @param {() => boolean} options.getEnabled - 是否啟用幽靈文字
     * @param {() => string} options.getApiKey - 取得 API Key
     * @param {() => string} [options.getModel] - 取得模型名稱
     * @param {() => number} [options.getDebounceMs] - 取得防抖延遲時間 (ms)
     * @param {() => string} [options.getProvider] - 取得供應商 (目前為 'google')
     * @param {(controller: GhostTextController) => void} [options.onStateChange] - 狀態變更回呼函式
     * @param {(insertedText: string) => void} [options.onAccept] - 接受補全後的回呼函式
     * @param {(errorMessage: string) => void} [options.onError] - 錯誤發生時的提示回呼（對接原生 snackbar / toast）
     */
    constructor(options = {}) {
        this.getEnabled = options.getEnabled || (() => false);
        this.getApiKey = options.getApiKey || (() => "");
        this.getModel = options.getModel || (() => DEFAULT_GEMINI_MODEL);
        this.getDebounceMs = options.getDebounceMs || (() => 250);
        this.getProvider = options.getProvider || (() => "google");
        this.onStateChange = options.onStateChange || (() => { });
        this.onAccept = options.onAccept || (() => { });
        this.onError = options.onError || ((msg) => console.warn(msg));

        // 核心狀態
        this.text = "";
        this.cursor = 0;
        this.visible = false;
        this.isGenerating = false;
        this.error = null;

        // 請求控制與競態保護
        this.requestId = 0;
        this.debounceTimer = null;
        this.abortController = null;
        this._rafId = null;

        // UI 元素參考
        this.editor = null;
        this.container = null;
        this.actionBar = null;
    }

    /**
     * 綁定編輯器 DOM 節點
     * @param {HTMLTextAreaElement} editor - 譜面文字輸入框
     * @param {HTMLElement} container - 編輯器外層容器
     */
    bindEditor(editor, container) {
        if (!editor) return;
        this.editor = editor;
        this.container = container;

        this._createActionBar();

        // 監聽鍵盤事件（Tab 接受，Escape 取消）
        editor.addEventListener("keydown", (event) => {
            if (this.visible && this.text) {
                if (event.key === "Tab") {
                    event.preventDefault();
                    event.stopPropagation();
                    this.accept();
                    return;
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    this.dismiss();
                    return;
                }
            }
        }, true); // 捕獲階段優先攔截 Tab

        // 監聽選取變化與點擊：若游標位置改變，立即清空過時的幽靈文字
        const handleCursorChange = () => {
            if (this.visible && this.editor.selectionStart !== this.cursor) {
                this.dismiss();
            }
        };

        editor.addEventListener("click", handleCursorChange);
        editor.addEventListener("keyup", (event) => {
            if (event.key !== "Tab" && event.key !== "Escape") {
                handleCursorChange();
            }
        });

        // 監聽滾動與尺寸調整，使浮動按鈕順暢跟隨補全文字滾動
        editor.addEventListener("scroll", () => {
            if (this.visible) {
                this.updatePosition();
            }
        }, { passive: true });

        window.addEventListener("resize", () => {
            if (this.visible) {
                this.updatePosition();
            }
        }, { passive: true });
    }

    /**
     * 請求補全（具備防抖與競態保護，背景靜默生成不干擾 UI）
     * @param {string} text - 編輯器即時內容
     * @param {number} cursor - 游標位置
     */
    requestCompletion(text, cursor) {
        // 清除先前的定時器與未完成的請求
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // 檢查開關與條件
        const isEnabled = this.getEnabled();
        const apiKey = this.getApiKey();

        if (!isEnabled || !apiKey) {
            if (this.visible) this.dismiss();
            return;
        }

        const selStart = this.editor ? this.editor.selectionStart : cursor;
        const selEnd = this.editor ? this.editor.selectionEnd : cursor;

        if (!shouldComplete(text, cursor, selStart, selEnd)) {
            if (this.visible) this.dismiss();
            return;
        }

        const debounceMs = Math.max(100, Number(this.getDebounceMs()) || 250);

        this.debounceTimer = setTimeout(async () => {
            const currentRequestId = ++this.requestId;
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            this.isGenerating = true;
            this.error = null;

            try {
                const { prefix, suffix } = getContext(text, cursor);
                const prompt = buildPrompt(prefix, suffix);
                const model = this.getModel() || DEFAULT_GEMINI_MODEL;

                const completion = await completeWithGemini(apiKey, prompt, signal, model);

                // 競態保護：若請求 ID 不匹配或游標已移開，捨棄回應
                if (currentRequestId !== this.requestId) {
                    return;
                }

                if (!completion || !completion.trim()) {
                    this.dismiss();
                    return;
                }

                // 檢查此時編輯器游標是否仍在原發送點
                if (this.editor && this.editor.selectionStart !== cursor) {
                    this.dismiss();
                    return;
                }

                this.show(completion, cursor);
            } catch (err) {
                if (err.name === "AbortError") {
                    return;
                }
                if (currentRequestId !== this.requestId) {
                    return;
                }

                console.warn("[GhostText] 補全請求失敗:", err.message);
                this.error = err;
                this.dismiss();

                // 報錯直接觸發網頁原本的提示 Snackbar
                let userMsg = "AI 補全失敗";
                if (err.message?.includes("INVALID_API_KEY")) {
                    userMsg = "Google AI API 金鑰無效或格式錯誤";
                } else if (err.message?.includes("QUOTA_EXCEEDED")) {
                    userMsg = "Google AI 配額超限或請求過於頻繁 (429)";
                } else if (err.message?.includes("FORBIDDEN")) {
                    userMsg = "Google AI API 權限不足 (403)";
                } else if (err.message) {
                    userMsg = `AI 補全錯誤: ${err.message}`;
                }
                this.onError(userMsg);
            } finally {
                if (currentRequestId === this.requestId) {
                    this.isGenerating = false;
                }
            }
        }, debounceMs);
    }

    /**
     * 顯示幽靈文字與下方浮動操作列
     * @param {string} text - AI 補全文字
     * @param {number} cursor - 游標插入點
     */
    show(text, cursor) {
        this.text = text;
        this.cursor = cursor;
        this.visible = true;
        this.error = null;
        this.onStateChange(this);

        // 待高亮層渲染後計算座標位置
        setTimeout(() => {
            this.updatePosition();
        }, 0);
    }

    /**
     * 取消與清除幽靈文字
     */
    dismiss() {
        const wasVisible = this.visible;
        this.text = "";
        this.visible = false;

        if (this.actionBar) {
            this.actionBar.style.display = "none";
        }

        if (wasVisible) {
            this.onStateChange(this);
        }
    }

    /**
     * 接受幽靈文字（按下 Tab 或點擊勾）
     */
    accept() {
        if (!this.visible || !this.text || !this.editor) {
            return false;
        }

        const insertText = this.text;
        const insertPos = this.cursor;

        // 將幽靈文字實體寫入 textarea 游標處
        this.editor.focus();
        this.editor.setRangeText(insertText, insertPos, insertPos, "end");

        // 派發標準 input 事件，確保 maidata 解析、高亮更新與輸入標記完整同步
        this.editor.dispatchEvent(new Event("input", { bubbles: true }));

        this.dismiss();
        this.onAccept(insertText);
        return true;
    }

    /**
     * 裝飾 HTML 語法高亮字串，將幽靈文字以淡灰色插入指定游標處
     * @param {string} fullText - 原始純文字
     * @param {(segment: string) => string} highlightFn - 高亮處理函式
     * @returns {string} 包含幽靈文字 span 的 HTML 字串
     */
    decorateHighlight(fullText, highlightFn) {
        if (!this.visible || !this.text) {
            return highlightFn(fullText);
        }

        const safePos = Math.max(0, Math.min(fullText.length, this.cursor));
        const prefix = fullText.slice(0, safePos);
        const suffix = fullText.slice(safePos);

        const escapedGhost = escapeHTML(this.text);
        const ghostHtml = `<span class="ghost-text-suggestion" aria-hidden="true">${escapedGhost}</span>`;

        return highlightFn(prefix) + ghostHtml + highlightFn(suffix);
    }

    /**
     * 更新浮動操作列（勾/叉）的位置，使其跟隨補全文字滾動
     */
    updatePosition() {
        if (!this.actionBar || !this.visible || !this.text || !this.container) {
            if (this.actionBar) this.actionBar.style.display = "none";
            return;
        }

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
        }

        this._rafId = requestAnimationFrame(() => {
            if (!this.actionBar || !this.visible || !this.container) return;

            const span = document.querySelector("#highlight-layer .ghost-text-suggestion");
            if (!span) {
                this.actionBar.style.display = "none";
                return;
            }

            const spanRect = span.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();

            // 若補全文字已滾出編輯器垂直可視範圍，隱藏操作列
            if (spanRect.bottom < containerRect.top + 10 || spanRect.top > containerRect.bottom - 10) {
                this.actionBar.style.display = "none";
                return;
            }

            const top = spanRect.bottom - containerRect.top + 5;
            let left = spanRect.left - containerRect.left;

            // 左右邊界保護，確保操作列不超出編輯容器寬度
            const barWidth = 76;
            left = Math.max(8, Math.min(left, containerRect.width - barWidth - 8));

            this.actionBar.style.display = "inline-flex";
            this.actionBar.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        });
    }

    /**
     * 建立膠囊懸浮風格的獨立動作操作列（勾與叉）
     * @private
     */
    _createActionBar() {
        if (!this.container || this.actionBar) return;

        const bar = document.createElement("div");
        bar.className = "ghost-action-bar";
        bar.style.display = "none";

        // 接受按鈕（勾）
        const acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "ghost-action-btn ghost-action-accept";
        acceptBtn.title = "接受補全 (Tab)";
        acceptBtn.setAttribute("aria-label", "接受補全");
        acceptBtn.innerHTML = `<span class="material-symbols-outlined" translate="no">check</span>`;

        // 直立分割線
        const divider = document.createElement("div");
        divider.className = "ghost-action-divider";

        // 捨棄按鈕（叉）
        const dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "ghost-action-btn ghost-action-dismiss";
        dismissBtn.title = "取消補全 (Esc)";
        dismissBtn.setAttribute("aria-label", "取消補全");
        dismissBtn.innerHTML = `<span class="material-symbols-outlined" translate="no">close</span>`;

        // 綁定動作監聽：在 pointerdown 直接觸發以兼顧零延遲與防止輸入框失焦
        let lastActionTime = 0;
        const bindAction = (btn, actionFn) => {
            const handleAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const now = Date.now();
                if (now - lastActionTime < 150) return;
                lastActionTime = now;
                actionFn();
            };

            btn.addEventListener("pointerdown", handleAction);
            btn.addEventListener("touchstart", handleAction, { passive: false });
            btn.addEventListener("click", handleAction);
        };

        bindAction(acceptBtn, () => this.accept());
        bindAction(dismissBtn, () => this.dismiss());

        bar.appendChild(acceptBtn);
        bar.appendChild(divider);
        bar.appendChild(dismissBtn);

        this.container.appendChild(bar);
        this.actionBar = bar;
    }
}
