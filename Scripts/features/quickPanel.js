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
    let directionOfPointer = '0'; // middle, left, right, up, down
    let positionOfQuickPanel = { x: 0, y: 0 };
    let positionOfPointer = { x: 0, y: 0, moved: false };
    let dirBuffer = '';

    // 1. 滑鼠移動事件：同時負責「更新位置」與「計算方向」
    document.addEventListener('mousemove', function (event) {
        positionOfPointer.moved = true;
        positionOfPointer.x = event.clientX;
        positionOfPointer.y = event.clientY;

        // 只有當 Ctrl+Shift 被按住時，才計算相對方向
        if (isCtrlShiftPressed && quickPanel) {
            const dx = positionOfPointer.x - positionOfQuickPanel.x;
            const dy = positionOfPointer.y - positionOfQuickPanel.y;
            const distanceSq = dx * dx + dy * dy;

            let currentDirection = "";

            if (distanceSq < 900) {
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

            // 當方向改變時才更新，避免效能浪費
            if (dirBuffer !== currentDirection) {
                dirBuffer = currentDirection;
                directionOfPointer = currentDirection;
                quickPanel.setAttribute('data-active-dir', directionOfPointer);
            }
        }
    });

    // 2. 鍵盤按下事件：只負責啟用狀態、鎖定中心點
    window.addEventListener('keydown', (e) => {
        const ready = typeof isInitComplete === 'function' ? isInitComplete() : isInitComplete;
        if (!ready || !settings.enableQuickPanel || !quickPanel) return;

        // 檢查是否同時按下 Ctrl 和 Shift，且目前還沒被標記為按下
        if (e.ctrlKey && e.shiftKey && !isCtrlShiftPressed) {
            if (!positionOfPointer.moved) {
                simpleToast({
                    content: t("toast.moveMouseToOpen"),
                    type: "info",
                });
                return;
            }

            isCtrlShiftPressed = true;

            // 鎖定當前滑鼠位置為 QuickPanel 的中心點
            positionOfQuickPanel.x = positionOfPointer.x;
            positionOfQuickPanel.y = positionOfPointer.y;

            // 顯示並定位面板
            quickPanel.style.left = positionOfPointer.x + 'px';
            quickPanel.style.top = positionOfPointer.y + 'px';
            quickPanel.style.display = 'grid';

            // 初始化狀態為 middle
            dirBuffer = 'middle';
            directionOfPointer = 'middle';
            quickPanel.setAttribute('data-active-dir', 'middle');
        } else if (isCtrlShiftPressed && e.key !== 'Control' && e.key !== 'Shift') {
            isCtrlShiftPressed = false;
            quickPanel.style.display = 'none';
            quickPanel.removeAttribute('data-active-dir');
            directionOfPointer = 'middle';
            dirBuffer = 'middle';
        }
    });

    // 3. 鍵盤放開事件：精準解除狀態
    window.addEventListener('keyup', (e) => {
        if ((e.key === 'Control' || e.key === 'Shift') && isCtrlShiftPressed) {
            isCtrlShiftPressed = false;
            if (directionOfPointer === 'right') {
                if (onRotateSelection) onRotateSelection(1);
            } else if (directionOfPointer === 'left') {
                if (onRotateSelection) onRotateSelection(-1);
            } else if (directionOfPointer === 'up') {
                if (onFlipVertical) onFlipVertical();
            } else if (directionOfPointer === 'down') {
                if (onFlipHorizontal) onFlipHorizontal();
            } else if (directionOfPointer === 'up-left') {
                if (onRotateSelection) onRotateSelection(4);
            } else if (directionOfPointer === 'up-right') {
                if (redoButton) redoButton.click();
            } else if (directionOfPointer === 'down-left') {
                if (getCursorNoteIndex) getCursorNoteIndex.click();
            } else if (directionOfPointer === 'down-right') {
                if (undoButton) undoButton.click();
            }
            dirBuffer = ''; // 清空緩衝

            if (quickPanel) {
                quickPanel.style.display = 'none';
                quickPanel.removeAttribute('data-active-dir');
            }
        }
    });
}
