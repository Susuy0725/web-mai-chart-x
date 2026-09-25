/**
 * Web mai Chart X - Slide JudgeQueue Debugger
 * 提供 Slide 判定隊列的實時視覺化疊層與浮動除錯面板
 */

import { touchRefPos, noteRefPos, innerCirleBase } from '../Scripts/helper.js';
import { getSlideJudgeQueue } from './slidetables.js';

let isEnabled = false;
let autoTrack = true;
let selectedNote = null;
let panelEl = null;
let isMinimized = false;
let onToggleCallback = null;

// 面板拖曳狀態
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

/**
 * 取得感應區代號的中心座標 (以中心 C 為 0,0)
 */
export function getSensorCenterPos(sensorId) {
    if (!sensorId) return { x: 0, y: 0 };
    if (sensorId === 'C' || sensorId === 'C1' || sensorId === 'C2') {
        return { x: 0, y: 0 };
    }
    const group = sensorId[0].toUpperCase();
    const num = parseInt(sensorId.slice(1), 10);
    if (!isNaN(num) && num >= 1 && num <= 8) {
        if (touchRefPos[group] && touchRefPos[group][num - 1]) {
            return touchRefPos[group][num - 1];
        }
        if (group === 'A' && noteRefPos[num - 1]) {
            return noteRefPos[num - 1];
        }
    }
    return { x: 0, y: 0 };
}

/**
 * 尋找當前時間點前後相關的 Slide 音符
 */
export function findActiveSlides(notes, globalTime) {
    if (!notes || notes.length === 0) return [];
    const active = [];
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.type !== 'slide') continue;

        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;
        const startT = note.time;
        const endT = note.time + slideDelay + slideDuration + 0.6; // 含超時窗口

        // 當前正在滑動或即將到來的 slide (提前 0.8s 預備顯示)
        if (globalTime >= (startT - 0.8) && globalTime <= endT) {
            active.push(note);
        }
    }

    // 如果當前時間窗口內沒有活躍 slide，找離 globalTime 最近的一個 slide 作為預覽
    if (active.length === 0) {
        let nearest = null;
        let minDiff = Infinity;
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (note.type !== 'slide') continue;
            const diff = Math.abs(note.time - globalTime);
            if (diff < minDiff) {
                minDiff = diff;
                nearest = note;
            }
        }
        if (nearest) active.push(nearest);
    }

    return active;
}

/**
 * 取得或建構 Slide 的判定隊列狀態資訊
 */
export function getSlideQueueInfo(note, renderer) {
    if (!note) return null;
    let fullQueue = note._fullJudgeQueue;
    let meta = note._debugMeta;
    let remainingQueue = note.judgeQueue;

    // 若尚未在 play 迴圈中初始化，即時透過 getSlideJudgeQueue 生成預覽隊列
    if (!fullQueue) {
        const baseQueue = getSlideJudgeQueue(note, renderer);
        if (baseQueue.isWifi && baseQueue.branches) {
            fullQueue = baseQueue.branches.center.map(a => a.clone());
        } else {
            fullQueue = baseQueue.map(a => a.clone());
        }
        meta = baseQueue._debugMeta || note._debugMeta;
        if (!remainingQueue) {
            remainingQueue = fullQueue;
        }
    }

    const totalCount = note._totalAreasCount || (fullQueue ? fullQueue.length : 0);
    const queues = note.judgeQueues || (remainingQueue ? [remainingQueue] : []);
    const remainingCount = queues.length > 0 ? Math.max(...queues.map(q => q.length)) : (note.slideFinish ? 0 : totalCount);
    const finishedCount = note.slideFinish ? totalCount : Math.max(0, totalCount - remainingCount);
    const currentActiveIndex = note.slideFinish ? -1 : finishedCount;

    return {
        note,
        meta,
        fullQueue,
        remainingQueue,
        totalCount,
        finishedCount,
        currentActiveIndex,
        isFinished: !!note.slideFinish,
        unlocked: !!note.unlocked,
        progress: note.slideProgress || (totalCount > 0 ? finishedCount / totalCount : 0)
    };
}

/**
 * 初始化除錯面板 DOM
 */
