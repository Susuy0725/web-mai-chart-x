import { simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 初始化手勢輪盤面板 (Quick Panel)
 * @param {Object} options
 * @param {HTMLElement} options.quickPanel
 * @param {Object} options.settings
 * @param {Function} options.isInitComplete - 回傳 boolean
 * @param {Function} options.onRotateSelection - (dir) => void
 * @param {Function} options.onFlipVertical - () => void
 * @param {Function} options.onFlipHorizontal - () => void
 * @param {HTMLElement} options.redoButton
 * @param {HTMLElement} options.undoButton
 * @param {HTMLElement} options.getCursorNoteIndex
 */
export function initQuickPanel({
    quickPanel,
    settings,
    isInitComplete,
    onRotateSelection,
    onFlipVertical,
    onFlipHorizontal,
    redoButton,
    undoButton,
    getCursorNoteIndex
}) {
    if (!quickPanel) return;

    let isCtrlShiftPressed = false;
    let directionOfPointer = 'middle'; // middle, left, right, up, down, up-left, up-right, down-left, down-right
    let positionOfQuickPanel = { x: 0, y: 0 };
    let positionOfPointer = {
        x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 0,
        y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 0,
        moved: false
    };
    let dirBuffer = '';

    const quickPanelLabel = document.getElementById('quick-panel-label') || (() => {
        const el = document.createElement('div');
        el.id = 'quick-panel-label';
        el.className = 'quick-panel-label';
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    })();

    // 取得方向對應的多語系標籤
    function getDirectionLabel(dir) {
        if (!dir || dir === 'middle') {
            return t("quickPanel.middle") || "取消";
        }
        const labelKey = `quickPanel.${dir}`;
        const translated = t(labelKey);
        if (translated && translated !== labelKey) return translated;

        const fallbacks = {
            'up': '上下反轉',
            'down': '左右反轉',
            'left': '逆時針旋轉',
            'right': '順時針旋轉',
            'up-left': '180度旋轉',
            'up-right': '重作',
            'down-left': '跳轉至游標音符',
            'down-right': '復原'
        };
        return fallbacks[dir] || dir;
    }

    function updateLabel(dir) {
        if (!quickPanelLabel) return;
        quickPanelLabel.textContent = getDirectionLabel(dir);
        quickPanelLabel.setAttribute('data-dir', dir || 'middle');
    }

    // 關閉並重置面板狀態
    function hideQuickPanel() {
        isCtrlShiftPressed = false;
        if (quickPanel) {
            quickPanel.style.display = 'none';
            quickPanel.removeAttribute('data-active-dir');
        }
        if (quickPanelLabel) {
            quickPanelLabel.style.display = 'none';
        }
        dirBuffer = '';
        directionOfPointer = 'middle';
    }

    // 執行選取方向對應的操作
    function executeAction(dir) {
        switch (dir) {
            case 'right':
                if (typeof onRotateSelection === 'function') onRotateSelection(1);
                break;
            case 'left':
                if (typeof onRotateSelection === 'function') onRotateSelection(-1);
                break;
            case 'up':
                if (typeof onFlipVertical === 'function') onFlipVertical();
                break;
            case 'down':
                if (typeof onFlipHorizontal === 'function') onFlipHorizontal();
                break;
            case 'up-left':
                if (typeof onRotateSelection === 'function') onRotateSelection(4);
                break;
            case 'up-right':
                if (redoButton && typeof redoButton.click === 'function') redoButton.click();
                break;
            case 'down-left':
                if (getCursorNoteIndex && typeof getCursorNoteIndex.click === 'function') getCursorNoteIndex.click();
                break;
            case 'down-right':
                if (undoButton && typeof undoButton.click === 'function') undoButton.click();
                break;
            case 'middle':
            default:
                // 中心死區，取消不執行
                break;
        }
    }

    // 1. 滑鼠 / 指標移動事件：負責更新位置與即時計算方向
    function updatePointerPosition(event) {
        positionOfPointer.moved = true;
        positionOfPointer.x = event.clientX;
        positionOfPointer.y = event.clientY;

        // 當 Ctrl+Shift 被按住且面板存在時，計算相對方向
        if (isCtrlShiftPressed && quickPanel) {
            const dx = positionOfPointer.x - positionOfQuickPanel.x;
            const dy = positionOfPointer.y - positionOfQuickPanel.y;
            const distanceSq = dx * dx + dy * dy;

            let currentDirection = "";

            if (distanceSq < 400) {
                // 半徑 20px 內為中心死區（適配 38px 中心圓）
                currentDirection = "middle";
            } else {
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle > -22.5 && angle <= 22.5) {
                    currentDirection = "right";
                } else if (angle > 22.5 && angle <= 67.5) {
                    currentDirection = "down-right";
                } else if (angle > 67.5 && angle <= 112.5) {
                    currentDirection = "down";
                } else if (angle > 112.5 && angle <= 157.5) {
                    currentDirection = "down-left";
                } else if (angle > 157.5 || angle <= -157.5) {
                    currentDirection = "left";
                } else if (angle > -157.5 && angle <= -112.5) {
                    currentDirection = "up-left";
                } else if (angle > -112.5 && angle <= -67.5) {
                    currentDirection = "up";
                } else if (angle > -67.5 && angle <= -22.5) {
                    currentDirection = "up-right";
                }
            }

            // 方向改變時更新屬性與下方標籤
            if (dirBuffer !== currentDirection) {
                dirBuffer = currentDirection;
                directionOfPointer = currentDirection;
                quickPanel.setAttribute('data-active-dir', directionOfPointer);
                updateLabel(directionOfPointer);
            }
        }
    }

    document.addEventListener('mousemove', updatePointerPosition, { passive: true });
    document.addEventListener('pointermove', updatePointerPosition, { passive: true });

    // 2. 鍵盤按下事件（在 capture 階段確保優先攔截）
    function handleKeyDown(e) {
        const ready = typeof isInitComplete === 'function' ? isInitComplete() : isInitComplete;
        if (!ready || !quickPanel) return;

        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        // 當按下 Ctrl/Cmd + Shift 時
        if (isCtrlOrCmd && isShift) {
            // 若設定中已停用快速面板，提示使用者
            if (settings && settings.enableQuickPanel === false) {
                if (!isCtrlShiftPressed) {
                    simpleToast({
                        content: t("toast.quickPanelDisabled"),
                        type: "info",
                    });
                }
                return;
            }

            if (!isCtrlShiftPressed) {
                if (!positionOfPointer.moved && positionOfPointer.x === 0 && positionOfPointer.y === 0) {
                    simpleToast({
                        content: t("toast.moveMouseToOpen"),
                        type: "info",
                    });
                    return;
                }

                isCtrlShiftPressed = true;
                e.preventDefault();

                // 鎖定當前滑鼠位置為 QuickPanel 的中心點
                positionOfQuickPanel.x = positionOfPointer.x;
                positionOfQuickPanel.y = positionOfPointer.y;

                // 顯示並定位面板
                quickPanel.style.left = positionOfPointer.x + 'px';
                quickPanel.style.top = positionOfPointer.y + 'px';
                quickPanel.style.display = 'block';

                // 顯示並定位底部的功能標籤
                if (quickPanelLabel) {
                    quickPanelLabel.style.left = positionOfPointer.x + 'px';
                    quickPanelLabel.style.top = (positionOfPointer.y + 82) + 'px';
                    quickPanelLabel.style.display = 'flex';
                    updateLabel('middle');
                }

                // 初始化狀態為 middle
                dirBuffer = 'middle';
                directionOfPointer = 'middle';
                quickPanel.setAttribute('data-active-dir', 'middle');
            }
        } else if (isCtrlShiftPressed) {
            // 若在按住過程中按了 Escape，則取消並關閉
            if (e.key === 'Escape') {
                e.preventDefault();
                hideQuickPanel();
            }
        }
    }

    // 3. 鍵盤放開事件：放開修飾鍵時確認執行
    function handleKeyUp(e) {
        if (!isCtrlShiftPressed) return;

        const isModifier =
            e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta' ||
            e.code === 'ControlLeft' || e.code === 'ControlRight' ||
            e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
            e.code === 'MetaLeft' || e.code === 'MetaRight';

        const modifierReleased = isModifier || !(e.ctrlKey || e.metaKey) || !e.shiftKey;

        if (modifierReleased) {
            const actionDir = directionOfPointer;
            hideQuickPanel();
            executeAction(actionDir);
        }
    }

    // 4. 視窗失焦防護（例如 Alt+Tab 切換視窗）
    function handleBlur() {
        if (isCtrlShiftPressed) {
            hideQuickPanel();
        }
    }

    // 使用 capture: true 優先於編輯器或其他元素攔截
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
}
