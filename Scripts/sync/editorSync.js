/**
 * Web mai Chart X - 編輯器端 (PC) ↔ _play (手機) WebRTC 同步模組
 * 獨立單檔模組，負責在電腦端建立房間、生成 4 位數配對碼，並將編輯器的譜面與播放狀態即時同步至手機端
 */

import { WebRtcSync, DEFAULT_WORKER_URL } from './webrtcSync.js';
import { popupWindow, simpleToast, debounce } from '../helper.js';
import { t } from '../i18n.js';

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

class EditorSyncManager {
    constructor() {
        this.sync = new WebRtcSync({
            workerUrl: localStorage.getItem('wmcx_worker_url') || DEFAULT_WORKER_URL,
            onStatusChange: (status, detail) => {
                this._handleStatusChange(status, detail);
            },
            onMessage: (msg) => {
                this._handleIncomingMessage(msg);
            },
            onError: (err) => {
                simpleToast({ content: `WebRTC 同步錯誤: ${err.message}`, type: 'error', timeout: 3500 });
            }
        });

        this.editorContext = null;
        this.statusListeners = [];
        this.modalContext = null;
        this._isRemoteTriggered = false;
        this._isSendingAudio = false;
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
    pushCurrentChart() {
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
            selectedDifficulty: difficulty
        });
    }

    /**
     * 發送音訊檔案至對端 (以 32KB 分塊傳輸)
     * @param {File|Blob|ArrayBuffer|string} fileOrBlob
     */
    async sendAudioFile(fileOrBlob) {
        if (!fileOrBlob || !this.sync.isConnected()) return;
        if (this._isSendingAudio) return;
        this._isSendingAudio = true;

        try {
            let arrayBuffer;
            if (fileOrBlob instanceof Blob) {
                arrayBuffer = await fileOrBlob.arrayBuffer();
            } else if (fileOrBlob instanceof ArrayBuffer) {
                arrayBuffer = fileOrBlob;
            } else if (typeof fileOrBlob === 'string') {
                const res = await fetch(fileOrBlob);
                arrayBuffer = await res.arrayBuffer();
            }
            if (!arrayBuffer || arrayBuffer.byteLength === 0) return;

            const CHUNK_SIZE = 32 * 1024; // 32KB
            const totalSize = arrayBuffer.byteLength;
            const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
            const fileName = fileOrBlob.name || 'track.mp3';
            const mimeType = fileOrBlob.type || 'audio/mp3';

            simpleToast({ content: t('settings.connection.audioSending') || '正在同步音源檔案至手機...', type: 'info', timeout: 2000 });

            this.sync.send({
                action: 'audio_start',
                fileName,
                totalSize,
                totalChunks,
                mimeType
            });

            for (let i = 0; i < totalChunks; i++) {
                if (!this.sync.isConnected()) break;
                if (this.sync.dataChannel && this.sync.dataChannel.bufferedAmount > 65536) {
                    await new Promise(r => setTimeout(r, 25));
                }

                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, totalSize);
                const chunkBuffer = arrayBuffer.slice(start, end);
                const base64Data = arrayBufferToBase64(chunkBuffer);

                this.sync.send({
                    action: 'audio_chunk',
                    chunkIndex: i,
                    totalChunks,
                    data: base64Data
                });
            }

            this.sync.send({
                action: 'audio_end',
                fileName,
                totalSize,
                totalChunks
            });

            simpleToast({ content: t('settings.connection.audioSendSuccess') || '音源已成功同步至手機！', type: 'success', timeout: 2500 });
        } catch (err) {
            console.error('[WebRTC sendAudioFile error]', err);
            simpleToast({ content: `音源傳輸失敗: ${err.message}`, type: 'error', timeout: 3000 });
        } finally {
            this._isSendingAudio = false;
        }
    }

    /**
     * 當前專案完整同步 (同時發送譜面與音源)
     */
    async pushCurrentProject() {
        if (!this.sync.isConnected()) return;
        this.pushCurrentChart();
        const bgm = this.editorContext?.getAudioFile ? this.editorContext.getAudioFile() : null;
        if (bgm) {
            await this.sendAudioFile(bgm);
        } else {
            this.sync.send({ action: 'audio_clear' });
        }
    }

    /**
     * 發送播放信號
     */
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
        if (status === 'connected') {
            simpleToast({ content: t('settings.connection.toastConnected') || '已成功建立 P2P 直連！', type: 'success', timeout: 3000 });
            // 連線建立時自動將目前編輯器的譜面與音源推給手機 (稍作延遲確保通道就緒)
            setTimeout(() => {
                this.pushCurrentProject();
            }, 300);
        } else if (status === 'disconnected') {
            this._isSendingAudio = false;
            this._isRemoteTriggered = false;
        }

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

    _handleIncomingMessage(msg) {
        if (!msg || !msg.action || !this.editorContext) return;

        if (msg.action === 'requestChart') {
            this.pushCurrentProject();
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
        desc.textContent = t('settings.connection.modalDesc') || '此功能將電腦編輯器的譜面、音源與播放狀態，透過 WebRTC 區域網路 P2P 即時同步至手機端 _play 播放器。';
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
        const startCountdown = (durationSec = 300) => {
            if (countdownTimer) clearInterval(countdownTimer);
            let remaining = durationSec;
            countdownLabel.style.display = 'block';
            const updateLabel = () => {
                const m = Math.floor(remaining / 60);
                const s = remaining % 60;
                countdownLabel.textContent = `${m}:${s.toString().padStart(2, '0')} remaining`;
                if (remaining <= 0) {
                    clearInterval(countdownTimer);
                    countdownLabel.textContent = '配對碼已逾期';
                    countdownLabel.style.color = '#ff5252';
                }
            };
            updateLabel();
            countdownTimer = setInterval(() => {
                remaining--;
                updateLabel();
            }, 1000);
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
        statusLabel.textContent = this.sync.isConnected() ? (t('settings.connection.statusConnected', { target: 'P2P 直連' }) || '狀態：已連線 (P2P 直連)') : (this.sync.roomCode ? (t('settings.connection.waitingClient') || '請在手機 _play 設定中輸入此配對碼') : (t('settings.connection.promptGenCode') || '點擊下方按鈕產生配對碼'));

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
            this.pushCurrentProject();
            simpleToast({ content: t('settings.connection.manualPushed') || '已發送專案至手機', type: 'success', timeout: 1500 });
        });

        this._updateModalUI = () => {
            const connected = this.sync.isConnected();
            const hasCode = !!this.sync.roomCode;

            codeText.textContent = this.sync.roomCode || '------';

            if (connected) {
                stopCountdown();
                statusLabel.textContent = t('settings.connection.statusConnected', { target: 'P2P 直連' }) || '狀態：已連線 (P2P 直連)';
                statusLabel.style.color = '#00e676';
                actionBtn.textContent = t('settings.connection.btnDisconnect') || '中斷連線';
                actionBtn.style.background = '#d32f2f';
                pushProjectBtn.style.display = 'block';
            } else if (hasCode) {
                statusLabel.textContent = t('settings.connection.waitingClient') || '等待手機加入... 請在手機端輸入配對碼';
                statusLabel.style.color = '#ffab00';
                actionBtn.textContent = t('settings.connection.btnRegen') || '重新產生配對碼';
                actionBtn.style.background = '#4a90e2';
                pushProjectBtn.style.display = 'none';
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
            if (this.sync.isConnected()) {
                stopCountdown();
                this.sync.disconnect();
                this._updateModalUI();
                simpleToast({ content: t('settings.connection.disconnectedToast') || '已中斷連線', type: 'info', timeout: 1500 });
                return;
            }

            actionBtn.disabled = true;
            actionBtn.textContent = t('settings.connection.generating') || '產生中...';
            try {
                const code = await this.sync.createRoom();
                codeText.textContent = code;
                startCountdown(300); // 啟動 5 分鐘倒數
                this._updateModalUI();
                simpleToast({ content: `${t('settings.connection.pairCodeReady') || '配對碼已就緒'}: ${code}`, type: 'success', timeout: 3000 });
            } catch (err) {
                stopCountdown();
                simpleToast({ content: `產生配對碼失敗: ${err.message}`, type: 'error', timeout: 3500 });
                this._updateModalUI();
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

        popupWindow({
            title: t('menu.toolsSyncPlay') || '同步至 _play (手機)',
            customContent: container,
            width: 380,
            maxWidth: 440,
            buttons: [
                {
                    text: t('popup.close') || '關閉',
                    hideOnClick: true,
                    onClick: () => {
                        // 若尚未完成連線，關閉時主動中斷等候，停止輪詢避免浪費 Worker 額度
                        if (!this.sync.isConnected()) {
                            this.sync.disconnect();
                        }
                    }
                }
            ],
            onClose: () => {
                // 點擊遮罩或右上角叉叉關閉時同步處理
                if (!this.sync.isConnected()) {
                    this.sync.disconnect();
                }
            }
        });
    }
}

export const editorSync = new EditorSyncManager();

