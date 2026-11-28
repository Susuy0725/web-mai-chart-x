/**
 * Web mai Chart X - 統一 WebRTC 同步管理器 (SyncManager)
 * 統一支援 Editor (電腦端) 與 Play (播放器/行動端) 之雙向與對等同步
 */

import { createWebRtcSync, DEFAULT_WORKER_URL } from './roomSync.js';
import { AudioTransfer } from './audioTransfer.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export class SyncManager {
    constructor(options = {}) {
        this.options = options;
        this.role = localStorage.getItem('wmcx_webrtc_role') || options.defaultRole || 'client';
        this.workerUrl = localStorage.getItem('wmcx_worker_url') || DEFAULT_WORKER_URL;

        // 回呼事件
        this.callbacks = {
            onChart: options.onChart || null,
            onAudio: options.onAudio || null,
            onAudioClear: options.onAudioClear || null,
            onPlay: options.onPlay || null,
            onPause: options.onPause || null,
            onSeek: options.onSeek || null,
            onRestart: options.onRestart || null,
            onSpeed: options.onSpeed || null,
            getProjectData: options.getProjectData || null,
            onStatusChange: options.onStatusChange || null
        };

        // 內部傳輸與接收狀態
        this.audioTransfer = new AudioTransfer();
        this._isRemoteTriggered = false;
        this._incomingAudioChunks = null;
        this._incomingAudioMeta = null;
        this._incomingAudioCount = 0;
        this._transferPopupCtx = null;
        this._modalUpdater = null;

        // 初始化底層 WebRTC
        this.sync = createWebRtcSync({
            workerUrl: this.workerUrl,
            waitForPlaybackReady: async () => {
                await this.audioTransfer.ready();
                await this.incomingTransfer;
                await options.waitForAudio?.();
            },
            getPlaybackState: options.getPlaybackState,
            onStatusChange: (status, detail) => {
                this._handleStatusChange(status, detail);
            },
            onMessage: (msg, channel) => {
                const handle = () => this._handleIncomingMessage(msg, channel);
                if (['projectBegin', 'chart', 'audio_start', 'audio_chunk', 'audio_end', 'audio_clear', 'projectLoaded'].includes(msg.action)) {
                    this.incomingTransfer = (this.incomingTransfer ?? Promise.resolve()).then(handle).catch(error => { if (this.receivingProject) this.receivingProject.failed = true; this.sync.onError(error); });
                } else {
                    Promise.resolve(handle()).catch(this.sync.onError);
                }
            },
            onError: (err) => {
                simpleToast({ content: `WebRTC 錯誤: ${err.message}`, type: 'error', timeout: 3500 });
                if (this._modalUpdater) this._modalUpdater();
            }
        });
    }

    isConnected() {
        return this.sync.isConnected();
    }

    get status() {
        return this.sync.status;
    }

    get roomCode() {
        return this.sync.roomCode;
    }

    // =========================================================
    // 傳輸指令發送 API
    // =========================================================

    requestPlay(startAt, speed) {
        return !this._isRemoteTriggered && this.sync.requestPlay(startAt, speed);
    }

    sendPlay(startAt, speed = 1) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendPlay(startAt, speed);
    }

    sendPause() {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendPause();
    }

    sendSeek(time) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendSeek(time);
    }

    sendRestart() {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendRestart();
    }

    sendSpeed(speed) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendSpeed(speed);
    }

    requestChart() {
        if (!this.sync.isConnected()) return;
        this.sync.send({ action: 'requestChart' });
    }

    sendClearAudio() {
        if (!this.sync.isConnected()) return;
        this.sync.send({ action: 'audio_clear' });
    }

    /**
     * 發送譜面資料
     */
    sendChart({ fumen = '', fullMaidata = '', title = '', artist = '', musicDelay = 0, selectedDifficulty = '3' }, channel) {
        if (!this.sync.isConnected()) return;
        if (!this.sync.sendChart({
            fumen,
            fullMaidata,
            title,
            artist,
            musicDelay,
            selectedDifficulty
        }, channel)) throw new Error('Chart transfer failed');
    }

    /**
     * 分塊傳輸音源檔案 (32KB Chunks)
     */
    async sendAudioFile(fileOrBlob, channels = this.sync.channels()) {
        await this.audioTransfer.send(fileOrBlob, channels);
    }

    /**
     * 完整推播當前專案 (譜面 + 音源)
     */
    async pushProject(customData = null, channel = null) {
        if (!this.sync.isConnected()) return;

        let proj = customData;
        if (!proj && typeof this.callbacks.getProjectData === 'function') {
            proj = await this.callbacks.getProjectData();
        }
        if (!proj) return;

        await this.sync.transferProject(channel, async channel => {
        if (proj.chart) {
            this.sendChart(proj.chart, channel);
        }
        if (proj.audio) {
            await this.sendAudioFile(proj.audio, [channel]);
        } else {
            await this.audioTransfer.clear([channel]);
        }
        });
    }

    // =========================================================
    // 內部訊息處理與分塊拼裝
    // =========================================================

    _handleStatusChange(status, detail) {
        if (status === 'disconnected') {
            this._incomingAudioChunks = null;
            this._incomingAudioMeta = null;
            this._incomingAudioCount = 0;
            this._isRemoteTriggered = false;
            if (detail === 'allMembersLeft') {
                simpleToast({ content: t('settings.connection.allMembersLeft') || '所有成員已離開，房間已關閉', type: 'info', timeout: 2500 });
            } else if (detail === 'joinClosed') {
                simpleToast({ content: t('settings.connection.pairExpired') || '配對已逾時', type: 'info', timeout: 2500 });
            }
            if (this._transferCardEl) {
                this._transferCardEl.style.opacity = '0';
                setTimeout(() => {
                    if (this._transferCardEl) this._transferCardEl.style.display = 'none';
                }, 300);
            }
        }
        if (status === 'connected' && this.lastStatus !== 'connected' && this.sync.role === 'client') {
            this.requestChart();
        }
        this.lastStatus = status;

        if (this._modalUpdater) this._modalUpdater();
        if (typeof this.callbacks.onStatusChange === 'function') {
            this.callbacks.onStatusChange(status, detail);
        }
    }

    async _handleIncomingMessage(msg, channel) {
        if (!msg || !msg.action) return;

        if (msg.action === 'requestChart') {
            await this.pushProject(null, channel);
            return;
        }

        if (msg.action === 'projectBegin') {
            this.receivingProject = { id: msg.id, failed: false };
            return;
        }
        if (msg.action === 'projectLoaded') {
            if (this.receivingProject?.id === msg.id && !this.receivingProject.failed) this.sync.send({ action: 'projectReady', id: msg.id });
            return;
        }

        if (['play', 'pause', 'seek', 'restart', 'speed', 'chart'].includes(msg.action)) {
            await this._applyRemoteControl(msg);
            return;
        }
        if (msg.action === 'audio_clear') {
            if (typeof this.callbacks.onAudioClear === 'function') {
                await this.callbacks.onAudioClear();
            }
            this._incomingAudioChunks = null;
            this._incomingAudioMeta = null;
            this._incomingAudioCount = 0;
            this.showTransferProgress({
                text: t('settings.connection.transferComplete') || '同步完成',
                percent: 100,
                completed: true
            });
        } else if (msg.action === 'audio_start') {
            this._incomingAudioMeta = msg;
            this._incomingAudioChunks = new Array(msg.totalChunks || 0);
            this._incomingAudioCount = 0;
            const songName = msg.fileName || 'track';
            this.showTransferProgress({
                text: `${t('settings.connection.transferAudio') || '正在同步音源'} (${songName})...`,
                percent: 50,
                completed: false
            });
        } else if (msg.action === 'audio_chunk') {
            if (this._incomingAudioChunks && typeof msg.chunkIndex === 'number' && msg.data) {
                const u8 = base64ToUint8Array(msg.data);
                this._incomingAudioChunks[msg.chunkIndex] = u8;
                this._incomingAudioCount++;
                const total = msg.totalChunks || 1;
                const pct = Math.min(95, Math.floor(50 + (this._incomingAudioCount / total) * 45));
                this.showTransferProgress({
                    text: `${t('settings.connection.transferAudio') || '正在同步音源'} (${pct}%)...`,
                    percent: pct,
                    completed: false
                });
            }
        } else if (msg.action === 'audio_end') {
            if (this._incomingAudioChunks && this._incomingAudioChunks.length > 0) {
                try {
                    this.showTransferProgress({
                        text: t('settings.connection.audioSyncing') || '正在配置音源...',
                        percent: 98,
                        completed: false
                    });
                    const mimeType = this._incomingAudioMeta?.mimeType || 'audio/mp3';
                    const audioBlob = new Blob(this._incomingAudioChunks, { type: mimeType });
                    if (typeof this.callbacks.onAudio === 'function') {
                        await this.callbacks.onAudio(audioBlob, this._incomingAudioMeta);
                    }
                    this._incomingAudioChunks = null;
                    this._incomingAudioMeta = null;
                    this._incomingAudioCount = 0;
                    this.showTransferProgress({
                        text: t('settings.connection.transferComplete') || '同步完成',
                        percent: 100,
                        completed: true
                    });
                } catch (err) {
                    if (this.receivingProject) this.receivingProject.failed = true;
                    console.error('[SyncManager Error assembling audio]', err);
                    this.showTransferProgress({
                        text: `音源載入失敗: ${err.message}`,
                        percent: 100,
                        completed: true
                    });
                }
            }
        }
    }

    async _applyRemoteControl(msg) {
        this._isRemoteTriggered = true;
        try {
            if (msg.action === 'play') {
                const speed = msg.speed || 1;
                const startAt = typeof msg.startAt === 'number' ? msg.startAt : 0;
                if (typeof this.callbacks.onPlay === 'function') {
                    this.callbacks.onPlay(startAt, speed);
                }
            } else if (msg.action === 'pause') {
                if (typeof this.callbacks.onPause === 'function') {
                    this.callbacks.onPause();
                }
            } else if (msg.action === 'seek') {
                if (typeof this.callbacks.onSeek === 'function') {
                    this.callbacks.onSeek(msg.time || 0);
                }
            } else if (msg.action === 'restart') {
                if (typeof this.callbacks.onRestart === 'function') {
                    this.callbacks.onRestart();
                }
            } else if (msg.action === 'speed') {
                if (typeof this.callbacks.onSpeed === 'function') {
                    this.callbacks.onSpeed(msg.speed || 1);
                }
            } else if (msg.action === 'chart') {
                if (msg.data && typeof this.callbacks.onChart === 'function') {
                    // 譜面即時同步：靜默套用，不彈出任何視窗
                    await this.callbacks.onChart(msg.data);
                }
            }
        } finally {
            this._isRemoteTriggered = false;
        }
    }

    // =========================================================
    // UI 視窗與彈窗 (右下角非侵入式懸浮傳輸進度卡片)
    // =========================================================

    showTransferProgress({ title = '同步媒體資源...', text = '', percent = 0, completed = false, onDone = null }) {
        if (!this._transferCardEl) {
            this._transferCardEl = document.createElement('div');
            this._transferCardEl.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 10000;
                background: #1e1e1e;
                color: #fff;
                padding: 14px 18px;
                border-radius: 8px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
                border: 1px solid #383838;
                min-width: 280px;
                max-width: 380px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: inherit;
                pointer-events: auto;
                transition: opacity 0.3s ease, transform 0.3s ease;
            `;
            document.body.appendChild(this._transferCardEl);
        }

        const pct = Math.max(0, Math.min(100, Math.round(percent)));
        const iconName = completed ? 'check_circle' : 'audiotrack';
        const iconColor = completed ? '#4caf50' : '#4a90e2';

        this._transferCardEl.style.display = 'flex';
        this._transferCardEl.style.opacity = '1';
        this._transferCardEl.style.transform = 'translateY(0)';

        this._transferCardEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; color:#fff;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:${iconColor};" translate="no">${iconName}</span>
                    <span>${title}</span>
                </div>
                <span style="font-size:11px; color:#888;">${pct}%</span>
            </div>
            <div style="font-size:12px; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${text || '傳輸中...'}
            </div>
            <div style="width:100%; height:6px; background:#2a2a2a; border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:${iconColor}; transition:width 0.25s ease;"></div>
            </div>
        `;

        if (completed) {
            if (this._transferHideTimer) clearTimeout(this._transferHideTimer);
            this._transferHideTimer = setTimeout(() => {
                if (this._transferCardEl) {
                    this._transferCardEl.style.opacity = '0';
                    this._transferCardEl.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        if (this._transferCardEl) this._transferCardEl.style.display = 'none';
                        if (typeof onDone === 'function') onDone();
                    }, 350);
                }
            }, 1200);
        }
    }

    /**
     * 開啟統一的 WebRTC P2P 連線同步彈窗
     */
    openSyncModal(options = {}) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.width = '100%';
        container.style.boxSizing = 'border-box';

        const createRow = (labelText, element) => {
            const row = document.createElement('div');
            row.className = 'popup-setting-row';
            const label = document.createElement('span');
            label.className = 'popup-setting-label';
            label.textContent = labelText;
            row.appendChild(label);
            row.appendChild(element);
            return row;
        };

        // 1. 同步角色選擇 (接收端 / 發起端)
        const roleSelect = document.createElement('select');
        roleSelect.className = 'popup-setting-select';
        roleSelect.style.padding = '6px 10px';
        roleSelect.style.borderRadius = '4px';

        const optClient = document.createElement('option');
        optClient.value = 'client';
        optClient.textContent = t('settings.connection.roleReceiver') || '接收端';
        const optHost = document.createElement('option');
        optHost.value = 'host';
        optHost.textContent = t('settings.connection.roleSender') || '發起端';
        roleSelect.appendChild(optClient);
        roleSelect.appendChild(optHost);
        roleSelect.value = this.role;

        const roleRow = createRow(t('settings.connection.syncRole') || '同步角色', roleSelect);
        container.appendChild(roleRow);

        // 3. Client (接收端) 面板
        const clientBox = document.createElement('div');
        clientBox.style.display = this.role === 'client' ? 'flex' : 'none';
        clientBox.style.flexDirection = 'column';
        clientBox.style.gap = '10px';

        const codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.inputMode = 'numeric';
        codeInput.autocomplete = 'one-time-code';
        codeInput.pattern = '[0-9]*';
        codeInput.className = 'popup-setting-input';
        codeInput.maxLength = 6;
        codeInput.placeholder = '000000';
        codeInput.style.letterSpacing = '6px';
        codeInput.style.fontWeight = 'bold';
        codeInput.style.textAlign = 'center';
        codeInput.style.fontSize = '18px';
        codeInput.style.width = '140px';
        codeInput.addEventListener('input', () => {
            codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
        });

        clientBox.appendChild(createRow(t('settings.connection.pairCode') || '房間號碼', codeInput));

        const joinBtn = document.createElement('button');
        joinBtn.className = 'popup-button';
        joinBtn.textContent = t('settings.connection.joinBtn') || '手動加入連線';
        joinBtn.style.cssText = 'width:100%; padding:8px 16px; font-size:13px; font-weight:bold; cursor:pointer; background:#4a90e2; color:#fff; border:none; border-radius:4px; transition:background 0.2s;';
        clientBox.appendChild(joinBtn);
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !joinBtn.disabled) {
                e.preventDefault();
                joinBtn.click();
            }
        });

        container.appendChild(clientBox);

        // 4. Host (發起端) 面板
        const hostBox = document.createElement('div');
        hostBox.style.display = this.role === 'host' ? 'flex' : 'none';
        hostBox.style.flexDirection = 'column';
        hostBox.style.gap = '10px';

        const hostCodeDisplay = document.createElement('div');
        hostCodeDisplay.style.cssText = 'font-size:36px; font-weight:bold; letter-spacing:6px; color:#00e5ff; font-family:monospace; user-select:all; cursor:pointer;';
        hostCodeDisplay.setAttribute('role', 'button');
        hostCodeDisplay.tabIndex = 0;
        hostCodeDisplay.textContent = this.sync.roomCode || '------';
        const copyHostCode = async () => {
            if (!this.sync.roomCode) return;
            try {
                await navigator.clipboard?.writeText(this.sync.roomCode);
                simpleToast({ content: t('settings.connection.pairCodeCopied') || '已複製房間號碼', type: 'success', timeout: 1500 });
            } catch (error) {
                console.warn('[Sync] Failed to copy room code', error);
            }
        };
        hostCodeDisplay.addEventListener('click', copyHostCode);
        hostCodeDisplay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                copyHostCode();
            }
        });

        const hostCodeCard = document.createElement('div');
        hostCodeCard.style.cssText = 'display:none; flex-direction:column; align-items:center; justify-content:center; background:#18181c; border:1px solid #333; border-radius:8px; padding:18px 12px; gap:8px;';
        const hostCodeTitle = document.createElement('span');
        hostCodeTitle.style.cssText = 'font-size:12px; color:#888; letter-spacing:1px;';
        hostCodeTitle.textContent = t('settings.connection.pairCode') || '房間號碼';
        const cardCountdown = document.createElement('div');
        cardCountdown.style.cssText = 'font-size:11px; color:#aaa; font-family:monospace; margin-top:2px; display:none;';
        const cardStatus = document.createElement('div');
        cardStatus.style.cssText = 'font-size:12px; color:#ffab00; margin-top:4px;';
        hostCodeCard.append(hostCodeTitle, hostCodeDisplay, cardCountdown, cardStatus);
        container.appendChild(hostCodeCard);

        const createCodeBtn = document.createElement('button');
        createCodeBtn.className = 'popup-button';
        createCodeBtn.textContent = t('settings.connection.createBtn') || '開始配對';
        createCodeBtn.style.cssText = 'width:100%; padding:8px 16px; font-size:13px; font-weight:bold; cursor:pointer; background:#4a90e2; color:#fff; border:none; border-radius:4px; transition:background 0.2s;';
        hostBox.appendChild(createCodeBtn);

        container.appendChild(hostBox);

        // 5. 手動同步專案按鈕
        const pushProjectBtn = document.createElement('button');
        pushProjectBtn.className = 'popup-button';
        pushProjectBtn.textContent = t('settings.connection.btnManualPush') || '同步資料';
        pushProjectBtn.style.padding = '8px 16px';
        pushProjectBtn.style.width = '100%';
        pushProjectBtn.style.backgroundColor = '#333';
        pushProjectBtn.style.border = '1px solid #555';
        pushProjectBtn.style.display = this.sync.isConnected() ? 'block' : 'none';
        pushProjectBtn.addEventListener('click', async () => {
            if (this.sync.role === 'client') {
                this.requestChart();
                return;
            }
            pushProjectBtn.disabled = true;
            try {
                await this.pushProject();
                simpleToast({ content: t('settings.connection.manualPushed') || '已發送專案至對端', type: 'success', timeout: 1500 });
            } catch (err) {
                simpleToast({ content: `同步失敗: ${err.message}`, type: 'error', timeout: 3000 });
            } finally {
                pushProjectBtn.disabled = false;
            }
        });
        container.appendChild(pushProjectBtn);

        let popup = null;
        let currentButtonKey = null;
        const syncPopupButtons = () => {
            if (!popup) return;
            const phase = this.sync.phase();
            const isHost = this.sync.role === 'host';
            const mode = phase === 'idle'
                ? 'idle'
                : phase === 'pairing'
                    ? (isHost && this.sync.isConnected() ? 'pairing-connected' : 'pairing-waiting')
                    : 'connected';
            const buttonKey = `${mode}:${this.sync.role || ''}`;
            if (buttonKey === currentButtonKey) return;
            currentButtonKey = buttonKey;
            if (mode === 'idle') {
                popup.setButtons([{
                    text: t('popup.close') || '關閉',
                    hideOnClick: true
                }]);
            } else if (mode === 'pairing-waiting') {
                popup.setButtons([{
                    text: t('settings.connection.cancelPairing') || '取消配對',
                    onClick: (ctx) => {
                        this.sync.disconnect();
                        ctx.close();
                    }
                }]);
            } else if (mode === 'pairing-connected') {
                popup.setButtons([
                    {
                        text: t('settings.connection.cancelPairing') || '取消配對',
                        onClick: (ctx) => {
                            this.sync.disconnect();
                            ctx.close();
                        }
                    },
                    {
                        text: t('settings.connection.finishPairing') || '完成配對',
                        onClick: (ctx) => {
                            this.sync.finishPairing();
                            ctx.close();
                        }
                    }
                ]);
            } else {
                popup.setButtons([
                    {
                        text: t(isHost ? 'settings.connection.closeRoom' : 'settings.connection.leaveRoom'),
                        onClick: () => {
                            this.sync.disconnect();
                            renderSyncUI();
                            simpleToast({ content: t('settings.connection.webrtcDisconnectedToast') || '已中斷 WebRTC 連線', type: 'info', timeout: 1500 });
                        }
                    },
                    {
                        text: t('popup.close') || '關閉',
                        hideOnClick: true
                    }
                ]);
            }
        };

        let roomTimer = null;
        const renderSyncUI = () => {
            const phase = this.sync.phase();
            const isHost = this.sync.role === 'host';
            const connected = this.sync.isConnected();
            const displayCode = this.sync.roomCode || (phase === 'pairing' && !isHost ? codeInput.value.trim() : '') || '------';

            hostCodeDisplay.textContent = displayCode;
            pushProjectBtn.style.display = connected ? 'block' : 'none';

            if (phase === 'idle') {
                roleRow.style.display = 'flex';
                clientBox.style.display = this.role === 'client' ? 'flex' : 'none';
                hostBox.style.display = this.role === 'host' ? 'flex' : 'none';
                hostCodeCard.style.display = this.role === 'host' ? 'flex' : 'none';
                hostCodeDisplay.style.cursor = 'default';
                cardCountdown.style.display = 'none';
                cardStatus.textContent = t('settings.connection.promptGenCode') || '點擊下方按鈕開始配對';
                cardStatus.style.color = '#888';
            } else if (phase === 'pairing') {
                roleRow.style.display = 'none';
                clientBox.style.display = 'none';
                hostBox.style.display = 'none';
                hostCodeCard.style.display = 'flex';
                hostCodeDisplay.style.cursor = this.sync.roomCode ? 'pointer' : 'default';
                if (isHost) {
                    const ready = this.sync.channels().length + 1;
                    cardStatus.textContent = t('settings.connection.roomOccupancy', {
                        occupied: Math.max(ready, this.sync.occupied), connected: ready
                    });
                    cardStatus.style.color = connected ? '#00e676' : '#ffab00';
                    if (this.sync.expiresAt) {
                        const remaining = Math.max(0, Math.ceil((this.sync.expiresAt - Date.now()) / 1000));
                        const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
                        cardCountdown.style.display = 'block';
                        if (remaining <= 0) {
                            cardCountdown.textContent = t('settings.connection.countdownExpired') || '房間號碼已逾期';
                            cardCountdown.style.color = '#ff5252';
                        } else {
                            cardCountdown.textContent = t('settings.connection.countdownRemaining', { time }) || `${time} remaining`;
                            cardCountdown.style.color = '#aaa';
                        }
                    } else {
                        cardCountdown.style.display = 'none';
                    }
                } else {
                    cardCountdown.style.display = 'none';
                    cardStatus.textContent = t('settings.connection.statusConnecting') || '狀態：正在連線...';
                    cardStatus.style.color = '#ffab00';
                }
            } else {
                roleRow.style.display = 'none';
                clientBox.style.display = 'none';
                hostBox.style.display = 'none';
                hostCodeCard.style.display = 'flex';
                hostCodeDisplay.style.cursor = this.sync.roomCode ? 'pointer' : 'default';
                cardCountdown.style.display = 'none';
                cardStatus.style.color = '#00e676';
                if (isHost) {
                    const ready = this.sync.channels().length + 1;
                    cardStatus.textContent = t('settings.connection.roomOccupancy', {
                        occupied: ready, connected: ready
                    });
                } else {
                    cardStatus.textContent = t('settings.connection.statusConnected') || '已連線';
                }
            }
            syncPopupButtons();
        };

        this._modalUpdater = renderSyncUI;
        renderSyncUI();
        roomTimer = setInterval(renderSyncUI, 1000);

        roleSelect.addEventListener('change', (e) => {
            this.role = e.target.value;
            localStorage.setItem('wmcx_webrtc_role', this.role);
            renderSyncUI();
        });

        joinBtn.addEventListener('click', async () => {
            if (options.onBeforeConnect) {
                try { await options.onBeforeConnect(); } catch (_) { }
            }
            const code = codeInput.value.trim();
            if (!/^\d{6}$/.test(code)) {
                simpleToast({ content: t('settings.connection.pairCodePlaceholder') || '請輸入完整的 6 位數房間號碼', type: 'warning', timeout: 2000 });
                return;
            }
            joinBtn.disabled = true;
            joinBtn.textContent = t('settings.connection.joining') || '加入中...';
            try {
                await this.sync.joinRoom(code);
                simpleToast({ content: `${t('settings.connection.statusConnecting') || '正在連線...'} (${code})`, type: 'info', timeout: 2000 });
            } catch (e) {
                const detail = t(`settings.connection.${e.message}`);
                simpleToast({ content: detail === `settings.connection.${e.message}` ? e.message : detail, type: 'error', timeout: 3000 });
            } finally {
                joinBtn.disabled = false;
                joinBtn.textContent = t('settings.connection.joinBtn') || '手動加入連線';
                renderSyncUI();
            }
        });

        createCodeBtn.addEventListener('click', async () => {
            createCodeBtn.disabled = true;
            createCodeBtn.textContent = t('settings.connection.creating') || '產生中...';
            try {
                const code = await this.sync.createRoom();
                hostCodeDisplay.textContent = code;
                simpleToast({ content: t('settings.connection.toastPairCodeReady', { code }) || `房間號碼 ${code} 已就緒，請在另一端輸入`, type: 'success', timeout: 3000 });
            } catch (e) {
                simpleToast({ content: `建立失敗: ${e.message}`, type: 'error', timeout: 3000 });
            } finally {
                createCodeBtn.disabled = false;
                createCodeBtn.textContent = t('settings.connection.createBtn') || '開始配對';
                renderSyncUI();
            }
        });

        popup = popupWindow({
            title: options.title || t('settings.connection.syncView') || '設定同步檢視',
            customContent: container,
            width: 400,
            maxWidth: '90%',
            unclosable: true,
            buttons: [],
            onClose: () => {
                clearInterval(roomTimer);
                this._modalUpdater = null;
            }
        });
        syncPopupButtons();
        return popup;
    }

    updateButtonUI(connectionBtn) {
        if (!connectionBtn) return;
        const isWrtc = this.sync.isConnected();
        const isConnecting = this.sync.status === 'connecting';

        connectionBtn.classList.remove('connected', 'connecting');
        if (isWrtc) {
            connectionBtn.classList.add('connected');
            connectionBtn.title = t('settings.connection.clientP2P') || 'WebRTC P2P 已連線';
        } else if (isConnecting) {
            connectionBtn.classList.add('connecting');
            connectionBtn.title = t('settings.connection.statusConnecting') || '正在連線...';
        } else {
            connectionBtn.title = t('settings.connection.syncRole') || '連線同步設定';
        }
    }
}
