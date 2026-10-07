/**
 * 外部視窗預覽與 Canvas 同步模組
 */
const VIDEO_SEEK_THRESHOLD = 0.3;

export class SecondaryWindowManager {
    constructor() {
        this.externalWindow = null;
        this.secondCtx = null;
        this.syncBackground = () => { };
        this._checkCloseTimer = null;
        this._isCleaningUp = false;
        this._ctxConfig = null;
    }

    isActive() {
        return !!(this.externalWindow && !this.externalWindow.closed && this.secondCtx);
    }

    close() {
        if (this.externalWindow && !this.externalWindow.closed) {
            try {
                this.externalWindow.close();
            } catch (_) { }
        }
        this.handleClose();
    }

    handleClose() {
        if (this._isCleaningUp) return;
        this._isCleaningUp = true;

        if (this._checkCloseTimer) {
            clearInterval(this._checkCloseTimer);
            this._checkCloseTimer = null;
        }

        this.syncBackground = () => { };
        this.secondCtx = null;
        this.externalWindow = null;

        if (typeof this._ctxConfig?.onClose === 'function') {
            try { this._ctxConfig.onClose(); } catch (e) { }
        }

        const {
            canvas,
            renderer,
            backgroundContainer,
            canvasOutline,
            getSettings,
            resize,
            draw,
            updatePauseBackgroundDisplay,
            updateVideoBackgroundDisplay
        } = this._ctxConfig || {};

        if (canvas && renderer) {
            try {
                const mainCtx = canvas.getContext('2d');
                renderer.setContext(mainCtx);
            } catch (e) { }
        }

        const settings = typeof getSettings === 'function' ? getSettings() : {};

        if (backgroundContainer) {
            backgroundContainer.style.display = '';
        }
        if (canvasOutline) {
            canvasOutline.style.display = settings.hideOutline ? 'none' : '';
        }

        if (typeof updatePauseBackgroundDisplay === 'function') {
            try { updatePauseBackgroundDisplay(); } catch (_) { }
        }
        if (typeof updateVideoBackgroundDisplay === 'function') {
            try { updateVideoBackgroundDisplay(); } catch (_) { }
        }

        if (typeof resize === 'function') {
            try { resize(true); } catch (_) { }
        }

        if (typeof draw === 'function') {
            try { draw(); } catch (_) { }
        }

        this._ctxConfig = null;
        this._isCleaningUp = false;
    }

