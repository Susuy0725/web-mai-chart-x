import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

const CHANGELOG_GITHUB_URL = 'https://github.com/Susuy0725/web-mai-chart-x/blob/main/CHANGELOG.md';

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 將行內 Markdown 轉為安全 HTML（inline code、連結、粗體、斜體、刪除線）
 * @param {string} text
 * @returns {string}
 */
function formatInlineMarkdown(text) {
    const codeTokens = [];
    const withPlaceholders = text.replace(/`([^`]+)`/g, (_, code) => {
        const idx = codeTokens.length;
        codeTokens.push(`<code class="changelog-code">${escapeHtml(code)}</code>`);
        return `\u0000CODE_${idx}\u0000`;
    });

    let html = escapeHtml(withPlaceholders);

    // 僅允許 http(s) 與站內相對路徑連結，避免注入不安全協議
    html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\.\/)[^\s)]+)\)/g, (_, label, url) => (
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    ));

    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

    return html.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] ?? '');
}

/**
 * 輕量 Markdown 轉 HTML 解析器（支援標題、巢狀清單、程式碼區塊、引言、分隔線與行內格式）
 * @param {string} md
 * @returns {string}
 */
export function renderSimpleMarkdown(md) {
    if (!md || typeof md !== 'string') return '';

    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const listStack = [];
    let paragraphBuf = [];
    let inCodeBlock = false;
    let codeBuf = [];

    const flushParagraph = () => {
        if (paragraphBuf.length === 0) return;
        out.push(`<p>${formatInlineMarkdown(paragraphBuf.join(' '))}</p>`);
        paragraphBuf = [];
    };

    const closeLists = (targetIndent = -1, targetTag = null) => {
        while (listStack.length > 0) {
            const top = listStack[listStack.length - 1];
            const shouldPop = targetIndent < 0
                || top.indent > targetIndent
                || (top.indent === targetIndent && targetTag && top.tag !== targetTag);
            if (!shouldPop) break;
            if (top.liOpen) out.push('</li>');
            out.push(`</${top.tag}>`);
            listStack.pop();
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const fenceMatch = line.match(/^\s*```/);
        if (fenceMatch) {
            flushParagraph();
            closeLists();
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBuf = [];
            } else {
                out.push(`<pre class="changelog-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
                inCodeBlock = false;
                codeBuf = [];
            }
            continue;
        }

        if (inCodeBlock) {
            codeBuf.push(line);
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            flushParagraph();
            closeLists();
            continue;
        }

        const headingMatch = line.match(/^\s*(#{1,4})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph();
            closeLists();
            const level = headingMatch[1].length;
            out.push(`<h${level}>${formatInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
            continue;
        }

        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushParagraph();
            closeLists();
            out.push('<hr class="changelog-hr" />');
            continue;
        }

        const quoteMatch = line.match(/^\s*>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            closeLists();
            out.push(`<blockquote class="changelog-quote">${formatInlineMarkdown(quoteMatch[1])}</blockquote>`);
            continue;
        }

        const listMatch = line.match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/);
        if (listMatch) {
            flushParagraph();
            const indent = listMatch[1].replace(/\t/g, '  ').length;
            const tag = listMatch[2] ? 'ul' : 'ol';
            const content = listMatch[4];

            closeLists(indent, tag);

            if (listStack.length === 0 || indent > listStack[listStack.length - 1].indent) {
                out.push(`<${tag}>`);
                listStack.push({ tag, indent, liOpen: false });
            }

            const top = listStack[listStack.length - 1];
            if (top.liOpen) {
                out.push('</li>');
            }
            out.push(`<li>${formatInlineMarkdown(content)}`);
            top.liOpen = true;
            continue;
        }

        closeLists();
        paragraphBuf.push(trimmed);
    }

    if (inCodeBlock) {
        out.push(`<pre class="changelog-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
    }
    flushParagraph();
    closeLists();

    return out.join('\n');
}

/**
 * 開啟變更日誌彈窗（以輕量 Markdown 渲染 CHANGELOG.md 並提供 GitHub 連結）
 */
export async function openChangelogModal() {
    let markdown = '';
    try {
        const response = await fetch('./CHANGELOG.md');
        if (!response.ok) throw new Error('Failed to load CHANGELOG.md');
        markdown = await response.text();
    } catch (e) {
        console.error('讀取 CHANGELOG.md 失敗:', e);
        markdown = t('popup.changelog.loadFailed') || '無法載入變更日誌檔案';
    }

    const container = document.createElement('div');
    container.className = 'changelog-modal';

    const markdownBody = document.createElement('div');
    markdownBody.className = 'changelog-markdown';
    markdownBody.innerHTML = renderSimpleMarkdown(markdown);

    container.append(markdownBody);

    popupWindow({
        title: t('popup.changelog.title') || '變更日誌',
        customContent: container,
        width: 580,
        height: '80%',
        buttons: [
            {
                text: t('popup.changelog.viewOnGithub') || '在 GitHub 瀏覽',
                onClick: () => {
                    window.open(CHANGELOG_GITHUB_URL, '_blank', 'noopener,noreferrer');
                }
            }
        ],
        onOpen: (ctx) => {
            // 確保內容自頂部開始顯示，避免滾動偏移
            markdownBody.scrollTop = 0;
            if (ctx.elements?.body) {
                ctx.elements.body.scrollTop = 0;
            }
        }
    });
}

