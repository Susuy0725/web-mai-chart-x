import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟說明文件彈窗（基礎操作或快速鍵）
 * @param {'basic'|'shortcuts'} type 
 */
export function openHelpModal(type = 'basic') {
    const isBasic = type !== 'shortcuts';
    const title = isBasic ? t('popup.help.basicTitle') : t('popup.help.shortcutTitle');
    const items = isBasic ? t('popup.help.basicItems') : t('popup.help.shortcutItems');

    const bodyHtml = isBasic
        ? items.map(item => `<p>${item}</p>`).join('')
        : `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;

    const customContent = `
    <div class="help-dialog-content">
      ${bodyHtml}
    </div>`;

    popupWindow({
        title,
        customContent,
        width: 480,
        height: "80%",
        buttons: []
    });
}
