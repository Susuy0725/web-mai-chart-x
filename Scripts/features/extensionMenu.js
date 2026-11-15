/**
 * @file extensionMenu.js
 * @description 頂欄拼圖擴充選單渲染與插件管理介面入口。
 * 將已啟用插件的二級功能選單動態渲染於「管理插件」分隔線上方，並統一使用 textContent 防止 XSS。
 */

import { eventBus, EVENTS } from '../core/eventBus.js';
import { commandRegistry } from '../core/commandRegistry.js';
import { extensionManager } from '../core/extensionManager.js';
import { t, onLanguageChange } from '../i18n.js';
import { openExtensionPopover, closeExtensionPopover, getExtensionSettings } from './extensionPopover.js';
import { openExtensionManagerModal } from '../modals/extensionManagerModal.js';

/** @type {Map<string, Array<Object>>} */
const menuItemsByExtension = new Map();
/** @type {Map<string, HTMLElement>} */
const floatingWidgets = new Map();

let isInitialized = false;

function resolveItemLabel(item) {
    if (item.labelKey) {
        const translated = t(item.labelKey);
        if (translated !== item.labelKey) return translated;
    }
    return item.label || item.id || '';
}

function closeExtensionDropdown() {
    const dropdown = document.getElementById('extensionsDropdown');
    if (dropdown) {
        dropdown.classList.remove('open');
        dropdown.querySelectorAll('.utilityMenuTitle.open').forEach((el) => el.classList.remove('open'));
    }
}

/**
 * 註冊擴充程式的選單功能項目
 * @param {string} extensionId
 * @param {Object} item
 * @returns {Function} 取消註冊函式
 */
export function registerExtensionMenuItem(extensionId, item) {
    if (!extensionId || !item || !item.id) {
        throw new TypeError('[ExtensionMenu] 選單項目缺少 extensionId 或 id');
    }

    if (!menuItemsByExtension.has(extensionId)) {
        menuItemsByExtension.set(extensionId, []);
    }

    const list = menuItemsByExtension.get(extensionId);
    const existingIndex = list.findIndex((x) => x.id === item.id);
    const entry = {
        id: String(item.id),
        label: item.label ? String(item.label) : '',
        labelKey: item.labelKey ? String(item.labelKey) : '',
        commandId: item.commandId ? String(item.commandId) : '',
        onClick: typeof item.onClick === 'function' ? item.onClick : null
    };

    if (existingIndex >= 0) {
        list[existingIndex] = entry;
    } else {
        list.push(entry);
    }

    renderExtensionMenu();
    eventBus.emit(EVENTS.EXTENSION_MENU_CHANGED, { extensionId });

    return () => {
        const current = menuItemsByExtension.get(extensionId);
        if (!current) return;
        const idx = current.findIndex((x) => x.id === entry.id);
        if (idx >= 0) {
            current.splice(idx, 1);
        }
        if (current.length === 0) {
            menuItemsByExtension.delete(extensionId);
        }
        renderExtensionMenu();
        eventBus.emit(EVENTS.EXTENSION_MENU_CHANGED, { extensionId });
    };
}

/**
 * 移除指定擴充程式註冊的所有選單項目
 * @param {string} extensionId
 */
export function unregisterExtensionMenuItems(extensionId) {
    if (menuItemsByExtension.delete(extensionId)) {
        renderExtensionMenu();
        eventBus.emit(EVENTS.EXTENSION_MENU_CHANGED, { extensionId });
    }
}

/**
 * 依目前啟用狀態重新渲染頂欄擴充二級選單
 */
