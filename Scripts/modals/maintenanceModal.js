/**
 * maintenanceModal.js
 * 
 * 職責：
 * 提供「匯出確認選擇彈窗」與「匯入確認選擇彈窗」，
 * 採用 Material Design 風格（原生 HTML+CSS），
 * 讓使用者確認讀取到的設定與專案清單，自主選擇欲匯出或還原的項目。
 */

import { popupWindow, simpleToast } from '../helper.js';
import { extractSimaiEditorData } from '../core/wmcxExtract.js';
import { packageWmcxData, triggerDownload } from '../features/wmcxPackage.js';
import { inspectWmcxZip, restoreWmcxZip } from '../features/wmcxRestore.js';
import { t } from '../i18n.js';

// 注入專用樣式（Material Design）
function ensureMaintenanceStyles() {
    const styleId = 'wmc-maintenance-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .mm-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
            color: #d0d0d0;
            font-size: 14px;
            max-width: 680px;
            box-sizing: border-box;
        }
        .mm-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px;
        }
        .mm-stat-card {
            background-color: #252525;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .mm-stat-label {
            font-size: 12px;
            color: #9e9e9e;
        }
        .mm-stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #49e;
        }
        .mm-section {
            background-color: #222;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 6px;
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .mm-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .mm-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #f0f0f0;
        }
        .mm-toggle-row {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            user-select: none;
        }
        .mm-toggle-row input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: #49e;
            cursor: pointer;
        }
        .mm-master-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            user-select: none;
            font-size: 13px;
            color: #ddd;
            padding: 2px 6px;
            border-radius: 4px;
            outline: none;
            transition: background 0.15s;
        }
        .mm-master-toggle:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        .mm-master-toggle:focus-visible {
            box-shadow: 0 0 0 2px rgba(68, 153, 238, 0.5);
        }
        .mm-master-toggle input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: #49e;
            pointer-events: none;
            margin: 0;
        }
        .mm-master-toggle span {
            user-select: none;
            pointer-events: none;
        }
        .mm-project-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 250px;
            overflow-y: auto;
            padding-right: 4px;
        }
        .mm-project-item {
            background-color: #262626;
            border: 1.5px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 9px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .mm-project-item:hover {
            background-color: #303030;
            border-color: rgba(255, 255, 255, 0.18);
        }
        .mm-project-item.selected {
            background-color: rgba(68, 153, 238, 0.12);
            border-color: #49e;
        }
        .mm-project-item.selected:hover {
            background-color: rgba(68, 153, 238, 0.18);
            border-color: #6af;
        }
        .mm-project-name {
            font-size: 14px;
            font-weight: 500;
            color: #e0e0e0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            min-width: 0;
        }
        .mm-project-item.selected .mm-project-name {
            color: #fff;
            font-weight: 600;
        }
        .mm-tag-group {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }
        .mm-tag {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 3px;
            background-color: rgba(255, 255, 255, 0.06);
            color: #888;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .mm-tag.active {
            background-color: rgba(68, 153, 238, 0.15);
            color: #49e;
            border-color: rgba(68, 153, 238, 0.3);
        }
        .mm-notice {
            font-size: 12px;
            color: #888;
            line-height: 1.4;
        }
        /* 凍結式操作進度彈窗樣式 (Material Design) */
        .mm-progress-wrap {
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 8px 4px 4px 4px;
            box-sizing: border-box;
        }
        .mm-progress-msg {
            font-size: 14px;
            color: #d0d0d0;
            line-height: 1.5;
            min-height: 22px;
            word-break: break-all;
        }
        .mm-progress-track {
            width: 100%;
            height: 8px;
            background: #2a2a2a;
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }
        .mm-progress-bar {
            height: 100%;
            width: 0%;
            background: #49e;
            border-radius: 4px;
            transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease;
        }
        .mm-progress-bar.error {
            background: #e55;
        }
        .mm-progress-footer {
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }
        .mm-progress-pct {
            font-size: 13px;
            font-weight: 600;
            color: #888;
            font-variant-numeric: tabular-nums;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 建立凍結操作式進度彈窗 (Material Design)
 * 彈出時凍結背景所有互動操作，提供 0%~100% 進度顯示與即時狀態訊息。
 * 
 * @param {string} title - 彈窗標題
 * @returns {{
 *   update: (percent: number, message?: string) => void,
 *   finish: (message?: string, duration?: number) => Promise<void>,
 *   error: (errorMessage: string) => void,
 *   close: () => void
 * }}
 */
export function openFrozenProgressModal(title = t('popup.maintenance.processing')) {
    ensureMaintenanceStyles();

    const container = document.createElement('div');
    container.className = 'mm-progress-wrap';

    const msgEl = document.createElement('div');
    msgEl.className = 'mm-progress-msg';
    msgEl.textContent = t('popup.maintenance.preparing');

    const trackEl = document.createElement('div');
    trackEl.className = 'mm-progress-track';

    const barEl = document.createElement('div');
    barEl.className = 'mm-progress-bar';
    trackEl.appendChild(barEl);

    const footerEl = document.createElement('div');
    footerEl.className = 'mm-progress-footer';

    const pctEl = document.createElement('div');
    pctEl.className = 'mm-progress-pct';
    pctEl.textContent = '0%';
    footerEl.appendChild(pctEl);

    container.append(msgEl, trackEl, footerEl);

    const modalCtx = popupWindow({
        title,
        customContent: container,
        width: 460,
        maxWidth: 520,
        unclosable: true,
        mode: 'dialog',
        buttons: []
    });

    return {
        update(pct, msg) {
            const clamped = Math.max(0, Math.min(100, Math.round(pct)));
            barEl.style.width = `${clamped}%`;
            pctEl.textContent = `${clamped}%`;
            if (msg) msgEl.textContent = msg;
        },
        async finish(msg = t('popup.maintenance.restoreDone'), duration = 800) {
            barEl.style.width = '100%';
            pctEl.textContent = '100%';
            if (msg) msgEl.textContent = msg;
            await new Promise(r => setTimeout(r, duration));
            modalCtx.close();
        },
        error(errMsg) {
            barEl.classList.add('error');
            barEl.style.width = '100%';
            msgEl.style.color = '#ff6b6b';
            msgEl.textContent = errMsg || t('popup.maintenance.restoreFailed', { error: 'Unknown' });
            modalCtx.setButtons([
                {
                    text: t('popup.maintenance.confirm') || '確定',
                    onClick: (ctx) => ctx.close()
                }
            ]);
        },
        close() {
            modalCtx.close();
        }
    };
}

/**
 * 開啟「匯出確認選擇彈窗」
 */
export async function openExportSelectionModal() {
    ensureMaintenanceStyles();

    simpleToast({ content: t('popup.maintenance.loadingData'), type: 'info', timeout: 1500 });
    let extractedData;
    try {
        extractedData = await extractSimaiEditorData();
    } catch (err) {
        console.error('[ExportModal] 讀取資料失敗:', err);
        simpleToast({ content: t('popup.maintenance.loadError', { error: err.message || err }), type: 'error' });
        return;
    }

    const { settingsEnvelope, projects } = extractedData;
    const settingsObj = settingsEnvelope.settings || {};
    const settingsCount = Object.keys(settingsObj).length;

    let trackTotal = 0;
    let mediaTotal = 0;
    projects.forEach(p => {
        if (p.track) trackTotal++;
        if (p.bg) mediaTotal++;
        if (p.pv) mediaTotal++;
    });

    if (projects.length === 0 && settingsCount === 0) {
        simpleToast({ content: t('popup.maintenance.noExportData'), type: 'warn' });
        return;
    }

    // 建立 DOM 內容
    const container = document.createElement('div');
    container.className = 'mm-container';

    // 1. 統計看板
    const statsGrid = document.createElement('div');
    statsGrid.className = 'mm-stats-grid';
    statsGrid.innerHTML = `
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statExportableProjects')}</span>
            <span class="mm-stat-value">${projects.length}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statSettingsCount')}</span>
            <span class="mm-stat-value">${settingsCount}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statAudioTracks')}</span>
            <span class="mm-stat-value">${trackTotal}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statMediaCount')}</span>
            <span class="mm-stat-value">${mediaTotal}</span>
        </div>
    `;
    container.appendChild(statsGrid);

    // 2. 設定檔開關
    const settingsSec = document.createElement('div');
    settingsSec.className = 'mm-section';
    const settingsRow = document.createElement('div');
    settingsRow.className = 'mm-toggle-row';

    const settingsCheckbox = document.createElement('input');
    settingsCheckbox.type = 'checkbox';
    settingsCheckbox.id = 'mm-export-settings-cb';
    settingsCheckbox.checked = settingsCount > 0;
    settingsCheckbox.disabled = settingsCount === 0;
    settingsCheckbox.addEventListener('click', (e) => e.stopPropagation());

    const settingsText = document.createElement('label');
    settingsText.htmlFor = 'mm-export-settings-cb';
    settingsText.style.cursor = settingsCount === 0 ? 'default' : 'pointer';
    settingsText.style.flex = '1';
    settingsText.innerHTML = `<strong>${t('popup.maintenance.exportSettingsTitle')}</strong> <span style="color:#888; font-size:12px;">(${settingsCount > 0 ? t('popup.maintenance.exportSettingsDesc') : t('popup.maintenance.noSettingsData')})</span>`;

    settingsRow.append(settingsCheckbox, settingsText);
    settingsSec.appendChild(settingsRow);
    container.appendChild(settingsSec);

    // 3. 專案選擇區
    const projectSec = document.createElement('div');
    projectSec.className = 'mm-section';

    const projectSecHeader = document.createElement('div');
    projectSecHeader.className = 'mm-section-header';

    const projectSecTitle = document.createElement('span');
    projectSecTitle.className = 'mm-section-title';
    projectSecTitle.textContent = t('popup.maintenance.exportProjectsHeader', { checked: projects.length, total: projects.length });

    const masterToggle = document.createElement('div');
    masterToggle.className = 'mm-master-toggle';
    masterToggle.tabIndex = 0;
    masterToggle.setAttribute('role', 'checkbox');
    masterToggle.setAttribute('aria-label', t('popup.maintenance.selectAll'));

    const masterCheckbox = document.createElement('input');
    masterCheckbox.type = 'checkbox';
    masterCheckbox.checked = projects.length > 0;
    masterCheckbox.tabIndex = -1;
    masterCheckbox.id = 'mm-export-master-cb';

    const masterLabelText = document.createElement('span');
    masterLabelText.textContent = t('popup.maintenance.selectAll');
    masterToggle.append(masterCheckbox, masterLabelText);

    projectSecHeader.append(projectSecTitle, masterToggle);
    projectSec.appendChild(projectSecHeader);

    // 專案列表
    const projectListEl = document.createElement('div');
    projectListEl.className = 'mm-project-list';

    const projectCards = [];
    const selectedProjectIds = new Set(projects.map(p => p.id));

    projects.forEach((proj) => {
        const item = document.createElement('div');
        item.className = 'mm-project-item selected';
        item.dataset.projectId = proj.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mm-project-name';
        nameSpan.textContent = proj.name;

        const tags = document.createElement('div');
        tags.className = 'mm-tag-group';
        tags.innerHTML = `
            <span class="mm-tag ${proj.maidataText ? 'active' : ''}">${t('popup.maintenance.tagChart')}</span>
            <span class="mm-tag ${proj.track ? 'active' : ''}">${t('popup.maintenance.tagBgm')}</span>
            <span class="mm-tag ${proj.bg ? 'active' : ''}">${t('popup.maintenance.tagBg')}</span>
            <span class="mm-tag ${proj.pv ? 'active' : ''}">${t('popup.maintenance.tagPv')}</span>
        `;

        item.append(nameSpan, tags);

        // 點擊卡片任何位置直接切換選取狀態
        item.addEventListener('click', () => {
            if (selectedProjectIds.has(proj.id)) {
                selectedProjectIds.delete(proj.id);
                item.classList.remove('selected');
            } else {
                selectedProjectIds.add(proj.id);
                item.classList.add('selected');
            }
            updateConfirmState();
        });

        projectCards.push(item);
        projectListEl.appendChild(item);
    });

    projectSec.appendChild(projectListEl);
    container.appendChild(projectSec);

    // 更新計數與確認按鈕狀態
    let confirmBtnRef = null;
    const updateConfirmState = () => {
        const checkedCount = selectedProjectIds.size;
        projectSecTitle.textContent = t('popup.maintenance.exportProjectsHeader', { checked: checkedCount, total: projects.length });

        // 同步三態全選核取方塊
        if (projects.length === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = true;
            masterToggle.setAttribute('aria-checked', 'false');
        } else if (checkedCount === projects.length) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'true');
        } else if (checkedCount === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'false');
        } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'mixed');
        }

        const hasSelectedProjects = checkedCount > 0;
        const hasSettings = settingsCheckbox.checked;

        if (confirmBtnRef) {
            confirmBtnRef.disabled = !hasSelectedProjects && !hasSettings;
            if (hasSelectedProjects && hasSettings) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmExport', { count: checkedCount });
            } else if (hasSelectedProjects) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmExportNoSettings', { count: checkedCount });
            } else if (hasSettings) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmExportSettingsOnly');
            } else {
                confirmBtnRef.innerText = t('popup.maintenance.selectAtLeastOne');
            }
        }
    };

    settingsCheckbox.addEventListener('change', updateConfirmState);

    // 全選區域點擊與鍵盤事件
    const toggleMaster = () => {
        if (projects.length === 0) return;
        const isAllSelected = (selectedProjectIds.size === projects.length);
        if (isAllSelected) {
            // 已全選狀態 -> 全部取消
            selectedProjectIds.clear();
            projectCards.forEach(c => c.classList.remove('selected'));
        } else {
            // 非全選狀態（部分選橫槓或空白） -> 全部選取
            projects.forEach(p => selectedProjectIds.add(p.id));
            projectCards.forEach(c => c.classList.add('selected'));
        }
        updateConfirmState();
    };

    masterToggle.addEventListener('click', toggleMaster);
    masterToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleMaster();
        }
    });

    // 建立彈窗
    let modalInstance = null;
    modalInstance = popupWindow({
        title: t('popup.maintenance.titleExport'),
        customContent: container,
        width: 600,
        maxWidth: 720,
        buttons: [
            {
                text: t('popup.maintenance.cancel'),
                onClick: (ctx) => ctx.close()
            },
            {
                text: settingsCount > 0
                    ? t('popup.maintenance.confirmExport', { count: projects.length })
                    : t('popup.maintenance.confirmExportNoSettings', { count: projects.length }),
                onClick: async (ctx) => {
                    const selectedIds = Array.from(selectedProjectIds);
                    const includeSettings = settingsCheckbox.checked;

                    if (selectedIds.length === 0 && !includeSettings) return;

                    ctx.close();

                    const progressModal = openFrozenProgressModal(t('popup.maintenance.exportProgressTitle'));
                    progressModal.update(0, t('popup.maintenance.initExport'));

                    try {
                        const zipBlob = await packageWmcxData(extractedData, {
                            rootFolderName: 'wmcx_output',
                            selectedProjectIds: selectedIds,
                            includeSettings,
                            onProgress: ({ percent, message }) => {
                                progressModal.update(percent, message);
                            }
                        });
                        progressModal.update(100, t('popup.maintenance.packaging'));
                        triggerDownload(zipBlob, 'wmcx_output.zip');
                        await progressModal.finish(t('popup.maintenance.exportDone'), 800);
                        simpleToast({ content: t('popup.maintenance.exportSuccess'), type: 'success' });
                    } catch (err) {
                        console.error('[ExportModal] 打包失敗:', err);
                        progressModal.error(t('popup.maintenance.exportFailed', { error: err.message || err }));
                    }
                }
            }
        ]
    });

    // 綁定確認按鈕參照
    const buttons = document.querySelectorAll('.popup-button');
    if (buttons.length >= 2) {
        confirmBtnRef = buttons[buttons.length - 1];
    }
}