function ensurePanelDOM() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.id = 'slideDebugPanel';
    panelEl.className = 'slide-debug-panel';
    panelEl.style.display = 'none';

    panelEl.innerHTML = `
        <div class="slide-debug-header" id="slideDebugHeader">
            <div class="title">
                <span class="material-symbols-outlined icon" translate="no">bug_report</span>
                <span>Slide JudgeQueue Debug</span>
            </div>
            <div class="actions">
                <button class="debug-btn-icon" id="slideDebugMinimizeBtn" title="最小化/展開">─</button>
                <button class="debug-btn-icon" id="slideDebugCloseBtn" title="關閉 (Ctrl+D)">✕</button>
            </div>
        </div>
        <div class="slide-debug-body" id="slideDebugBody">
            <div class="slide-debug-selector-row">
                <label class="auto-track-label">
                    <input type="checkbox" id="slideDebugAutoTrack" checked> 自動跟隨
                </label>
                <div class="slide-tabs" id="slideDebugTabs"></div>
            </div>
            <div class="slide-debug-summary" id="slideDebugSummary"></div>
            <div class="slide-debug-table-container">
                <table class="slide-debug-table">
                    <thead>
                        <tr>
                            <th style="width: 32px;">#</th>
                            <th>Sensors</th>
                            <th style="width: 48px;">Type</th>
                            <th style="width: 54px;">Flags</th>
                            <th style="width: 64px;">Status</th>
                        </tr>
                    </thead>
                    <tbody id="slideDebugTableBody"></tbody>
                </table>
            </div>
            <div class="slide-debug-footer" id="slideDebugFooter"></div>
        </div>
    `;

    document.body.appendChild(panelEl);

    // 關閉按鈕
    const closeBtn = panelEl.querySelector('#slideDebugCloseBtn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSlideDebug(false);
    });

    // 最小化按鈕
    const minBtn = panelEl.querySelector('#slideDebugMinimizeBtn');
    const bodyEl = panelEl.querySelector('#slideDebugBody');
    minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        bodyEl.style.display = isMinimized ? 'none' : 'flex';
        minBtn.textContent = isMinimized ? '□' : '─';
    });

    // 自動跟隨切換
    const autoTrackCheck = panelEl.querySelector('#slideDebugAutoTrack');
    autoTrackCheck.addEventListener('change', (e) => {
        autoTrack = e.target.checked;
        if (autoTrack) {
            selectedNote = null;
        }
        if (lastPanelUpdateParams) {
            updateSlideDebugPanel({ ...lastPanelUpdateParams, force: true });
        }
    });

    // 標籤切換事件委託 (使用 pointerdown 瞬間切換，不依賴每幀重構的 click 事件)
    const tabsContainer = panelEl.querySelector('#slideDebugTabs');
    tabsContainer.addEventListener('pointerdown', (e) => {
        const tabBtn = e.target.closest('.slide-tab');
        if (!tabBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(tabBtn.dataset.index, 10);
        if (!isNaN(idx) && lastActiveSlides[idx]) {
            selectedNote = lastActiveSlides[idx];
            autoTrack = false;
            if (autoTrackCheck) autoTrackCheck.checked = false;
            if (lastPanelUpdateParams) {
                updateSlideDebugPanel({ ...lastPanelUpdateParams, force: true });
            }
        }
    });

    // 拖曳處理
    const headerEl = panelEl.querySelector('#slideDebugHeader');
    headerEl.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = panelEl.getBoundingClientRect();
        panelStartX = rect.left;
        panelStartY = rect.top;
        panelEl.style.right = 'auto'; // 取消 right 固定
        panelEl.style.bottom = 'auto';
        panelEl.style.left = `${panelStartX}px`;
        panelEl.style.top = `${panelStartY}px`;
        headerEl.setPointerCapture(e.pointerId);
    });

    headerEl.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panelEl.style.left = `${Math.max(10, Math.min(window.innerWidth - 320, panelStartX + dx))}px`;
        panelEl.style.top = `${Math.max(10, Math.min(window.innerHeight - 80, panelStartY + dy))}px`;
    });

    headerEl.addEventListener('pointerup', (e) => {
        if (isDragging) {
            isDragging = false;
            try { headerEl.releasePointerCapture(e.pointerId); } catch (_) { }
        }
    });

    headerEl.addEventListener('pointercancel', (e) => {
        isDragging = false;
    });

    return panelEl;
}

/**
 * 切換除錯視圖開關
 */
export function toggleSlideDebug(forceState = null) {
    if (forceState !== null) {
        isEnabled = !!forceState;
    } else {
        isEnabled = !isEnabled;
    }

    ensurePanelDOM();
    if (panelEl) {
        panelEl.style.display = isEnabled ? 'flex' : 'none';
    }

    // 更新控制按鈕外觀
    const debugBtn = document.querySelector('.controlButton[data-buttonaction="slideDebug"]');
    if (debugBtn) {
        if (isEnabled) {
            debugBtn.classList.add('active');
        } else {
            debugBtn.classList.remove('active');
        }
    }

    if (onToggleCallback) {
        onToggleCallback(isEnabled);
    }

    return isEnabled;
}

