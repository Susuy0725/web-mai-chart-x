/**
 * Web mai Chart X - 編輯器端 (PC) ↔ _play (手機) WebRTC 同步模組
 * 獨立單檔模組，負責在電腦端建立房間、生成 4 位數配對碼，並將編輯器的譜面與播放狀態即時同步至手機端
 */

import { createWebRtcSync, DEFAULT_WORKER_URL } from './roomSync.js';
import { AudioTransfer } from './audioTransfer.js';
import { popupWindow, simpleToast, debounce } from '../helper.js';
import { t } from '../i18n.js';

class EditorSyncManager {
    constructor() {
        this.sync = createWebRtcSync({
            workerUrl: localStorage.getItem('wmcx_worker_url') || DEFAULT_WORKER_URL,
            waitForPlaybackReady: async () => {
                await this.audioTransfer.ready();
                await this.editorContext?.waitForAudio?.();
            },
            getPlaybackState: () => this.editorContext?.getPlaybackState?.(),
            onStatusChange: (status, detail) => {
                this._handleStatusChange(status, detail);
            },
            onMessage: (msg, channel) => {
                this._handleIncomingMessage(msg, channel);
            },
            onError: (err) => {
                simpleToast({ content: `WebRTC 同步錯誤: ${err.message}`, type: 'error', timeout: 3500 });
            }
        });

        this.editorContext = null;
        this.statusListeners = [];
        this.modalContext = null;
        this._isRemoteTriggered = false;
        this.audioTransfer = new AudioTransfer();
    }

    /**
     * 初始化並綁定編輯器事件與控制器
     * @param {Object} ctx
     * @param {HTMLElement} ctx.editorInput - 譜面文字輸入框
     * @param {HTMLElement} [ctx.playButton] - 播放按鈕
     * @param {HTMLElement} [ctx.syncButton] - 工具列「同步至 _play」按鈕
     * @param {() => number} ctx.getRealTime - 獲取當前播放時間 (秒)
     * @param {() => number} ctx.getPlaybackSpeed - 獲取當前播放速度
     * @param {() => Object} ctx.getChartMeta - 獲取曲名、作者、偏移等中繼資料
     * @param {() => string} ctx.getFullMaidata - 獲取完整 maidata 格式字串
     * @param {() => File|Blob} ctx.getAudioFile - 獲取音訊檔案
     * @param {() => string} ctx.getDifficulty - 獲取當前選中難度
     * @param {(time: number, speed: number) => void} ctx.onRemotePlay - 遠端觸發播放回呼
     * @param {() => void} ctx.onRemotePause - 遠端觸發暫停回呼
     * @param {(time: number) => void} ctx.onRemoteSeek - 遠端觸發時間跳轉回呼
     * @param {() => void} ctx.onRemoteRestart - 遠端觸發重新開始回呼
     */
    init(ctx) {
        this.editorContext = ctx;

        // 綁定「同步至 _play」按鈕點擊
        if (ctx.syncButton) {
            ctx.syncButton.addEventListener('click', () => {
                this.openSyncModal();
            });
        }

        // 監聽編輯器輸入，防抖 500ms 自動推送更新譜面至手機
        if (ctx.editorInput) {
            const debouncedSyncChart = debounce(() => {
                if (this.sync.isConnected()) {
                    this.pushCurrentChart();
                }
            }, 500);

            ctx.editorInput.addEventListener('input', debouncedSyncChart);
        }
    }

    isConnected() {
        return this.sync.isConnected();
    }

    /**
     * 推送當前編輯器內的完整譜面與曲目資訊至手機 _play
     */
    pushCurrentChart(channel, preservePlayback = true) {
        if (!this.sync.isConnected() || !this.editorContext) return;

        const fumenText = this.editorContext.editorInput?.value || '';
        const meta = this.editorContext.getChartMeta ? this.editorContext.getChartMeta() : {};
        const difficulty = this.editorContext.getDifficulty ? this.editorContext.getDifficulty() : '3';
        const fullMaidata = this.editorContext.getFullMaidata ? this.editorContext.getFullMaidata() : '';

        this.sync.sendChart({
            fumen: fumenText,
            fullMaidata: fullMaidata,
            title: meta.title || '',
            artist: meta.artist || '',
            musicDelay: meta.offset || 0,
            selectedDifficulty: difficulty,
            ...(preservePlayback ? { preservePlayback: true } : {})
        }, channel);
    }