export function renderExtensionMenu() {
    if (typeof document === 'undefined') return;
    const listContainer = document.getElementById('extensionsMenuList');
    const dividerEl = document.getElementById('extensionsMenuDivider');
    if (!listContainer || !dividerEl) return;

    listContainer.textContent = '';

    const extensions = extensionManager.list();
    let renderedCount = 0;

    for (const record of extensions) {
        if (record.status !== 'active') continue;
        const extId = record.manifest.id;
        const items = menuItemsByExtension.get(extId) || [];
        if (items.length === 0) continue;

        const titleRow = document.createElement('div');
        titleRow.className = 'utilityButton utilityMenuTitle';
        titleRow.setAttribute('role', 'button');
        titleRow.setAttribute('tabindex', '0');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = record.manifest.name || extId;

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'utilityMenuArrow material-symbols-outlined';
        arrowSpan.setAttribute('translate', 'no');
        arrowSpan.textContent = 'chevron_right';

        const submenu = document.createElement('div');
        submenu.className = 'utilitySubmenu';

        if (items.length === 0) {
            const emptyBtn = document.createElement('div');
            emptyBtn.className = 'utilityButton disabled';
            emptyBtn.setAttribute('data-i18n', 'extensions.empty');
            emptyBtn.textContent = t('extensions.empty');
            submenu.appendChild(emptyBtn);
        } else {
            for (const item of items) {
                const itemBtn = document.createElement('div');
                itemBtn.className = 'utilityButton';
                itemBtn.setAttribute('role', 'button');
                itemBtn.setAttribute('tabindex', '0');

                const labelSpan = document.createElement('span');
                labelSpan.textContent = resolveItemLabel(item);
                itemBtn.appendChild(labelSpan);

                itemBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    closeExtensionDropdown();
                    if (item.onClick) {
                        try {
                            item.onClick({ anchorEl: document.getElementById('extensionsDropdown') });
                        } catch (error) {
                            console.error(`[ExtensionMenu] 執行項目 "${item.id}" 失敗:`, error);
                        }
                    } else if (item.commandId) {
                        commandRegistry.execute(item.commandId, {
                            anchorEl: document.getElementById('extensionsDropdown')
                        });
                    }
                });
                itemBtn.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        itemBtn.click();
                    }
                });

                submenu.appendChild(itemBtn);
            }
        }

        titleRow.appendChild(nameSpan);
        titleRow.appendChild(arrowSpan);
        titleRow.appendChild(submenu);
        listContainer.appendChild(titleRow);
        renderedCount++;
    }

    dividerEl.style.display = renderedCount > 0 ? '' : 'none';
}

/**
 * 為擴充程式建立受控浮動元件掛載容器，並在卸載時自動清理 DOM
 * @param {string} extensionId
 * @param {Object} [options={}]
 * @returns {{ element: HTMLElement, dispose: Function }}
 */
export function createFloatingWidget(extensionId, options = {}) {
    if (typeof document === 'undefined') return null;
    const widgetId = `${extensionId}:${options.id || 'default'}`;
    const existing = floatingWidgets.get(widgetId);
    if (existing) {
        existing.remove();
        floatingWidgets.delete(widgetId);
    }

    const host = document.createElement('div');
    host.className = 'extension-floating-widget';
    host.dataset.extensionId = extensionId;
    host.dataset.position = options.position || 'right';

    const root = document.getElementById('app') || document.body;
    root.appendChild(host);
    floatingWidgets.set(widgetId, host);

    return {
        element: host,
        dispose: () => {
            if (host.parentNode) {
                host.remove();
            }
            if (floatingWidgets.get(widgetId) === host) {
                floatingWidgets.delete(widgetId);
            }
        }
    };
}

/**
 * 開啟插件管理彈窗
 */
export function openManageExtensionsModal() {
    openExtensionManagerModal();
}

/**
 * 初始化頂欄擴充程式選單的事件委派與管理按鈕綁定
 */
export function initExtensionMenu() {
    if (isInitialized || typeof document === 'undefined') return;
    isInitialized = true;

    extensionManager.setUiBridge({
        registerMenuItem: registerExtensionMenuItem,
        openPopover: openExtensionPopover,
        closePopover: closeExtensionPopover,
        getSettings: getExtensionSettings,
        createFloatingWidget
    });

    const listContainer = document.getElementById('extensionsMenuList');
    if (listContainer) {
        const handleToggleSubmenu = (event) => {
            if (event.target.closest('.utilitySubmenu .utilityButton')) {
                return;
            }
            const titleRow = event.target.closest('.utilityMenuTitle');
            if (!titleRow) return;
            event.stopPropagation();
            const isOpen = titleRow.classList.contains('open');
            listContainer.querySelectorAll('.utilityMenuTitle').forEach((m) => m.classList.remove('open'));
            if (!isOpen) {
                titleRow.classList.add('open');
            }
        };
        listContainer.addEventListener('click', handleToggleSubmenu);
        listContainer.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                if (event.target.closest('.utilitySubmenu .utilityButton')) {
                    return;
                }
                if (event.target.closest('.utilityMenuTitle')) {
                    event.preventDefault();
                    handleToggleSubmenu(event);
                }
            }
        });
    }

    const manageBtn = document.querySelector('#extensionsDropdown [data-buttonAction="manageExtensions"]');
    if (manageBtn) {
        const handleManageClick = (event) => {
            event.stopPropagation();
            closeExtensionDropdown();
            openManageExtensionsModal();
        };
        manageBtn.addEventListener('click', handleManageClick);
        manageBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleManageClick(event);
            }
        });
    }

    eventBus.on(EVENTS.EXTENSION_REGISTERED, renderExtensionMenu);
    eventBus.on(EVENTS.EXTENSION_ACTIVATED, renderExtensionMenu);
    eventBus.on(EVENTS.EXTENSION_DEACTIVATED, renderExtensionMenu);
    onLanguageChange(renderExtensionMenu);

    renderExtensionMenu();
}