    open(ctxConfig) {
        if (this.externalWindow && !this.externalWindow.closed) {
            this.externalWindow.focus();
            return;
        }

        this._ctxConfig = ctxConfig;
        this._isCleaningUp = false;

        const {
            canvas,
            renderer,
            backgroundContainer,
            canvasOutline,
            editorBackgroundImage,
            editorBackgroundVideo,
            playButton,
            getSettings,
            getRealTime,
            getDPR,
            resize,
            draw
        } = ctxConfig;

        this.externalWindow = window.open("", "SecondaryCanvas", "width=800,height=800");

        if (!this.externalWindow) {
            console.warn("開啟外部視窗失敗，可能被瀏覽器彈出視窗攔截器阻止");
            return;
        }

        // 複製主視窗的 style 與 link 標籤（含字型定義）
        Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(node => {
            try {
                this.externalWindow.document.head.appendChild(node.cloneNode(true));
            } catch (_) { }
        });

        // 注入基礎樣式與 Canvas 結構
        const style = this.externalWindow.document.createElement('style');
        style.textContent = `
            @font-face {
                font-family: 'combo';
                src: url('Fonts/Inter.ttf') format('truetype');
                font-display: swap;
            }
            @font-face {
                font-family: 'mono';
                src: url('Fonts/ShareTechMono-Regular.ttf') format('truetype');
                font-display: swap;
            }
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: #000;
                font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif;
            }
            #canvasContainer {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                user-select: none;
                -webkit-user-select: none;
            }
            #secOutline {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                object-fit: contain;
                scale: 0.899;
            }
            #secondary {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            }
            .backgroundContainer {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                overflow: hidden;
                user-select: none;
                -webkit-user-select: none;
                z-index: 0;
            }
            .backgroundContainer img,
            .backgroundContainer video {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                pointer-events: none;
                -webkit-touch-callout: none;
            }
            #secControls {
                position: absolute;
                bottom: 24px;
                right: 24px;
                z-index: 100;
                display: flex;
                align-items: center;
                gap: 8px;
                opacity: 0.75;
                transition: opacity 0.25s ease, transform 0.2s ease;
                pointer-events: auto;
            }
            #secControls:hover {
                opacity: 1;
            }
            #secPlayBtn {
                background: rgba(30, 136, 229, 0.88);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.25);
                color: #fff;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                outline: none;
                padding: 0;
            }
            #secPlayBtn:hover {
                background: rgba(33, 150, 243, 0.98);
                transform: scale(1.08);
                box-shadow: 0 6px 20px rgba(33, 150, 243, 0.5);
            }
            #secPlayBtn:active {
                transform: scale(0.95);
            }
        `;
        this.externalWindow.document.head.appendChild(style);
        this.externalWindow.document.body.innerHTML = `
            <div id="canvasContainer">
                <div class="backgroundContainer" id="secBackgroundContainer">
                    <img id="secBackgroundImage" src="" alt="" onerror="this.style.display='none'">
                    <video id="secBackgroundVideo" src="" alt="" onerror="this.style.display='none'" muted playsinline webkit-playsinline x5-playsinline disablePictureInPicture disableRemotePlayback></video>
                </div>
                <img src="./Skin/Shared/outline.png" alt="" id="secOutline" onerror="this.style.display='none'">
                <canvas id="secondary"></canvas>
            </div>
            <div id="secControls">
                <button id="secPlayBtn" title="播放 / 暫停 (Space)" aria-label="Play/Pause">
                    <svg id="secPlaySvg" width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" style="display:block;margin-left:2px;"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
        `;

        const extCanvas = this.externalWindow.document.getElementById('secondary');
        const secBgImg = this.externalWindow.document.getElementById('secBackgroundImage');
        const secBgVideo = this.externalWindow.document.getElementById('secBackgroundVideo');
        const secBgContainer = this.externalWindow.document.getElementById('secBackgroundContainer');
        const secPlayBtn = this.externalWindow.document.getElementById('secPlayBtn');

        const PLAY_SVG_HTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" style="display:block;margin-left:2px;"><path d="M8 5v14l11-7z"/></svg>`;
        const PAUSE_SVG_HTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" style="display:block;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

        let lastIsPlaying = null;
        const updatePlayBtnState = (force = false) => {
            if (!secPlayBtn) return;
            const isPlaying = playButton && playButton.dataset.playing === 'true';
            if (!force && lastIsPlaying === isPlaying) return;
            lastIsPlaying = isPlaying;
            secPlayBtn.innerHTML = isPlaying ? PAUSE_SVG_HTML : PLAY_SVG_HTML;
            secPlayBtn.title = isPlaying ? '暫停 (Space)' : '播放 (Space)';
        };

        if (secPlayBtn) {
            secPlayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (playButton) {
                    playButton.click();
                    updatePlayBtnState(true);
                }
            });
        }

        // 空白鍵快捷鍵控制
        this.externalWindow.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                const targetTag = e.target?.tagName?.toLowerCase();
                if (targetTag !== 'input' && targetTag !== 'textarea') {
                    e.preventDefault();
                    if (playButton) {
                        playButton.click();
                        updatePlayBtnState(true);
                    }
                }
            }
        });

        if (secBgVideo) {
            secBgVideo.playsInline = true;
            secBgVideo.defaultMuted = true;
            secBgVideo.muted = true;
            secBgVideo.setAttribute('playsinline', '');
            secBgVideo.setAttribute('webkit-playsinline', '');
            secBgVideo.setAttribute('x5-playsinline', '');
            secBgVideo.setAttribute('disablePictureInPicture', '');
            secBgVideo.setAttribute('disableRemotePlayback', '');
            secBgVideo.addEventListener('webkitbeginfullscreen', (e) => {
                e.preventDefault();
                try {
                    if (typeof secBgVideo.webkitExitFullscreen === 'function') {
                        secBgVideo.webkitExitFullscreen();
                    }
                } catch (_) { }
            });
            secBgVideo.addEventListener('webkitpresentationmodechanged', () => {
                if (secBgVideo.webkitPresentationMode === 'fullscreen' && typeof secBgVideo.webkitSetPresentationMode === 'function') {
                    secBgVideo.webkitSetPresentationMode('inline');
                }
            });
        }

        extCanvas.width = 800;
        extCanvas.height = 800;
        this.secondCtx = extCanvas.getContext('2d');

        this.syncBackground = () => {
            if (!this.externalWindow || this.externalWindow.closed) return;
            const settings = typeof getSettings === 'function' ? getSettings() : {};
            const realTime = typeof getRealTime === 'function' ? getRealTime() : 0;
            const size = Math.min(this.externalWindow.innerWidth, this.externalWindow.innerHeight);
            if (secBgContainer) {
                secBgContainer.style.width = size + 'px';
                secBgContainer.style.height = size + 'px';
            }

            const brightnessFilter = `brightness(${1 + 0.1875 * (settings.moviebrightness ?? -4)})`;

            if (secBgImg && editorBackgroundImage) {
                if (secBgImg.src !== editorBackgroundImage.src) {
                    secBgImg.src = editorBackgroundImage.src;
                }
                secBgImg.style.display = editorBackgroundImage.style.display;
                secBgImg.style.filter = brightnessFilter;
            }

            if (secBgVideo && editorBackgroundVideo) {
                if (secBgVideo.src !== editorBackgroundVideo.src) {
                    secBgVideo.src = editorBackgroundVideo.src;
                }
                secBgVideo.style.display = editorBackgroundVideo.style.display;
                secBgVideo.style.filter = brightnessFilter;

                if (editorBackgroundVideo.src) {
                    const playing = playButton.dataset.playing === 'true';

                    // 主視窗 Canvas 被隱藏或已開啟外部預覽視窗時，主視窗影片強制暫停以節省資源
                    if (!editorBackgroundVideo.paused) {
                        try { editorBackgroundVideo.pause(); } catch (_) { }
                    }

                    // 獨立視窗影片時間與播放同步
                    if (Math.abs(secBgVideo.currentTime - realTime) > VIDEO_SEEK_THRESHOLD) {
                        try { secBgVideo.currentTime = realTime; } catch (_) { }
                    }

                    if (playing && secBgVideo.paused) {
                        secBgVideo.play().catch(() => { });
                    } else if (!playing && !secBgVideo.paused) {
                        secBgVideo.pause();
                    }

                    secBgVideo.playbackRate = settings.playbackSpeed || 1;
                }
            }

            updatePlayBtnState();
        };

        // 隱藏主視窗的背景 Containers 與 Canvas Outline (Skin)
        if (backgroundContainer) backgroundContainer.style.display = 'none';
        if (canvasOutline) canvasOutline.style.display = 'none';
        if (editorBackgroundVideo && !editorBackgroundVideo.paused) {
            try { editorBackgroundVideo.pause(); } catch (_) { }
        }

        // 註冊可靠關閉監聽（beforeunload, pagehide, unload，加上輪詢 watchdog）
        const onWindowClose = () => {
            this.handleClose();
        };

        this.externalWindow.addEventListener('beforeunload', onWindowClose);
        this.externalWindow.addEventListener('pagehide', onWindowClose);
        this.externalWindow.addEventListener('unload', onWindowClose);

        // 每 200ms 輪詢檢查副視窗是否已關閉（防止跨進程關閉未觸發事件回呼）
        if (this._checkCloseTimer) clearInterval(this._checkCloseTimer);
        this._checkCloseTimer = setInterval(() => {
            if (!this.externalWindow || this.externalWindow.closed) {
                this.handleClose();
            }
        }, 200);

        renderer.setContext(this.secondCtx);

        const syncResize = () => {
            if (!this.externalWindow || this.externalWindow.closed) return;
            const dpr = getDPR(this.externalWindow);
            renderer.resize(this.externalWindow.innerWidth, this.externalWindow.innerHeight, dpr, true);
            this.syncBackground();
            draw();
        };

        syncResize();

        this.externalWindow.addEventListener('resize', syncResize);
        if (this.externalWindow.document.fonts) {
            this.externalWindow.document.fonts.ready.then(() => {
                syncResize();
            });
        }
    }
}