export function isSlideDebugEnabled() {
    return isEnabled;
}

export function setSlideDebugToggleCallback(cb) {
    onToggleCallback = cb;
}

/**
 * 在 Canvas 畫面上繪製目前 Slide 判定隊列的空間路徑與感應器標記
 */
export function renderSlideDebugOverlay(ctx, { globalTime, notes, renderer, activeSensors }) {
    if (!isEnabled || !notes || notes.length === 0) return;

    const activeSlides = findActiveSlides(notes, globalTime);
    if (activeSlides.length === 0) return;

    // 選取優先呈現的 Slide (若是手動選取則優先，否則依 autoTrack 取第一項)
    let currentSlide = null;
    if (selectedNote && activeSlides.includes(selectedNote)) {
        currentSlide = selectedNote;
    } else {
        currentSlide = activeSlides[0];
        if (autoTrack) selectedNote = currentSlide;
    }

    if (!currentSlide) return;

    const queueInfo = getSlideQueueInfo(currentSlide, renderer);
    if (!queueInfo || !queueInfo.fullQueue || queueInfo.fullQueue.length === 0) return;

    const { fullQueue, finishedCount, currentActiveIndex } = queueInfo;

    ctx.save();

    // 1. 計算各步驟代表中心點並繪製步驟連接線與流向
    const stepCenters = [];
    for (let i = 0; i < fullQueue.length; i++) {
        const area = fullQueue[i];
        const sensors = area.areas || [];
        let cx = 0, cy = 0, count = 0;
        for (let s = 0; s < sensors.length; s++) {
            const pt = getSensorCenterPos(sensors[s]);
            cx += pt.x;
            cy += pt.y;
            count++;
        }
        if (count > 0) {
            stepCenters.push({ x: cx / count, y: cy / count, index: i, area });
        }
    }

    // 繪製連接軌跡
    if (stepCenters.length > 1) {
        for (let i = 0; i < stepCenters.length - 1; i++) {
            const p1 = stepCenters[i];
            const p2 = stepCenters[i + 1];
            const isCompleted = (i < finishedCount);
            const isNextStep = (i === currentActiveIndex);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            if (isCompleted) {
                ctx.strokeStyle = '#00e676';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.shadowColor = '#00e676';
                ctx.shadowBlur = 4;
            } else if (isNextStep) {
                ctx.strokeStyle = '#ffea00';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 4]);
                ctx.shadowColor = '#ffea00';
                ctx.shadowBlur = 4;
            } else {
                ctx.strokeStyle = 'rgba(64, 196, 255, 0.45)';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([4, 4]);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    // 2. 繪製各感應區標記與狀態徽章
    const nowMs = performance.now();
    for (let i = 0; i < fullQueue.length; i++) {
        const area = fullQueue[i];
        const isCompleted = (i < finishedCount);
        const isActive = (i === currentActiveIndex);
        const sensors = area.areas || [];

        for (let s = 0; s < sensors.length; s++) {
            const sid = sensors[s];
            const pt = getSensorCenterPos(sid);
            const isSensorPressed = activeSensors && (
                activeSensors.has(sid) ||
                ((sid === 'C1' || sid === 'C2') && activeSensors.has('C'))
            );

            ctx.save();

            // 若目前正被感應器觸控，繪製外圍發光擴散圈
            if (isSensorPressed) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 64, 129, 0.35)';
                ctx.fill();
                ctx.strokeStyle = '#ff4081';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // 圓形徽章外圈
            ctx.beginPath();
            const radius = isActive ? 6 : 5;
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);

            if (isCompleted) {
                ctx.fillStyle = '#00c853';
                ctx.strokeStyle = '#b9f6ca';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00e676';
                ctx.shadowBlur = 6;
            } else if (isActive) {
                // 活躍中帶呼吸閃爍效果
                const pulse = 1 + 0.15 * Math.sin(nowMs * 0.008);
                ctx.fillStyle = '#ffb300';
                ctx.strokeStyle = '#fff9c4';
                ctx.lineWidth = 2.5 * pulse;
                ctx.shadowColor = '#ffd600';
                ctx.shadowBlur = 14;
            } else {
                ctx.fillStyle = 'rgba(26, 35, 126, 0.7)';
                ctx.strokeStyle = 'rgba(128, 216, 255, 0.65)';
                ctx.lineWidth = 1.5;
            }

            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // 文字：步驟序號 (1, 2, 3...)
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${isActive ? 7 : 6}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelText = isCompleted ? '✓' : (i + 1).toString();
            ctx.fillText(labelText, pt.x, pt.y);

            // 感應器代號文字 (如 A1, B2)
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = isActive ? '#ffea00' : (isCompleted ? '#a7ffeb' : '#e0e0e0');
            ctx.fillText(sid, pt.x, pt.y + radius + 8);
            ctx.restore();
        }
    }

    // 3. 繪製起點與終點專屬圖示標籤
    const headPt = noteRefPos[currentSlide.pos - 1] || getSensorCenterPos(`A${currentSlide.pos}`);
    const endPt = noteRefPos[currentSlide.slideEnd - 1] || getSensorCenterPos(`A${currentSlide.slideEnd}`);

    // HEAD 標記
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#ff4081';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#ff4081';
    ctx.shadowBlur = 6;
    ctx.fillText(`★ START (${currentSlide.pos})`, headPt.x, headPt.y - 12);

    // END 標記
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.fillText(`◎ END (${currentSlide.slideEnd})`, endPt.x, endPt.y - 12);
    ctx.restore();

    ctx.restore();
}

