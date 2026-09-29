import { popupWindow } from '../helper.js';

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 開啟變更日誌彈窗（直接展示 CHANGELOG.md Markdown 原始文本）
 */
export async function openChangelogModal() {
    let markdown = '';
    try {
        const response = await fetch('./CHANGELOG.md');
        if (!response.ok) throw new Error('Failed to load CHANGELOG.md');
        markdown = await response.text();
    } catch (e) {
        console.error('讀取 CHANGELOG.md 失敗:', e);
        markdown = '無法載入變更日誌檔案';
    }

    popupWindow({
        title: '變更日誌',
        content: escapeHtml(markdown),
        width: 560,
        height: '80%',
        buttons: [],
        onOpen: (ctx) => {
            // 確保內容自頂部開始顯示，避免滾動偏移
            if (ctx.elements?.body) {
                ctx.elements.body.scrollTop = 0;
            }
        }
    });
}

