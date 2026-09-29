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
    <style>
      .help-dialog-content {
        color: #d4d4d4;
        font-size: 13.5px;
        line-height: 1.8;
      }
      .help-dialog-content p { margin: 8px 0 12px 0; }
      .help-dialog-content ul { margin: 8px 0 12px 0; padding-left: 0; list-style: none; }
      .help-dialog-content li { position: relative; padding-left: 16px; margin-bottom: 8px; }
      .help-dialog-content li::before {
        content: "•"; color: #3b82f6; font-weight: bold;
        position: absolute; left: 4px; top: 0;
      }
      .help-dialog-content b { color: #ffffff; }
      .code-highlight {
        background: #242424; color: #ffffff; padding: 3px 8px; border-radius: 4px;
        font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #3a3a3a;
        display: inline-block; line-height: 1.2; margin: 0 2px; vertical-align: middle;
      }
      .help-dialog-content .material-symbols-outlined {
        vertical-align: middle;
        font-size: 18px;
        margin: 0 2px;
      }
    </style>
    <div class="help-dialog-content">
      ${bodyHtml}
    </div>`;

    popupWindow({
        title,
        customContent,
        width: 480,
        height: "80%",
        buttons: [
            { text: t('popup.close'), hideOnClick: true }
        ]
    });
}
