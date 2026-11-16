import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';
import { appContext } from '../core/appContext.js';
import {
    KEYBINDING_CATEGORIES,
    KEYBINDING_DEFINITIONS,
    formatShortcutParts,
    getEffectiveShortcut,
} from '../core/keybindings.js';
import { openSettingsModal } from './settingsModal.js';

/**
 * 開啟說明文件彈窗（基礎操作或快速鍵）
 * @param {'basic'|'shortcuts'} type 
 */
export function openHelpModal(type = 'basic') {
    const isBasic = type !== 'shortcuts';
    const title = isBasic ? t('popup.help.basicTitle') : t('popup.help.shortcutTitle');

    if (isBasic) {
        const items = t('popup.help.basicItems');
        const bodyHtml = items.map(item => `<p>${item}</p>`).join('');
        popupWindow({
            title,
            customContent: `<div class="help-dialog-content">${bodyHtml}</div>`,
            width: 480,
            height: "80%",
            buttons: []
        });
        return;
    }

    const customKeybindings = appContext.settings?.customKeybindings || {};
    const container = document.createElement('div');
    container.className = 'help-dialog-content';

    let helpPopupCtx = null;

    const toolbar = document.createElement('div');
    toolbar.className = 'help-shortcuts-toolbar';
    const customizeBtn = document.createElement('button');
    customizeBtn.type = 'button';
    customizeBtn.className = 'help-customize-kb-btn';
    customizeBtn.innerHTML = `<span class="material-symbols-outlined" translate="no" style="font-size:16px;">keyboard</span>`;
    const btnText = document.createElement('span');
    btnText.textContent = t('popup.help.customizeShortcutsBtn');
    customizeBtn.appendChild(btnText);
    customizeBtn.addEventListener('click', () => {
        helpPopupCtx?.close();
        openSettingsModal({ initialTab: 'keybindings' });
    });
    toolbar.appendChild(customizeBtn);
    container.appendChild(toolbar);

    KEYBINDING_CATEGORIES.forEach((cat) => {
        const defs = KEYBINDING_DEFINITIONS.filter((def) => {
            if (def.category !== cat) return false;
            return Boolean(getEffectiveShortcut(def.id, customKeybindings));
        });
        if (defs.length === 0) return;

        const catHeading = document.createElement('div');
        catHeading.className = 'help-shortcut-category';
        catHeading.textContent = t(`keybindings.categories.${cat}`);
        container.appendChild(catHeading);

        const ul = document.createElement('ul');
        defs.forEach((def) => {
            const li = document.createElement('li');
            const strong = document.createElement('b');
            strong.textContent = t(def.labelKey);
            li.appendChild(strong);
            li.appendChild(document.createTextNode('：'));

            const parts = formatShortcutParts(getEffectiveShortcut(def.id, customKeybindings));
            parts.forEach((part) => {
                const span = document.createElement('span');
                span.className = 'code-highlight';
                span.textContent = part;
                li.appendChild(span);
            });

            if (def.visualOnly) {
                const scope = document.createElement('span');
                scope.className = 'help-shortcut-scope';
                scope.textContent = `(${t('popup.help.shortcutScopeVisual')})`;
                li.appendChild(scope);
            }
            ul.appendChild(li);
        });
        container.appendChild(ul);
    });

    // 保留非單鍵綁定類型的進階操作說明（如 Ctrl+滾輪、Ctrl+Shift 快速面板）
    const legacyItems = t('popup.help.shortcutItems');
    if (Array.isArray(legacyItems) && legacyItems.length > 6) {
        const extraUl = document.createElement('ul');
        legacyItems.slice(6).forEach((itemHtml) => {
            const li = document.createElement('li');
            li.innerHTML = itemHtml;
            extraUl.appendChild(li);
        });
        container.appendChild(extraUl);
    }

    helpPopupCtx = popupWindow({
        title,
        customContent: container,
        width: 480,
        height: "80%",
        buttons: []
    });
}
