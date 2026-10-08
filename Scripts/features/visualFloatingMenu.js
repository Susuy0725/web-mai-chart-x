/**
 * 視覺化編輯器 - 單個音符無邊框浮動選單 (Floating Note Menu)
 * 當選中單個 Hold 或 Slide 音符時，於音符頭部左側或右側彈出選項選單
 */

import { t } from '../i18n.js';

let menuEl = null;
let currentNote = null;
let currentCallbacks = null;

/**
 * 確保選單專屬樣式注入（保證 100% 生效，不受快取干擾）
 */
function ensureFloatingMenuStyles() {
    const styleId = 'wmc-floating-menu-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .wmc-floating-note-menu {
            position: fixed !important;
            z-index: 99999 !important;
            min-width: 130px !important;
            width: max-content !important;
            background: rgba(26, 26, 30, 0.95) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: none !important;
            border-radius: 8px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.15) !important;
            padding: 6px !important;
            box-sizing: border-box !important;
            display: none;
            flex-direction: column !important;
            gap: 2px !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            pointer-events: auto !important;
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif !important;
        }

        .wmc-floating-note-menu.active {
            display: flex !important;
            animation: wmcFloatingMenuFadeIn 0.12s cubic-bezier(0, 0, 0.2, 1) !important;
        }

        @keyframes wmcFloatingMenuFadeIn {
            from {
                opacity: 0;
                transform: scale(0.92);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        .wmc-fnm-item {
            border: none !important;
            background: transparent !important;
            color: #e2e8f0 !important;
            padding: 8px 12px !important;
            border-radius: 6px !important;
            font-size: 13px !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            white-space: nowrap !important;
            text-align: left !important;
            transition: background 0.12s ease, color 0.12s ease !important;
            outline: none !important;
            box-sizing: border-box !important;
            width: 100% !important;
        }

        .wmc-fnm-item:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #ffffff !important;
        }

        .wmc-fnm-item:active {
            background: rgba(255, 255, 255, 0.16) !important;
        }

        .wmc-fnm-item .material-symbols-outlined {
            font-size: 18px !important;
            color: var(--popup-accent, #00e5ff) !important;
            flex-shrink: 0 !important;
        }

        .wmc-box-floating-menu {
            position: fixed !important;
            z-index: 99998 !important;
            display: none;
            align-items: center;
            gap: 6px;
            background: rgba(26, 26, 32, 0.92) !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            border: 1px solid rgba(0, 229, 255, 0.4) !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 229, 255, 0.2) !important;
            padding: 4px 8px !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif !important;
        }

        .wmc-box-floating-menu.active {
            display: flex !important;
            animation: wmcFloatingMenuFadeIn 0.12s cubic-bezier(0, 0, 0.2, 1) !important;
        }

        .wmc-box-fnm-btn {
            background: #ef4444 !important;
            color: #ffffff !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 6px 12px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3) !important;
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            transition: background 0.15s ease, transform 0.1s ease !important;
        }

        .wmc-box-fnm-btn:hover {
            background: #dc2626 !important;
        }

        .wmc-box-fnm-btn:active {
            transform: scale(0.96) !important;
        }
    `;
    document.head.appendChild(style);
}

function ensureMenuElement() {
    ensureFloatingMenuStyles();

    if (menuEl) return menuEl;

    menuEl = document.createElement('div');
    menuEl.className = 'wmc-floating-note-menu';
    document.body.appendChild(menuEl);

    // 點擊彈窗內部時阻止事件冒泡，避免觸發全域關閉
    menuEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });
    menuEl.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 監聽全域點擊以關閉選單
    document.addEventListener('pointerdown', (e) => {
        if (!menuEl || !menuEl.classList.contains('active')) return;
        if (!menuEl.contains(e.target)) {
            hideFloatingMenu();
        }
    }, true);

    return menuEl;
}

/**
 * 顯示浮動音符選項選單
 * @param {Object} note 選中的音符物件
 * @param {Object} screenPos 螢幕物理座標 { clientX, clientY }
 * @param {Object} props 音符當前屬性 { isSlide, isHold }
 * @param {Object} callbacks 回呼函式 { onChangeDuration, onChangePattern }
 */
export function showFloatingMenu(note, screenPos, props, callbacks) {
    if (!note || !screenPos || !props || (!props.isHold && !props.isSlide && !props.isTouch)) {
        hideFloatingMenu();
        return;
    }

    const menu = ensureMenuElement();
    currentNote = note;
    currentCallbacks = callbacks;

    let html = '';

    if (props.isHold && !props.isSlide) {
        html += `
            <button type="button" class="wmc-fnm-item" data-action="change-duration">
                <span>${t('visualMenu.editDuration')}</span>
            </button>
        `;
    }

    if (props.isSlide) {
        html += `
            <button type="button" class="wmc-fnm-item" data-action="change-pattern">
                <span>${t('visualMenu.editSlideTrack')}</span>
            </button>
        `;
    }

    if (props.isTouch) {
        html += `
            <button type="button" class="wmc-fnm-item" data-action="edit-touch-group">
                <span>${t('visualMenu.editTouchGroup')}</span>
            </button>
        `;
    }

    menu.innerHTML = html;

    // 綁定選項按鈕點擊事件
    const durBtn = menu.querySelector('[data-action="change-duration"]');
    if (durBtn) {
        durBtn.addEventListener('click', () => {
            if (currentCallbacks?.onChangeDuration) {
                currentCallbacks.onChangeDuration();
            }
        });
    }

    const patternBtn = menu.querySelector('[data-action="change-pattern"]');
    if (patternBtn) {
        patternBtn.addEventListener('click', () => {
            if (currentCallbacks?.onChangePattern) {
                currentCallbacks.onChangePattern();
            }
        });
    }

    const touchGroupBtn = menu.querySelector('[data-action="edit-touch-group"]');
    if (touchGroupBtn) {
        touchGroupBtn.addEventListener('click', () => {
            if (currentCallbacks?.onEditTouchGroup) {
                currentCallbacks.onEditTouchGroup();
            }
        });
    }

    // 暫時呈現以獲取精確尺寸
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.add('active');

    const menuWidth = menu.offsetWidth || 130;
    const menuHeight = menu.offsetHeight || 80;

    // 空間判斷：優先置於音符右側（偏移 16px），右側放不下則放左側
    const offset = 16;
    const spaceRight = window.innerWidth - (screenPos.clientX + offset);
    let left;
    if (spaceRight >= menuWidth + 8) {
        left = screenPos.clientX + offset;
    } else {
        left = Math.max(8, screenPos.clientX - offset - menuWidth);
    }

    // 垂直方向居中對齊音符頭部，並防止超出視窗邊緣
    const top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, screenPos.clientY - menuHeight / 2));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = 'visible';
}

/**
 * 隱藏浮動音符選項選單
 */
export function hideFloatingMenu() {
    if (menuEl && menuEl.classList.contains('active')) {
        menuEl.classList.remove('active');
        menuEl.style.visibility = 'hidden';
        currentNote = null;
        currentCallbacks = null;
    }
}

let boxMenuEl = null;

function ensureBoxMenuElement() {
    ensureFloatingMenuStyles();
    if (boxMenuEl) return boxMenuEl;

    boxMenuEl = document.createElement('div');
    boxMenuEl.className = 'wmc-box-floating-menu';
    document.body.appendChild(boxMenuEl);

    boxMenuEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    boxMenuEl.addEventListener('click', (e) => e.stopPropagation());

    return boxMenuEl;
}

/**
 * 於選取大框內顯示操作按鈕（例如刪除）
 * @param {Object} boxRect 螢幕座標 { left, right, top, bottom, width, height }
 * @param {number} count 選取的音符數量
 * @param {Object} callbacks 回呼 { onDelete }
 */
export function showBoxFloatingMenu(boxRect, count, callbacks) {
    if (!boxRect) {
        hideBoxFloatingMenu();
        return;
    }

    const menu = ensureBoxMenuElement();
    menu.innerHTML = `
        <button type="button" class="wmc-box-fnm-btn" data-action="delete">
            <span>${t('visualMenu.deleteSelected')} ${count}</span>
        </button>
    `;

    const delBtn = menu.querySelector('[data-action="delete"]');
    if (delBtn) {
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (callbacks?.onDelete) {
                callbacks.onDelete();
            }
            hideBoxFloatingMenu();
        });
    }

    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.classList.add('active');

    const menuW = menu.offsetWidth || 110;
    const menuH = menu.offsetHeight || 38;

    const pad = 10;
    let posX = boxRect.right - menuW - pad;
    let posY = boxRect.top + pad;

    if (posX < boxRect.left + pad) posX = boxRect.left + pad;
    if (posX < 8) posX = 8;
    if (posX + menuW > window.innerWidth - 8) posX = window.innerWidth - menuW - 8;
    if (posY < 8) posY = 8;

    menu.style.left = `${Math.round(posX)}px`;
    menu.style.top = `${Math.round(posY)}px`;
    menu.style.visibility = 'visible';
}

/**
 * 隱藏選取大框操作列
 */
export function hideBoxFloatingMenu() {
    if (boxMenuEl && boxMenuEl.classList.contains('active')) {
        boxMenuEl.classList.remove('active');
        boxMenuEl.style.visibility = 'hidden';
    }
}