/**
 * 開啟「匯入確認選擇彈窗」
 * @param {File} zipFile - 使用者選取的 ZIP 檔案
 */
export async function openImportSelectionModal(zipFile, options = {}) {
    ensureMaintenanceStyles();

    simpleToast({ content: t('popup.maintenance.parsingZip'), type: 'info', timeout: 1500 });
    let inspection;
    try {
        inspection = await inspectWmcxZip(zipFile);
    } catch (err) {
        console.error('[ImportModal] 預檢失敗:', err);
        simpleToast({ content: t('popup.maintenance.parseZipError', { error: err.message || err }), type: 'error' });
        options.onCancel?.(err);
        return;
    }

    const { hasSettings, settingsCount, projects } = inspection;

    if (projects.length === 0 && !hasSettings) {
        simpleToast({ content: t('popup.maintenance.emptyZip'), type: 'warn' });
        options.onCancel?.();
        return;
    }

    let trackTotal = 0;
    let mediaTotal = 0;
    projects.forEach(p => {
        if (p.trackFilename) trackTotal++;
        if (p.bgFilename) mediaTotal++;
        if (p.pvFilename) mediaTotal++;
    });

    // 建立 DOM 內容
    const container = document.createElement('div');
    container.className = 'mm-container';

    // 1. 統計看板
    const statsGrid = document.createElement('div');
    statsGrid.className = 'mm-stats-grid';
    statsGrid.innerHTML = `
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statArchiveProjects')}</span>
            <span class="mm-stat-value">${projects.length}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statSettingsCount')}</span>
            <span class="mm-stat-value">${settingsCount}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statAudioTracks')}</span>
            <span class="mm-stat-value">${trackTotal}</span>
        </div>
        <div class="mm-stat-card">
            <span class="mm-stat-label">${t('popup.maintenance.statMediaCount')}</span>
            <span class="mm-stat-value">${mediaTotal}</span>
        </div>
    `;
    container.appendChild(statsGrid);

    // 2. 設定檔開關
    const settingsSec = document.createElement('div');
    settingsSec.className = 'mm-section';
    const settingsRow = document.createElement('div');
    settingsRow.className = 'mm-toggle-row';

    const settingsCheckbox = document.createElement('input');
    settingsCheckbox.type = 'checkbox';
    settingsCheckbox.id = 'mm-import-settings-cb';
    settingsCheckbox.checked = hasSettings;
    settingsCheckbox.disabled = !hasSettings;
    settingsCheckbox.addEventListener('click', (e) => e.stopPropagation());

    const settingsText = document.createElement('label');
    settingsText.htmlFor = 'mm-import-settings-cb';
    settingsText.style.cursor = hasSettings ? 'pointer' : 'default';
    settingsText.style.flex = '1';
    settingsText.innerHTML = hasSettings
        ? `<strong>${t('popup.maintenance.importSettingsTitle')}</strong> <span style="color:#888; font-size:12px;">${t('popup.maintenance.importSettingsCount', { count: settingsCount })}</span>`
        : `<span style="color:#666;">${t('popup.maintenance.archiveNoSettings')}</span>`;

    settingsRow.append(settingsCheckbox, settingsText);
    settingsSec.appendChild(settingsRow);
    container.appendChild(settingsSec);

    // 3. 專案選擇區
    const projectSec = document.createElement('div');
    projectSec.className = 'mm-section';

    const projectSecHeader = document.createElement('div');
    projectSecHeader.className = 'mm-section-header';

    const projectSecTitle = document.createElement('span');
    projectSecTitle.className = 'mm-section-title';
    projectSecTitle.textContent = t('popup.maintenance.importProjectsHeader', { checked: projects.length, total: projects.length });

    const masterToggle = document.createElement('div');
    masterToggle.className = 'mm-master-toggle';
    masterToggle.tabIndex = 0;
    masterToggle.setAttribute('role', 'checkbox');
    masterToggle.setAttribute('aria-label', t('popup.maintenance.selectAll'));

    const masterCheckbox = document.createElement('input');
    masterCheckbox.type = 'checkbox';
    masterCheckbox.checked = projects.length > 0;
    masterCheckbox.tabIndex = -1;
    masterCheckbox.id = 'mm-import-master-cb';

    const masterLabelText = document.createElement('span');
    masterLabelText.textContent = t('popup.maintenance.selectAll');
    masterToggle.append(masterCheckbox, masterLabelText);

    projectSecHeader.append(projectSecTitle, masterToggle);
    projectSec.appendChild(projectSecHeader);

    // 專案列表
    const projectListEl = document.createElement('div');
    projectListEl.className = 'mm-project-list';

    const projectCards = [];
    const selectedDirNames = new Set(projects.map(p => p.dirName));

    projects.forEach((proj) => {
        const item = document.createElement('div');
        item.className = 'mm-project-item selected';
        item.dataset.dirName = proj.dirName;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'mm-project-name';
        nameSpan.textContent = proj.name;

        const tags = document.createElement('div');
        tags.className = 'mm-tag-group';
        tags.innerHTML = `
            <span class="mm-tag ${proj.hasMaidata ? 'active' : ''}">${t('popup.maintenance.tagChart')}</span>
            <span class="mm-tag ${proj.trackFilename ? 'active' : ''}">${t('popup.maintenance.tagBgm')}</span>
            <span class="mm-tag ${proj.bgFilename ? 'active' : ''}">${t('popup.maintenance.tagBg')}</span>
            <span class="mm-tag ${proj.pvFilename ? 'active' : ''}">${t('popup.maintenance.tagPv')}</span>
        `;

        item.append(nameSpan, tags);

        // 點擊卡片任何位置直接切換選取狀態
        item.addEventListener('click', () => {
            if (selectedDirNames.has(proj.dirName)) {
                selectedDirNames.delete(proj.dirName);
                item.classList.remove('selected');
            } else {
                selectedDirNames.add(proj.dirName);
                item.classList.add('selected');
            }
            updateConfirmState();
        });

        projectCards.push(item);
        projectListEl.appendChild(item);
    });

    projectSec.appendChild(projectListEl);
    container.appendChild(projectSec);

    // 更新計數與確認按鈕狀態
    let confirmBtnRef = null;
    const updateConfirmState = () => {
        const checkedCount = selectedDirNames.size;
        projectSecTitle.textContent = t('popup.maintenance.importProjectsHeader', { checked: checkedCount, total: projects.length });

        // 同步三態全選核取方塊
        if (projects.length === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = true;
            masterToggle.setAttribute('aria-checked', 'false');
        } else if (checkedCount === projects.length) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'true');
        } else if (checkedCount === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'false');
        } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
            masterCheckbox.disabled = false;
            masterToggle.setAttribute('aria-checked', 'mixed');
        }

        const hasSelectedProjects = checkedCount > 0;
        const hasSettingsSelected = settingsCheckbox.checked;

        if (confirmBtnRef) {
            confirmBtnRef.disabled = !hasSelectedProjects && !hasSettingsSelected;
            if (hasSelectedProjects && hasSettingsSelected) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmImport', { count: checkedCount });
            } else if (hasSelectedProjects) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmImportNoSettings', { count: checkedCount });
            } else if (hasSettingsSelected) {
                confirmBtnRef.innerText = t('popup.maintenance.confirmImportSettingsOnly');
            } else {
                confirmBtnRef.innerText = t('popup.maintenance.selectAtLeastOne');
            }
        }
    };

    settingsCheckbox.addEventListener('change', updateConfirmState);

    // 全選區域點擊與鍵盤事件
    const toggleMaster = () => {
        if (projects.length === 0) return;
        const isAllSelected = (selectedDirNames.size === projects.length);
        if (isAllSelected) {
            // 已全選狀態 -> 全部取消
            selectedDirNames.clear();
            projectCards.forEach(c => c.classList.remove('selected'));
        } else {
            // 非全選狀態（部分選橫槓或空白） -> 全部選取
            projects.forEach(p => selectedDirNames.add(p.dirName));
            projectCards.forEach(c => c.classList.add('selected'));
        }
        updateConfirmState();
    };

    masterToggle.addEventListener('click', toggleMaster);
    masterToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleMaster();
        }
    });

    // 建立彈窗
    let modalInstance = null;
    let importExecuted = false;
    modalInstance = popupWindow({
        title: t('popup.maintenance.titleImport'),
        customContent: container,
        width: 600,
        maxWidth: 720,
        onClose: () => {
            if (!importExecuted) {
                options.onCancel?.();
            }
        },
        buttons: [
            {
                text: t('popup.maintenance.cancel'),
                onClick: (ctx) => {
                    ctx.close();
                }
            },
            {
                text: hasSettings
                    ? t('popup.maintenance.confirmImport', { count: projects.length })
                    : t('popup.maintenance.confirmImportNoSettings', { count: projects.length }),
                onClick: async (ctx) => {
                    const selectedFolders = Array.from(selectedDirNames);
                    const includeSettings = settingsCheckbox.checked;

                    if (selectedFolders.length === 0 && !includeSettings) return;

                    importExecuted = true;
                    ctx.close();

                    const progressModal = openFrozenProgressModal(t('popup.maintenance.importProgressTitle'));
                    progressModal.update(0, t('popup.maintenance.initRestore'));

                    try {
                        const res = await restoreWmcxZip(zipFile, {
                            selectedFolderNames: selectedFolders,
                            includeSettings,
                            onProgress: ({ percent, message }) => {
                                progressModal.update(percent, message);
                            }
                        });
                        const settingsText = res.settingsRestored ? t('popup.maintenance.withSettings') : '';
                        const doneMsg = t('popup.maintenance.importSuccess', {
                            count: res.importedProjectsCount,
                            settings: settingsText
                        });
                        await progressModal.finish(doneMsg, 1000);
                        simpleToast({
                            content: doneMsg,
                            type: 'success',
                            timeout: 3500
                        });
                        if (typeof options.onComplete === 'function') {
                            options.onComplete(res);
                        }
                    } catch (err) {
                        console.error('[ImportModal] 還原失敗:', err);
                        progressModal.error(t('popup.maintenance.restoreFailed', { error: err.message || err }));
                        if (typeof options.onCancel === 'function') {
                            options.onCancel(err);
                        }
                    }
                }
            }
        ]
    });

    // 綁定確認按鈕參照
    const buttons = document.querySelectorAll('.popup-button');
    if (buttons.length >= 2) {
        confirmBtnRef = buttons[buttons.length - 1];
    }
}
