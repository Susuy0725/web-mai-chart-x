// Scripts/services/transferProgress.js
// 傳輸進度元件與狀態機控制器
// 下載與上傳共用同一套狀態模型，嚴格遵循真實網路傳輸數據，不使用 setInterval 製造假進度。
//
// 狀態清單:
// - idle: 閒置
// - preparing: 正在準備檔案／建立請求
// - transferring: 顯示實際網路傳輸進度 (支援 Content-Length / indeterminate)
// - processing: 傳輸完成，正在進行既有的打包或匯入處理
// - completed: 整個操作完成
// - error: 操作失敗

import { t } from '../i18n.js';

export function createTransferProgress({
    preparingText,
    processingText,
    completedText,
} = {}) {
    const defaultPreparing = preparingText || t('popup.drive.preparingUpload');
    const defaultProcessing = processingText || t('popup.drive.packaging');
    const defaultCompleted = completedText || t('popup.drive.uploadSuccess');
    const wrapper = document.createElement('div');
    wrapper.className = 'tp-wrapper';

    const statusRow = document.createElement('div');
    statusRow.className = 'tp-status-row';

    const statusIcon = document.createElement('span');
    statusIcon.className = 'material-symbols-outlined tp-icon';
    statusIcon.setAttribute('translate', 'no');

    const statusText = document.createElement('span');
    statusText.className = 'tp-text';

    const bytesText = document.createElement('span');
    bytesText.className = 'tp-bytes';

    statusRow.append(statusIcon, statusText, bytesText);

    const barBg = document.createElement('div');
    barBg.className = 'tp-bar-bg';

    const barFill = document.createElement('div');
    barFill.className = 'tp-bar-fill';
    barBg.appendChild(barFill);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'tp-error-msg';
    errorMsg.style.display = 'none';

    wrapper.append(statusRow, barBg, errorMsg);

    let _state = 'idle';

    function _formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function _setBarDeterminate(pct) {
        barFill.classList.remove('tp-bar-indeterminate');
        barFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    function _setBarIndeterminate() {
        barFill.classList.add('tp-bar-indeterminate');
        barFill.style.width = '40%';
    }

    function _setIcon(name) {
        statusIcon.textContent = name;
    }

    function _applyState(nextState, opts = {}) {
        _state = nextState;
        wrapper.dataset.state = nextState;
        errorMsg.style.display = 'none';

        switch (nextState) {
            case 'idle':
                statusText.textContent = '';
                bytesText.textContent = '';
                _setIcon('cloud_sync');
                _setBarDeterminate(0);
                break;

            case 'preparing':
                statusText.textContent = opts.message || defaultPreparing;
                bytesText.textContent = '';
                _setIcon('sync');
                _setBarIndeterminate();
                break;

            case 'transferring': {
                const { loaded = 0, total = null, direction = 'download' } = opts;
                const isUpload = direction === 'upload';
                const label = isUpload ? t('popup.drive.uploading') : t('popup.drive.downloading');
                statusText.textContent = label;
                _setIcon(isUpload ? 'cloud_upload' : 'cloud_download');

                if (typeof total === 'number' && total > 0) {
                    const pct = Math.min(100, Math.round((loaded / total) * 100));
                    bytesText.textContent = `${_formatBytes(loaded)} / ${_formatBytes(total)} (${pct}%)`;
                    _setBarDeterminate(pct);
                } else {
                    bytesText.textContent = t('popup.drive.transferred', { size: _formatBytes(loaded) });
                    _setBarIndeterminate();
                }
                break;
            }

            case 'processing':
                statusText.textContent = opts.message || defaultProcessing;
                bytesText.textContent = '';
                _setIcon('sync');
                _setBarIndeterminate();
                break;

            case 'completed':
                statusText.textContent = opts.message || defaultCompleted;
                bytesText.textContent = '';
                _setIcon('check_circle');
                _setBarDeterminate(100);
                break;

            case 'error': {
                const message = opts.message || t('popup.drive.operationFailed');
                statusText.textContent = t('popup.drive.operationFailed');
                bytesText.textContent = '';
                _setIcon('error');
                _setBarDeterminate(0);
                errorMsg.textContent = message;
                errorMsg.style.display = 'block';
                break;
            }
        }
    }

    const controller = {
        get state() {
            return _state;
        },
        preparing(msg) {
            _applyState('preparing', { message: msg });
        },
        transferring(opts) {
            _applyState('transferring', opts);
        },
        processing(msg) {
            _applyState('processing', { message: msg });
        },
        completed(msg) {
            _applyState('completed', { message: msg });
        },
        error(message) {
            _applyState('error', { message });
        },
        reset() {
            _applyState('idle');
        },
        el: wrapper,
    };

    _applyState('idle');
    return { el: wrapper, controller };
}
