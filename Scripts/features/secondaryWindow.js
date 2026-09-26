/**
 * 外部視窗預覽與 Canvas 同步模組
 */
const VIDEO_SEEK_THRESHOLD = 0.3;

export class SecondaryWindowManager {
    constructor() {
        this.externalWindow = null;
        this.secondCtx = null;
        this.syncBackground = () => { };
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
        this.externalWindow = null;
        this.secondCtx = null;
    }

    open(ctxConfig) {
        if (this.externalWindow && !this.externalWindow.closed) {
            this.externalWindow.focus();
            return;
        }

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

        // 複製主視窗的 style 與 link 標籤（含字型定義）
        Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(node => {
            this.externalWindow.document.head.appendChild(node.cloneNode(true));
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
        `;
        this.externalWindow.document.head.appendChild(style);
        this.externalWindow.document.body.innerHTML = `
            <div id="canvasContainer">
                <div class="backgroundContainer" id="secBackgroundContainer">
                    <img id="secBackgroundImage" src="" alt="" onerror="this.style.display='none'">
                    <video id="secBackgroundVideo" src="" alt="" onerror="this.style.display='none'" muted playsinline webkit-playsinline x5-playsinline disablePictureInPicture disableRemotePlayback></video>
                </div>
                <img src="./Skin/outline.png" alt="" id="secOutline" onerror="this.style.display='none'">
                <canvas id="secondary"></canvas>
            </div>
        `;

        const extCanvas = this.externalWindow.document.getElementById('secondary');
        const secBgImg = this.externalWindow.document.getElementById('secBackgroundImage');
        const secBgVideo = this.externalWindow.document.getElementById('secBackgroundVideo');
        const secBgContainer = this.externalWindow.document.getElementById('secBackgroundContainer');

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
        };

        // 隱藏主視窗的背景 Containers 與 Canvas Outline (Skin)
        if (backgroundContainer) backgroundContainer.style.display = 'none';
        if (canvasOutline) canvasOutline.style.display = 'none';
        if (editorBackgroundVideo && !editorBackgroundVideo.paused) {
            try { editorBackgroundVideo.pause(); } catch (_) { }
        }

        this.externalWindow.addEventListener('beforeunload', () => {
            console.log("警告：外部視窗即將關閉");
            this.syncBackground = () => { };
            this.secondCtx = null;
            if (typeof ctxConfig.onClose === 'function') {
                ctxConfig.onClose();
            }
            const mainCtx = canvas.getContext('2d');
            renderer.setContext(mainCtx);
            const settings = typeof getSettings === 'function' ? getSettings() : {};
            if (backgroundContainer) backgroundContainer.style.display = '';
            if (canvasOutline) canvasOutline.style.display = settings.hideOutline ? 'none' : '';
            resize(true);
        });

        renderer.setContext(this.secondCtx);

        const syncResize = () => {
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