    /**
     * 發送音訊檔案至對端 (以 32KB 分塊傳輸)
     * @param {File|Blob|ArrayBuffer|string} fileOrBlob
     */
    async sendAudioFile(fileOrBlob, channels = this.sync.channels()) {
        await this.audioTransfer.send(fileOrBlob, channels);
    }

    /**
     * 當前專案完整同步 (同時發送譜面與音源)
     */
    async pushCurrentProject(channel) {
        if (!this.sync.isConnected()) return;
        this.pushCurrentChart(channel, false);
        const bgm = this.editorContext?.getAudioFile ? this.editorContext.getAudioFile() : null;
        if (bgm) {
            await this.sendAudioFile(bgm, channel ? [channel] : undefined);
        } else {
            await this.audioTransfer.clear(channel ? [channel] : this.sync.channels());
        }
        if (channel) this.sync.send({ action: 'projectLoaded' }, channel);
    }

    /**
     * 發送播放信號
     */
    requestPlay(startAt, speed) {
        return !this._isRemoteTriggered && this.sync.requestPlay(startAt, speed);
    }

    sendPlay(startAt, speed) {
        if (this._isRemoteTriggered || !this.sync.isConnected()) return;
        this.sync.sendPlay(startAt, speed);
    }

    /**
     * 發送暫停信號
     */
    sendPause() {
        if (this._isRemoteTriggered || !this.sync.isConnected()) return;
        this.sync.sendPause();
    }

    /**
     * 發送跳轉信號
     */
    sendSeek(time) {
        if (this._isRemoteTriggered || !this.sync.isConnected()) return;
        this.sync.sendSeek(time);
    }

    /**
     * 發送重置/重播信號
     */
    sendRestart() {
        if (this._isRemoteTriggered || !this.sync.isConnected()) return;
        this.sync.sendRestart();
    }

    /**
     * 發送播放速度變更
     */
    sendSpeed(speed) {
        if (this._isRemoteTriggered || !this.sync.isConnected()) return;
        this.sync.sendSpeed(speed);
    }

    _handleStatusChange(status, detail) {
        if (status === 'connected' && this.lastStatus !== 'connected') {
            simpleToast({ content: t('settings.connection.toastConnected') || '已成功建立 P2P 直連！', type: 'success', timeout: 3000 });
        } else if (status === 'disconnected') {
            this._isRemoteTriggered = false;
        }

        this.lastStatus = status;
        // 更新介面
        if (this._updateModalUI) {
            this._updateModalUI();
        }

        if (this.editorContext?.syncButton) {
            if (status === 'connected') {
                this.editorContext.syncButton.classList.add('active');
                this.editorContext.syncButton.style.color = '#00e676';
            } else {
                this.editorContext.syncButton.classList.remove('active');
                this.editorContext.syncButton.style.color = '';
            }
        }
    }

    _handleIncomingMessage(msg, channel) {
        if (!msg || !msg.action || !this.editorContext) return;

        if (msg.action === 'requestChart') {
            this.pushCurrentProject(channel).catch(error => this.sync.onError(error));
            return;
        }

        this._isRemoteTriggered = true;
        try {
            if (msg.action === 'play') {
                const speed = msg.speed || 1;
                if (typeof this.editorContext.onRemotePlay === 'function') {
                    this.editorContext.onRemotePlay(msg.startAt, speed);
                }
            } else if (msg.action === 'pause') {
                if (typeof this.editorContext.onRemotePause === 'function') {
                    this.editorContext.onRemotePause();
                }
            } else if (msg.action === 'seek') {
                if (typeof this.editorContext.onRemoteSeek === 'function') {
                    this.editorContext.onRemoteSeek(msg.time || 0);
                }
            } else if (msg.action === 'restart') {
                if (typeof this.editorContext.onRemoteRestart === 'function') {
                    this.editorContext.onRemoteRestart();
                }
            } else if (msg.action === 'speed') {
                this.editorContext.onRemoteSpeed?.(msg.speed || 1);
            }
        } finally {
            this._isRemoteTriggered = false;
        }
    }

