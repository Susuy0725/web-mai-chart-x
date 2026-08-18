/**
 * MajdataViewX WebSocket Client Manager
 * Handles WebSocket connection and synchronization with MajdataView (Unity simulator)
 */

import { t } from './i18n.js';

export class MajdataWsClient {
    constructor() {
        this.url = 'ws://127.0.0.1:8083/majdata';
        this.ws = null;
        this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
        this.lastHeartbeat = null;
        this.listeners = [];
        this.onToast = null; // Toast callback function
    }

    setToastHandler(handler) {
        this.onToast = handler;
    }

    toast(msg, type = 'info', timeout = 2500) {
        if (typeof this.onToast === 'function') {
            this.onToast({ content: msg, type, timeout });
        } else {
            console.log(`[MajdataView WS ${type}] ${msg}`);
        }
    }

    onStatusChange(callback) {
        this.listeners.push(callback);
    }

    _setStatus(status) {
        this.status = status;
        this.listeners.forEach(cb => cb(status));
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    connect(targetUrl) {
        if (targetUrl) {
            this.url = targetUrl;
        }

        if (this.isConnected()) {
            this.toast(t('toast.majdataAlreadyConnected') || `已連接至 MajdataView (${this.url})`, 'warning');
            return;
        }

        if (this.ws) {
            try { this.ws.close(); } catch (_) { }
            this.ws = null;
        }

        this._setStatus('connecting');
        this.toast(t('toast.majdataConnecting') || `正在連接至 MajdataView (${this.url})...`, 'info', 2000);

        try {
            const socket = new WebSocket(this.url);

            socket.onopen = () => {
                this.ws = socket;
                this._setStatus('connected');
                this.toast(t('toast.majdataConnected') || `已成功連接至 MajdataView (${this.url})`, 'success', 3000);
                this.sendState();
                if (typeof window !== 'undefined' && window.settings) {
                    this.sendSetting(window.settings);
                }
                this.sendLoad({ trackPath: '', imagePath: '', videoPath: '' });
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.responseType === 203 || msg.responseType === 'Heartbeat') {
                        this.lastHeartbeat = msg.responseData;
                    } else if (msg.responseType === 400 || msg.responseType === 'Error') {
                        console.error('MajdataViewX Error:', msg.responseData);
                        this.toast(`MajdataView 錯誤: ${msg.responseData || '播放失敗'}`, 'error', 4000);
                    } else {
                        console.log('MajdataWS response:', msg);
                    }
                } catch (e) {
                    console.error('MajdataWS msg parse error:', e);
                }
            };

            socket.onerror = (err) => {
                console.warn('MajdataWS error:', err);
                if (this.status === 'connecting') {
                    this.toast(t('toast.majdataConnectError') || `無法連接至 MajdataView (${this.url})，請確認 MajdataView 已啟動`, 'error', 4000);
                }
                this._setStatus('disconnected');
            };

            socket.onclose = () => {
                if (this.status === 'connected') {
                    this.toast(t('toast.majdataDisconnected') || '已中斷 MajdataView 連接', 'warning', 3000);
                }
                this.ws = null;
                this._setStatus('disconnected');
            };
        } catch (e) {
            console.error('MajdataWS connect Exception:', e);
            this.toast(t('toast.majdataConnectError') || `無法連接至 MajdataView (${this.url})`, 'error', 4000);
            this._setStatus('disconnected');
        }
    }

    disconnect() {
        if (this.ws) {
            try {
                this.sendStop();
                this.ws.close();
            } catch (_) { }
            this.ws = null;
        }
        this._setStatus('disconnected');
        this.toast(t('toast.majdataDisconnected') || '已中斷 MajdataView 連接', 'info', 2000);
    }

    toggleConnection(targetUrl) {
        if (this.isConnected()) {
            this.disconnect();
        } else {
            this.connect(targetUrl);
        }
    }

    send(requestType, requestData = {}) {
        if (!this.isConnected()) return false;
        try {
            const payload = JSON.stringify({
                requestType,
                requestData
            });
            this.ws.send(payload);
            return true;
        } catch (e) {
            console.error(`MajdataWS send [${requestType}] error:`, e);
            return false;
        }
    }

    play(playParams = {}) {
        const {
            mode = 0,
            startAt = 0,
            speed = 1.0,
            title = '',
            artist = '',
            offset = 0,
            designer = '',
            level = '',
            fumen = '',
            commands = [],
            difficulty = 3,
            maidataPath = null
        } = playParams;

        return this.send('Play', {
            Mode: mode,
            StartAt: Math.max(0, startAt || 0),
            Speed: speed,
            Title: title,
            Artist: artist,
            Offset: offset,
            Designer: designer,
            Level: level,
            Fumen: fumen,
            Commands: Array.isArray(commands) ? commands : [],
            Difficulty: difficulty,
            MaidataPath: maidataPath || null
        });
    }

    pause() {
        return this.send('Pause', {});
    }

    resume() {
        return this.send('Resume', {});
    }

    stop() {
        return this.send('Stop', {});
    }

    sendState() {
        return this.send('State', {});
    }

    sendLoad(loadParams = {}) {
        const {
            trackPath = '',
            imagePath = '',
            videoPath = ''
        } = loadParams;

        return this.send('Load', {
            TrackPath: trackPath || '',
            ImagePath: imagePath || '',
            VideoPath: videoPath || ''
        });
    }

    sendSetting(settings = {}) {
        const bgDim = settings.moviebrightness !== undefined
            ? Math.min(1, Math.max(0, 1 + 0.1875 * settings.moviebrightness))
            : 0.7;

        const sfx = settings.sfxVolumes || {};
        const globalVol = settings.globalVolume ?? 1;

        const viewSetting = {
            TapSpeed: settings.speed || 7.5,
            TouchSpeed: settings.touchSpeed || 7.5,
            SmoothSlideAnime: false,
            BackgroundDim: bgDim,
            BackgroundOutsideDim: 0.3,
            ComboStatusType: settings.middleDisplay ?? 1,
            AutoMode: 1,
            ShowHand: false,
            OutputFps: 60,
            ExportQuality: 2,
            ResizeBg: false,
            UIType: 0,
            GlobalAudioOffset: 0,
            LegacySlideLayer: false,
            MineAutoSlide: true
        };

        const volumeSetting = {
            Track: (settings.musicVolume ?? 0.8) * globalVol,
            Answer: (sfx['answer'] ?? 1.0) * (settings.SfxVolume ?? 1) * globalVol,
            Tap: (sfx['touch'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            Slide: (sfx['slide'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            Break: (sfx['break'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            BreakSlide: (sfx['judge_break_slide'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            Ex: (sfx['judge_ex'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            Touch: (sfx['touch'] ?? 0.4) * (settings.SfxVolume ?? 1) * globalVol,
            Hanabi: (sfx['hanabi'] ?? 0.6) * (settings.SfxVolume ?? 1) * globalVol
        };

        return this.send('Setting', {
            ViewSetting: viewSetting,
            VolumeSetting: volumeSetting
        });
    }
}

export const majdataWs = new MajdataWsClient();
