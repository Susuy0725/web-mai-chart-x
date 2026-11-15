/**
 * 面板分割與方向無關的純版面計算工具
 * 支援左右 (horizontal) 與預留上下 (vertical) 分割模式及前後對調計算
 */

export const LAYOUT_DIRECTIONS = {
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical',
};

/**
 * 正規化分割方向，目前預設為左右分割
 * @param {string} direction
 * @returns {'horizontal'|'vertical'}
 */
export function normalizeLayoutDirection(direction) {
    return direction === LAYOUT_DIRECTIONS.VERTICAL
        ? LAYOUT_DIRECTIONS.VERTICAL
        : LAYOUT_DIRECTIONS.HORIZONTAL;
}

/**
 * 依據畫布佔比與對調狀態，計算分割線在視口中的正規化位置 (0 ~ 1)
 * splitRatio 永遠代表畫布所佔比例，對調時分割線位於 1 - splitRatio
 * @param {Object} params
 * @param {number} params.splitRatio
 * @param {boolean} [params.swapped=false]
 * @returns {number}
 */
export function getSplitterPositionRatio({ splitRatio, swapped = false }) {
    const ratio = Number.isFinite(splitRatio) ? Math.max(0, Math.min(1, splitRatio)) : 0.5;
    return swapped ? 1 - ratio : ratio;
}

/**
 * 依據拖曳位移計算更新後的畫布佔比
 * @param {Object} params
 * @param {number} params.dragStartRatio - 拖曳開始時的畫布佔比
 * @param {number} params.deltaPx - 沿分割軸向的位移像素 (水平為 deltaX，垂直為 deltaY)
 * @param {number} params.containerSizePx - 分割軸向的容器總尺寸 (像素)
 * @param {boolean} [params.swapped=false] - 面板是否對調
 * @param {number} [params.snapThreshold=0.15] - 低於此比例時吸附收合畫布
 * @param {number} [params.maxRatio=0.85] - 畫布最大佔比
 * @returns {number}
 */
export function computeDraggedSplitRatio({
    dragStartRatio,
    deltaPx,
    containerSizePx,
    swapped = false,
    snapThreshold = 0.15,
    maxRatio = 0.85,
}) {
    if (!containerSizePx || containerSizePx <= 0) return dragStartRatio;
    const sign = swapped ? -1 : 1;
    const rawRatio = dragStartRatio + sign * (deltaPx / containerSizePx);
    if (rawRatio < snapThreshold) return 0;
    return Math.min(maxRatio, rawRatio);
}

/**
 * 計算編輯器展開/收合時的動畫起訖 transform
 * @param {Object} params
 * @param {string} [params.direction='horizontal']
 * @param {boolean} [params.swapped=false]
 * @param {boolean} params.visible
 * @param {number} params.editorSizePx - 編輯器沿分割軸向的尺寸 (像素)
 * @returns {{ editorStart: string, editorEnd: string, splitterStart: string, splitterEnd: string }}
 */
export function computeEditorSlideAnimation({
    direction = LAYOUT_DIRECTIONS.HORIZONTAL,
    swapped = false,
    visible,
    editorSizePx,
}) {
    const isVertical = normalizeLayoutDirection(direction) === LAYOUT_DIRECTIONS.VERTICAL;
    const axis = isVertical ? 'Y' : 'X';
    // 未對調時編輯器位於結束側 (+100%)，對調後位於起始側 (-100%)
    const sign = swapped ? -1 : 1;
    const hiddenTransform = `translate${axis}(${sign * 100}%)`;
    const splitterHiddenTransform = `translate${axis}(${sign * editorSizePx}px)`;
    const identity = `translate${axis}(0)`;

    return {
        editorStart: visible ? hiddenTransform : identity,
        editorEnd: visible ? identity : hiddenTransform,
        splitterStart: visible ? splitterHiddenTransform : identity,
        splitterEnd: visible ? identity : splitterHiddenTransform,
    };
}

/**
 * 計算分割線浮動工具列是否觸及視口邊緣，避免被裁切並回傳貼邊方位
 * @param {Object} params
 * @param {number} params.splitterCenterPx - 分割線中心在主分割軸上的座標 (像素)
 * @param {number} params.viewportSizePx - 視口在主分割軸上的總長度 (像素)
 * @param {number} params.toolbarCrossSizePx - 浮動工具列沿主分割軸的寬度或高度 (像素)
 * @param {number} [params.edgePadding=0] - 貼邊時保留的邊界距離 (像素)
 * @returns {{ dockedSide: 'none'|'start'|'end', offsetPx: number }}
 */
export function computeFloatingToolbarDock({
    splitterCenterPx,
    viewportSizePx,
    toolbarCrossSizePx,
    edgePadding = 0,
}) {
    if (!viewportSizePx || viewportSizePx <= 0 || !toolbarCrossSizePx || toolbarCrossSizePx <= 0) {
        return { dockedSide: 'none', offsetPx: 0 };
    }

    const half = toolbarCrossSizePx / 2;
    const minCenter = edgePadding + half;
    const maxCenter = viewportSizePx - edgePadding - half;

    // 視口小於工具列尺寸時置中顯示
    if (minCenter > maxCenter) {
        return {
            dockedSide: 'start',
            offsetPx: (viewportSizePx / 2) - splitterCenterPx,
        };
    }

    // 加上 0.5px 容差避免浮點運算導致貼邊閃爍
    if (splitterCenterPx <= minCenter + 0.5) {
        return {
            dockedSide: 'start',
            offsetPx: minCenter - splitterCenterPx,
        };
    }

    if (splitterCenterPx >= maxCenter - 0.5) {
        return {
            dockedSide: 'end',
            offsetPx: maxCenter - splitterCenterPx,
        };
    }

    return { dockedSide: 'none', offsetPx: 0 };
}

/**
 * 計算畫布容器展開或全螢幕預覽時的目標像素矩形
 * 統一處理水平/垂直分割與是否互換四種排列，避免動畫時座標偏移
 * @param {Object} params
 * @param {string} [params.direction='horizontal']
 * @param {boolean} [params.swapped=false]
 * @param {boolean} params.visible - 編輯器是否顯示 (false 代表全螢幕預覽)
 * @param {number} params.splitRatio - 畫布佔比
 * @param {{ left: number, top: number, width: number, height: number }} params.workspaceRect
 * @returns {{ left: string, top: string, width: string, height: string }}
 */
export function computeCanvasAnimationRect({
    direction = LAYOUT_DIRECTIONS.HORIZONTAL,
    swapped = false,
    visible,
    splitRatio = 0.5,
    workspaceRect,
}) {
    const { left = 0, top = 0, width = 0, height = 0 } = workspaceRect || {};
    if (!visible) {
        return {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
        };
    }

    const ratio = Number.isFinite(splitRatio) ? Math.max(0, Math.min(1, splitRatio)) : 0.5;
    const isVertical = normalizeLayoutDirection(direction) === LAYOUT_DIRECTIONS.VERTICAL;

    if (isVertical) {
        const targetH = height * ratio;
        const targetTop = swapped ? top + height * (1 - ratio) : top;
        return {
            left: `${left}px`,
            top: `${targetTop}px`,
            width: `${width}px`,
            height: `${targetH}px`,
        };
    }

    const targetW = width * ratio;
    const targetLeft = swapped ? left + width * (1 - ratio) : left;
    return {
        left: `${targetLeft}px`,
        top: `${top}px`,
        width: `${targetW}px`,
        height: `${height}px`,
    };
}