/**
 * 更新除錯面板內容 (DOM)
 */
let lastPanelUpdateTime = 0;
const PANEL_UPDATE_INTERVAL_MS = 60; // 60ms 刷新一次 DOM (約 16fps)，既即時又省效能
let lastPanelUpdateParams = null;
let lastActiveSlides = [];
let cachedActiveSlides = [];

export function updateSlideDebugPanel({ globalTime, notes, renderer, activeSensors, playing, force = false }) {
    if (!isEnabled) return;
    ensurePanelDOM();
    if (!panelEl || panelEl.style.display === 'none') return;
    if (isMinimized) return;

    lastPanelUpdateParams = { globalTime, notes, renderer, activeSensors, playing };

    const now = performance.now();
    if (!force && (now - lastPanelUpdateTime < PANEL_UPDATE_INTERVAL_MS)) {
        return;
    }
    lastPanelUpdateTime = now;

    const activeSlides = findActiveSlides(notes, globalTime);
    lastActiveSlides = activeSlides;

    // 自動跟隨或維持當前手動選取的 Slide
    if (autoTrack) {
        selectedNote = activeSlides[0] || null;
    } else {
        // 手動模式：若目前選取的 note 仍在活躍列表中則繼續維持，若已完全過期才切回第 1 個
        if (!selectedNote || !activeSlides.includes(selectedNote)) {
            selectedNote = activeSlides[0] || null;
        }
    }

    // A. 更新 Slide 標籤列 (若同時有多條 Slide，如雙劃軌)
    const tabsContainer = panelEl.querySelector('#slideDebugTabs');

    if (activeSlides.length > 0) {
        // 智慧比對：若活躍列表無變化，不銷毀重建 DOM 按鈕，僅更新 active 樣式，防止滑鼠點擊遺失
        const isSameList = cachedActiveSlides.length === activeSlides.length &&
            cachedActiveSlides.every((note, idx) => note === activeSlides[idx]);

        if (!isSameList) {
            cachedActiveSlides = [...activeSlides];
            tabsContainer.innerHTML = '';
            activeSlides.forEach((note, idx) => {
                const tab = document.createElement('button');
                const isSelected = (note === selectedNote);
                tab.className = `slide-tab ${isSelected ? 'active' : ''}`;
                tab.dataset.index = `${idx}`;
                const typeStr = note.slideType || '-';
                const midStr = note.slideMid ? `:${note.slideMid}` : '';
                tab.textContent = `#${idx + 1} ${note.pos}${typeStr}${midStr}${note.slideEnd} (${note.time.toFixed(2)}s)`;
                tabsContainer.appendChild(tab);
            });
        } else {
            // 列表未改變，僅更新 active 樣式
            const tabButtons = tabsContainer.querySelectorAll('.slide-tab');
            tabButtons.forEach((tab, idx) => {
                const note = activeSlides[idx];
                tab.classList.toggle('active', note === selectedNote);
            });
        }
    } else {
        if (cachedActiveSlides.length !== 0) {
            cachedActiveSlides = [];
            tabsContainer.innerHTML = '<span style="color:#777; font-size:11px;">(目前時間無活躍 Slide)</span>';
        }
    }

    if (!selectedNote) {
        panelEl.querySelector('#slideDebugSummary').innerHTML = '<div style="color:#888; padding:8px 0;">無選取的 Slide 資料</div>';
        panelEl.querySelector('#slideDebugTableBody').innerHTML = '';
        panelEl.querySelector('#slideDebugFooter').innerHTML = '';
        return;
    }

    // B. 取得隊列詳細資訊
    const info = getSlideQueueInfo(selectedNote, renderer);
    if (!info) return;

    const { note, meta, fullQueue, finishedCount, currentActiveIndex, isFinished } = info;
    const typeStr = note.slideType || '-';
    const midStr = note.slideMid ? ` (mid: ${note.slideMid})` : '';
    const progressPercent = Math.round((info.progress || 0) * 100);

    // C. 摘要資訊區
    const summaryContainer = panelEl.querySelector('#slideDebugSummary');
    const tableKeyDisplay = meta?.baseKey ? `<span class="meta-badge">${meta.baseKey}</span>` : '<span class="meta-badge fallback">Fallback (幾何採樣)</span>';
    const mirrorDisplay = meta?.needMirror ? '<span class="meta-badge mirror">Mirrored</span>' : '<span class="meta-badge">Normal</span>';

    summaryContainer.innerHTML = `
        <div class="summary-grid">
            <div class="summary-item">
                <span class="label">Pattern:</span>
                <span class="value highlight">${note.pos} ${typeStr} ${note.slideEnd}${midStr}</span>
            </div>
            <div class="summary-item">
                <span class="label">Table Key:</span>
                <span class="value">${tableKeyDisplay} ${mirrorDisplay}</span>
            </div>
            <div class="summary-item">
                <span class="label">Timing:</span>
                <span class="value">${note.time.toFixed(2)}s (delay: ${(note.slideDelay ?? 0).toFixed(2)}s, dur: ${(note.slideDuration ?? 0).toFixed(2)}s)</span>
            </div>
            <div class="summary-item">
                <span class="label">Status:</span>
                <span class="value">${isFinished ? '<span style="color:#00e676;">COMPLETED</span>' : (info.unlocked ? '<span style="color:#ffd600;">ACTIVE</span>' : '<span style="color:#aaa;">LOCKED</span>')} (${finishedCount}/${info.totalCount} 區 | ${progressPercent}%)</span>
            </div>
        </div>
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
        </div>
    `;

    // D. 步驟表格區
    const tableBody = panelEl.querySelector('#slideDebugTableBody');
    let rowsHtml = '';

    for (let i = 0; i < fullQueue.length; i++) {
        const area = fullQueue[i];
        const isCompleted = (i < finishedCount);
        const isActive = (i === currentActiveIndex);
        const isLast = area.isLast;
        const isSkippable = area.isSkippable;

        let statusBadge = '';
        let rowClass = '';

        if (isCompleted) {
            statusBadge = '<span class="status-badge done">DONE ✓</span>';
            rowClass = 'row-done';
        } else if (isActive) {
            statusBadge = '<span class="status-badge active">ACTIVE ⏳</span>';
            rowClass = 'row-active';
        } else {
            statusBadge = '<span class="status-badge pending">PENDING</span>';
            rowClass = 'row-pending';
        }

        // 感應區標籤群
        const sensorBadges = (area.areas || []).map(s => {
            const ring = s[0].toUpperCase();
            return `<span class="sensor-chip ring-${ring}">${s}</span>`;
        }).join(' ');

        // 判定旗標
        const flags = `
            <span class="flag-chip ${area._wasOn ? 'on' : ''}" title="是否曾被觸碰 (on)">ON</span>
            <span class="flag-chip ${area._wasOff ? 'off' : ''}" title="是否已劃離離開 (off)">OFF</span>
        `;

        const typeLabel = isLast ? '<span style="color:#ff4081; font-weight:bold;">LAST</span>' : (isSkippable ? 'Norm' : 'Strict');

        rowsHtml += `
            <tr class="${rowClass}">
                <td style="font-weight:bold; text-align:center;">${i + 1}</td>
                <td>${sensorBadges}</td>
                <td style="text-align:center;">${typeLabel}</td>
                <td style="text-align:center;">${flags}</td>
                <td style="text-align:center;">${statusBadge}</td>
            </tr>
        `;
    }

    tableBody.innerHTML = rowsHtml;

    // E. 頁尾：即時玩家輸入感應器 (Active Sensors)
    const footerEl = panelEl.querySelector('#slideDebugFooter');
    const sensorsList = activeSensors ? Array.from(activeSensors) : [];
    const activeSensorsChips = sensorsList.length > 0
        ? sensorsList.map(s => `<span class="sensor-chip active">${s}</span>`).join(' ')
        : '<span style="color:#777;">(無按壓輸入)</span>';

    footerEl.innerHTML = `
        <div class="active-sensors-row">
            <span class="label">Live Sensors:</span>
            <div class="chips">${activeSensorsChips}</div>
        </div>
    `;
}