    /**
     * 開啟發起同步連線彈窗 (沿用現有深色 popupWindow 網頁原風格)
     */
    openSyncModal() {
        const container = document.createElement('div');
        container.style.cssText = 'display:flex; flex-direction:column; gap:16px; padding:6px 0; color:#eee; font-size:13px; min-width:300px;';

        // 提示說明
        const desc = document.createElement('div');
        desc.style.cssText = 'color:#bbb; line-height:1.6;';
        desc.textContent = t('settings.connection.modalDesc') || '請確保欲連線的裝置在同個Wi-Fi連線下並輸入以下配對碼';
        container.appendChild(desc);

        // 配對碼大字體顯示區
        const codeBox = document.createElement('div');
        codeBox.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#18181c; border:1px solid #333; border-radius:8px; padding:18px 12px; gap:8px;';

        const codeTitle = document.createElement('span');
        codeTitle.style.cssText = 'font-size:12px; color:#888; letter-spacing:1px;';
        codeTitle.textContent = t('settings.connection.pairCodeTitle') || '手機/iPad 配對碼 (6 位數字)';

        const codeText = document.createElement('div');
        codeText.style.cssText = 'font-size:36px; font-weight:bold; letter-spacing:6px; color:#00e5ff; font-family:monospace; user-select:all;';
        codeText.textContent = this.sync.roomCode || '------';

        const countdownLabel = document.createElement('div');
        countdownLabel.style.cssText = 'font-size:11px; color:#aaa; font-family:monospace; margin-top:2px; display:none;';
        countdownLabel.textContent = '';

        let countdownTimer = null;
        const startCountdown = expiresAt => {
            if (countdownTimer) clearInterval(countdownTimer);
            countdownLabel.style.color = '#aaa';
            countdownLabel.style.display = 'block';
            const updateLabel = () => {
                const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
                const m = Math.floor(remaining / 60);
                const s = remaining % 60;
                const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
                countdownLabel.textContent = t('settings.connection.countdownRemaining', { time: timeStr }) || `${timeStr} remaining`;
                if (remaining <= 0) {
                    clearInterval(countdownTimer);
                    countdownTimer = null;
                    countdownLabel.textContent = t('settings.connection.countdownExpired') || '配對碼已逾期';
                    countdownLabel.style.color = '#ff5252';
                }
            };
            countdownTimer = setInterval(updateLabel, 1000);
            updateLabel();
        };

        const stopCountdown = () => {
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
            countdownLabel.style.display = 'none';
        };

        const statusLabel = document.createElement('div');
        statusLabel.style.cssText = 'font-size:12px; color:#ffab00; margin-top:4px;';
        statusLabel.textContent = this.sync.isConnected() ? (t('settings.connection.statusConnected', { target: t('settings.connection.p2pDirect') || 'P2P 直連' }) || '狀態：已連線 (P2P 直連)') : (this.sync.roomCode ? (t('settings.connection.waitingClient') || '請在手機 _play 設定中輸入此配對碼') : (t('settings.connection.promptGenCode') || '點擊下方按鈕產生配對碼'));

        codeBox.appendChild(codeTitle);
        codeBox.appendChild(codeText);
        codeBox.appendChild(countdownLabel);
        codeBox.appendChild(statusLabel);
        container.appendChild(codeBox);

        // 操作按鈕行
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:4px;';

        const actionBtn = document.createElement('button');
        actionBtn.className = 'popup-button';
        actionBtn.style.cssText = 'flex:1; padding:8px 16px; font-size:13px; font-weight:bold; cursor:pointer; background:#4a90e2; color:#fff; border:none; border-radius:4px; transition:background 0.2s;';
        actionBtn.textContent = this.sync.isConnected() ? (t('settings.connection.btnDisconnect') || '中斷連線') : (this.sync.roomCode ? (t('settings.connection.btnRegen') || '重新產生配對碼') : (t('settings.connection.btnGen') || '產生配對碼'));

        const pushProjectBtn = document.createElement('button');
        pushProjectBtn.className = 'popup-button';
        pushProjectBtn.style.cssText = 'padding:8px 14px; font-size:13px; cursor:pointer; background:#333; color:#eee; border:1px solid #555; border-radius:4px; display:' + (this.sync.isConnected() ? 'block' : 'none') + ';';
        pushProjectBtn.textContent = t('settings.connection.btnManualPush') || '手動同步專案';
        pushProjectBtn.addEventListener('click', () => {
            this.pushCurrentProject().catch(error => this.sync.onError(error));
            simpleToast({ content: t('settings.connection.manualPushed') || '已發送專案至手機', type: 'success', timeout: 1500 });
        });

        this._updateModalUI = () => {
            const connected = this.sync.isConnected();
            const hasCode = !!this.sync.roomCode;

            codeText.textContent = this.sync.roomCode || '------';

            if (hasCode) {
                const ready = this.sync.channels().length + 1;
                statusLabel.textContent = t('settings.connection.roomOccupancy', {
                    occupied: Math.max(ready, this.sync.occupied), connected: ready
                });
                statusLabel.style.color = connected ? '#00e676' : '#ffab00';
                actionBtn.textContent = t('settings.connection.closeRoom');
                actionBtn.style.background = '#d32f2f';
                pushProjectBtn.style.display = connected ? 'block' : 'none';
                startCountdown(this.sync.expiresAt);
            } else {
                stopCountdown();
                statusLabel.textContent = t('settings.connection.promptGenCode') || '點擊「產生配對碼」以開始連線';
                statusLabel.style.color = '#888';
                actionBtn.textContent = t('settings.connection.btnGen') || '產生配對碼';
                actionBtn.style.background = '#4a90e2';
                pushProjectBtn.style.display = 'none';
            }
        };

        actionBtn.addEventListener('click', async () => {
            if (this.sync.roomCode) {
                stopCountdown();
                this.sync.disconnect();
                this._updateModalUI?.();
                simpleToast({ content: t('settings.connection.disconnectedToast') || '已中斷連線', type: 'info', timeout: 1500 });
                return;
            }

            actionBtn.disabled = true;
            actionBtn.textContent = t('settings.connection.generating') || '產生中...';
            try {
                const code = await this.sync.createRoom();
                codeText.textContent = code;
                this._updateModalUI?.();
                simpleToast({ content: `${t('settings.connection.pairCodeReady') || '配對碼已就緒'}: ${code}`, type: 'success', timeout: 3000 });
            } catch (err) {
                stopCountdown();
                simpleToast({ content: t('settings.connection.genCodeFailed', { error: err.message }) || `產生配對碼失敗: ${err.message}`, type: 'error', timeout: 3500 });
                this._updateModalUI?.();
            } finally {
                actionBtn.disabled = false;
            }
        });

        btnRow.appendChild(actionBtn);
        btnRow.appendChild(pushProjectBtn);
        container.appendChild(btnRow);

        // 如果尚未有房間碼且未連線，自動嘗試產生配對碼
        if (!this.sync.roomCode && !this.sync.isConnected()) {
            actionBtn.click();
        }

        this._updateModalUI();
        popupWindow({
            title: t('menu.toolsSyncPlay') || '同步至 _play (手機)',
            customContent: container,
            width: 380,
            maxWidth: 440,
            buttons: [
                {
                    text: t('popup.close') || '關閉',
                    hideOnClick: true
                }
            ],
            onClose: () => {
                stopCountdown();
                this._updateModalUI = null;
            }
        });
    }
}

export const editorSync = new EditorSyncManager();

