import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟操作指南與快捷鍵說明彈窗
 */
export function openHelpModal() {
    // 💡 以後想改內容、加新功能，只要改這個設定陣列就好！
    const helpData = [
        {
            tabTitle: t('popup.help.basicTab'),
            title: t('popup.help.basicTitle'),
            items: t('popup.help.basicItems'),
            isList: false // 控制要用一般段落 <p> 還是一般列表 <ul>
        },
        {
            tabTitle: t('popup.help.shortcutTab'),
            title: t('popup.help.shortcutTitle'),
            items: t('popup.help.shortcutItems'),
            isList: true
        }
    ];

    // --- 1. CSS 樣式獨立抽出來 ---
    const style = `
    <style>
      .help-container {
        color: #aaaaaa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .help-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        border-bottom: 1px solid #2d2d2d;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .help-tabs::-webkit-scrollbar { display: none; }
      .tab-btn {
        background: transparent;
        color: #757575;
        border: none;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        position: relative;
        transition: color 0.2s ease;
      }
      .tab-btn:hover { color: #ffffff; }
      .tab-btn.active { color: #ffffff; font-weight: bold; }
      .tab-btn.active::after {
        content: "";
        position: absolute;
        bottom: -1px; left: 20px; right: 20px; height: 3px;
        background-color: #3b82f6;
      }
      .tab-pane {
        font-size: 13.5px;
        line-height: 1.8;
        color: #aaaaaa;
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .tab-pane h4 {
        color: #ffffff; font-size: 15px; margin-top: 0; margin-bottom: 16px;
        border-left: 3px solid #3b82f6; padding-left: 8px; font-weight: 600;
      }
      .tab-pane p { margin: 8px 0 12px 0; }
      .tab-pane ul { margin: 8px 0 12px 0; padding-left: 0; list-style: none; }
      .tab-pane li { position: relative; padding-left: 16px; margin-bottom: 8px; }
      .tab-pane li::before {
        content: "•"; color: #3b82f6; font-weight: bold;
        position: absolute; left: 4px; top: 0;
      }
      .tab-pane b { color: #ffffff; }
      .code-highlight {
        background: #242424; color: #ffffff; padding: 3px 8px; border-radius: 4px;
        font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #3a3a3a;
        display: inline-block; line-height: 1.2; margin: 0 2px; vertical-align: middle;
      }
      /* 讓 Material Icons 在文字裡對齊更完美 */
      .material-symbols-outlined {
        vertical-align: middle;
        font-size: 18px;
        margin: 0 2px;
      }
    </style>`;

    // --- 2. 透過 Array 串接自動產生 HTML 結構 ---
    const tabsHTML = helpData.map((data, i) => `
        <button class="tab-btn ${i === 0 ? 'active' : ''}">${data.tabTitle}</button>
    `).join('');

    const panesHTML = helpData.map((data, i) => {
        // 依據 isList 決定渲染成 <ul><li> 還是複數個 <p>
        const contentBody = data.isList
            ? `<ul>${data.items.map(item => `<li>${item}</li>`).join('')}</ul>`
            : data.items.map(item => `<p>${item}</p>`).join('');

        return `
            <div class="tab-pane" style="display: ${i === 0 ? 'block' : 'none'};">
                <h4>${data.title}</h4>
                ${contentBody}
            </div>
        `;
    }).join('');

    // 組合成最終內容
    const content = `
        ${style}
        <div class="help-container">
            <div class="help-tabs">${tabsHTML}</div>
            ${panesHTML}
        </div>
    `;

    // --- 3. 開啟彈窗與事件綁定 ---
    popupWindow({
        title: t('popup.help.title'),
        customContent: content,
        width: 480,
        height: "80%",
        buttons: [
            { text: t('popup.close'), hideOnClick: true }
        ],
        onOpen: (ctx) => {
            const container = ctx.elements.customContent;
            const buttons = container.querySelectorAll('.tab-btn');
            const panes = container.querySelectorAll('.tab-pane');
            buttons.forEach((btn, index) => {
                btn.onclick = () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    panes.forEach(p => p.style.display = 'none');
                    btn.classList.add('active');
                    panes[index].style.display = 'block';
                };
            });
        }
    });
}
