/**
 * @file build-docs.mjs
 * @description 將 doc/docData.js 預編譯為靜態多頁 HTML、單詞條 Markdown、llms.txt、llms-full.txt、search-index.json 與 sitemap.xml，
 * 並於結束前驗證所有站內相對路徑、絕對網址與衍生檔案完整性。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_CORE_NOTICES, DOC_CATEGORIES, DOC_GROUPS, DOC_ITEMS } from '../../doc/docData.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const DOC_DIR = path.join(ROOT_DIR, 'doc');
const MD_DIR = path.join(DOC_DIR, 'md');

const SITE_BASE_URL = 'https://susuy0725.github.io/web-mai-chart-x';
const DOC_BASE_URL = `${SITE_BASE_URL}/doc`;

const CATEGORY_MAP = new Map(DOC_CATEGORIES.map((c) => [c.id, c]));
const GROUP_MAP = new Map(DOC_GROUPS.map((g) => [g.id, g]));
const ITEM_MAP = new Map(DOC_ITEMS.map((i) => [i.id, i]));

const STABILITY_LABELS = {
    stable: 'stable',
    experimental: 'experimental',
    deprecated: 'deprecated'
};

/**
 * 轉義 HTML 特殊字元
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 將包含反引號的行內程式碼片段安全轉為 HTML
 * @param {string} text
 * @returns {string}
 */
function renderInlineCodeHtml(text) {
    const source = String(text ?? '');
    const parts = source.split(/(`[^`]+`)/g);
    let out = '';
    for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            out += `<code class="doc-inline-code">${escapeHtml(part.slice(1, -1))}</code>`;
        } else {
            out += escapeHtml(part);
        }
    }
    return out;
}

/**
 * 取得程式碼區塊動態圍欄（若內文含 ``` 則自動使用更長反引號）
 * @param {string} code
 * @param {string} [lang='']
 * @returns {string}
 */
function formatCodeFence(code, lang = '') {
    const text = String(code ?? '');
    const matches = text.match(/`+/g);
    let maxTicks = 0;
    if (matches) {
        for (const m of matches) {
            if (m.length > maxTicks) maxTicks = m.length;
        }
    }
    const fence = '`'.repeat(Math.max(3, maxTicks + 1));
    const safeText = text.endsWith('\n') ? text.slice(0, -1) : text;
    return `${fence}${lang}\n${safeText}\n${fence}`;
}

/**
 * 將字串轉義為 Markdown 表格儲存格內容（跳脫 | 為 \|，換行轉為 <br>）
 * @param {string} value
 * @returns {string}
 */
function escapeMdTableCell(value) {
    return String(value ?? '')
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|');
}

/**
 * 將預設值包覆為行內程式碼字串
 * @param {string} val
 * @returns {string}
 */
function formatInlineCodeToken(val) {
    const s = String(val ?? '').trim();
    if (!s) return '無';
    if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) {
        return s;
    }
    if (s.includes('`')) {
        return `\`\` ${s} \`\``;
    }
    return `\`${s}\``;
}

/**
 * 將參數與巢狀子參數攤平為固定 5 欄（名稱、型別、必填、預設值、說明）
 * @param {Array<Object>} params
 * @param {string} [prefix='']
 * @returns {Array<{name: string, type: string, required: string, defaultValue: string, description: string}>}
 */
function flattenParameters(params, prefix = '') {
    const rows = [];
    if (!Array.isArray(params)) return rows;
    for (const p of params) {
        const fullName = prefix ? `${prefix}.${p.name}` : String(p.name || '');
        const reqText = typeof p.required === 'boolean' ? (p.required ? '是' : '否') : '—';
        const defText = p.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== ''
            ? formatInlineCodeToken(p.defaultValue)
            : '無';
        rows.push({
            name: formatInlineCodeToken(fullName),
            type: p.type ? formatInlineCodeToken(p.type) : '—',
            required: reqText,
            defaultValue: defText,
            description: String(p.description || '')
        });
        if (Array.isArray(p.children) && p.children.length > 0) {
            rows.push(...flattenParameters(p.children, fullName));
        }
    }
    return rows;
}

/**
 * 判斷詞條是否為可呼叫方法
 * @param {Object} item
 * @returns {boolean}
 */
function isCallableItem(item) {
    if (typeof item.codeTitle === 'string' && item.codeTitle.includes('()')) return true;
    if (typeof item.syntax === 'string' && item.syntax.includes('(')) return true;
    return false;
}

/**
 * 取得詞條穩定度與適用版本（缺漏時一律標示「未標註」，不以預設值補齊）
 * @param {Object} item
 * @returns {{ stability: string, stabilityClass: string, apiVersion: string }}
 */
function getItemMetadata(item) {
    const rawStability = typeof item.stability === 'string' ? item.stability.trim().toLowerCase() : '';
    const validStability = STABILITY_LABELS[rawStability] || '';
    const stability = validStability || '未標註';
    const stabilityClass = validStability || 'unmarked';
    const apiVersion = item.status?.apiVersion || item.summary?.since || '未標註';
    return { stability, stabilityClass, apiVersion };
}

/**
 * 取得語言標籤推測（供 Markdown 圍欄使用）
 * @param {string} label
 * @param {string} code
 * @returns {string}
 */
function guessCodeLang(label = '', code = '') {
    const lowerLabel = String(label).toLowerCase();
    const trimmed = String(code).trim();
    if (lowerLabel.includes('json') || trimmed.startsWith('{') && trimmed.includes('"')) {
        return 'json';
    }
    if (lowerLabel.includes('powershell') || lowerLabel.includes('打包') || lowerLabel.includes('雜湊')) {
        return trimmed.startsWith('#') || trimmed.includes('Compress-Archive') ? 'bash' : 'text';
    }
    if (lowerLabel.includes('階層') || lowerLabel.includes('目錄結構')) {
        return 'text';
    }
    return 'js';
}

/**
 * 依固定模板順序將詞條轉為純淨 Markdown
 * @param {Object} item
 * @param {number} [headingLevel=1]
 * @returns {string}
 */
function renderItemMarkdown(item, headingLevel = 1) {
    const h1 = '#'.repeat(headingLevel);
    const h2 = '#'.repeat(headingLevel + 1);
    const h3 = '#'.repeat(headingLevel + 2);
    const { stability, apiVersion } = getItemMetadata(item);
    const cat = CATEGORY_MAP.get(item.category);
    const group = GROUP_MAP.get(item.groupId);

    const lines = [];
    const displayTitle = item.codeTitle ? `${item.codeTitle} - ${item.title}` : item.title;
    lines.push(`${h1} ${displayTitle}`);
    lines.push('');

    const metaParts = [
        `詞條識別碼: \`${item.id}\``,
        `分類: ${cat ? cat.label : item.category}`,
        group ? `群組: ${group.title}` : null,
        `穩定度: \`${stability}\``,
        `適用版本: \`${apiVersion}\``
    ].filter(Boolean);
    lines.push(`> ${metaParts.join(' | ')}`);

    if (item.status) {
        const perms = (item.status.permissions || []).map((p) => `\`${p}\``).join('、') || '無';
        const envs = (item.status.envs || []).join('、') || '無';
        lines.push(`> 狀態: ${item.status.label || 'API'} | 權限: ${perms} | 支援環境: ${envs}`);
    }
    lines.push('');

    // 1. 一句話用途
    lines.push(`${h2} 一句話用途`);
    lines.push('');
    if (item.subtitle) {
        lines.push(item.subtitle);
        lines.push('');
    }
    if (Array.isArray(item.overview) && item.overview.length > 0) {
        for (const para of item.overview) {
            lines.push(para);
            lines.push('');
        }
    }

    // 2. 完整型別簽名
    if (item.syntax) {
        lines.push(`${h2} 完整型別簽名`);
        lines.push('');
        lines.push(formatCodeFence(item.syntax, 'js'));
        lines.push('');
    }

    // 3. 參數表
    const flatParams = flattenParameters(item.parameters);
    if (flatParams.length > 0 || isCallableItem(item)) {
        lines.push(`${h2} 參數表`);
        lines.push('');
        if (flatParams.length > 0) {
            lines.push('| 名稱 | 型別 | 必填 | 預設值 | 說明 |');
            lines.push('| --- | --- | --- | --- | --- |');
            for (const row of flatParams) {
                lines.push(
                    `| ${escapeMdTableCell(row.name)} | ${escapeMdTableCell(row.type)} | ${escapeMdTableCell(row.required)} | ${escapeMdTableCell(row.defaultValue)} | ${escapeMdTableCell(row.description)} |`
                );
            }
        } else {
            lines.push('此方法不接受參數。');
        }
        lines.push('');
    }

    // 4. 回傳值
    if (item.returns) {
        lines.push(`${h2} 回傳值`);
        lines.push('');
        lines.push(`- **型別**：\`${item.returns.type}\``);
        if (item.returns.description) {
            lines.push(`- **說明**：${item.returns.description}`);
        }
        lines.push('');
        const returnFields = flattenParameters(item.returns.fields);
        if (returnFields.length > 0) {
            lines.push('| 欄位名稱 | 型別 | 必填 | 預設值 | 說明 |');
            lines.push('| --- | --- | --- | --- | --- |');
            for (const row of returnFields) {
                lines.push(
                    `| ${escapeMdTableCell(row.name)} | ${escapeMdTableCell(row.type)} | ${escapeMdTableCell(row.required)} | ${escapeMdTableCell(row.defaultValue)} | ${escapeMdTableCell(row.description)} |`
                );
            }
            lines.push('');
        }
    }

    // 規格對照表
    if (Array.isArray(item.tables) && item.tables.length > 0) {
        for (const tableDef of item.tables) {
            lines.push(`${h2} ${tableDef.title || '規格說明'}`);
            lines.push('');
            const cols = tableDef.columns || [];
            lines.push(`| ${cols.map(escapeMdTableCell).join(' | ')} |`);
            lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
            for (const row of tableDef.rows || []) {
                const padded = cols.map((_, idx) => escapeMdTableCell(row[idx] ?? ''));
                lines.push(`| ${padded.join(' | ')} |`);
            }
            lines.push('');
        }
    }

    // 5. 呼叫時機與生命週期
    if (item.summary || (Array.isArray(item.callouts) && item.callouts.length > 0)) {
        lines.push(`${h2} 呼叫時機與生命週期`);
        lines.push('');
        if (item.summary) {
            lines.push('| 屬性 | 說明 |');
            lines.push('| --- | --- |');
            const summaryRows = [
                ['所屬命名空間', item.summary.namespace || '未標註'],
                ['權限需求', item.summary.permission || '未標註'],
                ['權限常數', item.summary.constant || '未標註'],
                ['呼叫時機與執行型態', item.summary.async || '未標註'],
                ['執行環境與生命週期', item.summary.runtime || '未標註'],
                ['適用版本', item.summary.since || item.status?.apiVersion || '未標註']
            ];
            for (const [k, v] of summaryRows) {
                lines.push(`| ${escapeMdTableCell(k)} | ${escapeMdTableCell(v)} |`);
            }
            lines.push('');
        }
        if (Array.isArray(item.callouts) && item.callouts.length > 0) {
            for (const callout of item.callouts) {
                lines.push(`${h3} ${callout.title || '重要提醒'}`);
                lines.push('');
                for (const cItem of callout.items || []) {
                    lines.push(`- ${cItem}`);
                }
                lines.push('');
            }
        }
    }

    // 6. 完整可複製的最小範例
    if (Array.isArray(item.examples) && item.examples.length > 0) {
        lines.push(`${h2} 完整可複製的最小範例`);
        lines.push('');
        for (const ex of item.examples) {
            if (ex.label) {
                lines.push(`${h3} ${ex.label}`);
                lines.push('');
            }
            lines.push(formatCodeFence(ex.code, guessCodeLang(ex.label, ex.code)));
            lines.push('');
        }
    }

    // 7. 相關詞條連結
    const validRefs = (item.seeAlso || []).map((id) => ITEM_MAP.get(id)).filter(Boolean);
    if (validRefs.length > 0) {
        lines.push(`${h2} 相關詞條連結`);
        lines.push('');
        for (const ref of validRefs) {
            const label = ref.codeTitle ? `${ref.codeTitle} - ${ref.title}` : ref.title;
            lines.push(`- [${label}](${DOC_BASE_URL}/md/${ref.id}.md)`);
        }
        lines.push('');
    }

    // 8. 注意事項
    if (Array.isArray(item.notes) && item.notes.length > 0) {
        lines.push(`${h2} 注意事項`);
        lines.push('');
        for (const note of item.notes) {
            lines.push(`- ${note}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * 渲染可複製程式碼區塊 HTML
 * @param {string} code
 * @param {string} label
 * @param {number} blockIndex
 * @returns {string}
 */
function renderCodeBlockHtml(code, label, blockIndex) {
    const labelId = `doc-code-label-${blockIndex}`;
    return [
        '<div class="doc-code-block">',
        '  <div class="doc-code-header">',
        `    <span class="doc-code-label" id="${labelId}">${escapeHtml(label)}</span>`,
        '    <button type="button" class="doc-copy-btn">',
        '      <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>',
        '      <span>複製</span>',
        '    </button>',
        '  </div>',
        `  <pre class="doc-code-pre" tabindex="0" role="region" aria-labelledby="${labelId}"><code>${escapeHtml(code)}</code></pre>`,
        '</div>'
    ].join('\n');
}

/**
 * 渲染規格表格 HTML
 * @param {Array<string>} columns
 * @param {Array<Array<string>>} rows
 * @param {string} labelledById
 * @param {boolean} [isSummary=false]
 * @returns {string}
 */
function renderTableHtml(columns, rows, labelledById, isSummary = false) {
    const tableClass = isSummary ? 'doc-table doc-summary-table' : 'doc-table';
    const theadHtml = columns.length > 0
        ? `<thead><tr>${columns.map((col) => `<th scope="col">${escapeHtml(col)}</th>`).join('')}</tr></thead>`
        : '';
    const tbodyRows = rows.map((row) => {
        if (isSummary) {
            const [k, v] = row;
            return `<tr><th scope="row">${escapeHtml(k)}</th><td>${renderInlineCodeHtml(v)}</td></tr>`;
        }
        return `<tr>${row.map((cell) => `<td>${renderInlineCodeHtml(cell)}</td>`).join('')}</tr>`;
    }).join('');
    return [
        `<div class="doc-table-wrap" tabindex="0" role="region" aria-labelledby="${escapeHtml(labelledById)}">`,
        `  <table class="${tableClass}">`,
        theadHtml ? `    ${theadHtml}` : '',
        `    <tbody>${tbodyRows}</tbody>`,
        '  </table>',
        '</div>'
    ].filter(Boolean).join('\n');
}

/**
 * 渲染單一詞條完整靜態 HTML 頁面
 * @param {Object} item
 * @param {number} itemIndex
 * @param {Array<string>} allIds
 * @returns {string}
 */
function renderItemHtml(item, itemIndex) {
    const { stability, stabilityClass, apiVersion } = getItemMetadata(item);
    const cat = CATEGORY_MAP.get(item.category);
    const group = GROUP_MAP.get(item.groupId);
    const tocEntries = [];
    let codeBlockCounter = 0;

    const addSection = (id, title, innerHtml) => {
        tocEntries.push({ id, title });
        return [
            `<section class="doc-section" id="${escapeHtml(id)}">`,
            `  <h2 class="doc-section-title" id="${escapeHtml(id)}-heading">`,
            `    <a class="doc-anchor-link" href="#${escapeHtml(id)}">${escapeHtml(title)}</a>`,
            '  </h2>',
            innerHtml,
            '</section>'
        ].join('\n');
    };

    const sectionsHtml = [];

    // 1. 一句話用途
    {
        const parts = [];
        const proseLines = [];
        if (item.subtitle) {
            proseLines.push(`<p>${renderInlineCodeHtml(item.subtitle)}</p>`);
        }
        if (Array.isArray(item.overview)) {
            for (const para of item.overview) {
                proseLines.push(`<p>${renderInlineCodeHtml(para)}</p>`);
            }
        }
        if (proseLines.length > 0) {
            parts.push(`<div class="doc-prose">${proseLines.join('')}</div>`);
        }
        if (parts.length > 0) {
            sectionsHtml.push(addSection('sec-overview', '一句話用途', parts.join('\n')));
        }
    }

    // 2. 完整型別簽名
    if (item.syntax) {
        const block = renderCodeBlockHtml(item.syntax, '型別與呼叫簽名', ++codeBlockCounter);
        sectionsHtml.push(addSection('sec-syntax', '完整型別簽名', block));
    }

    // 3. 參數表
    const flatParams = flattenParameters(item.parameters);
    if (flatParams.length > 0 || isCallableItem(item)) {
        let paramInner;
        if (flatParams.length > 0) {
            const tableRows = flatParams.map((r) => [r.name, r.type, r.required, r.defaultValue, r.description]);
            paramInner = renderTableHtml(['名稱', '型別', '必填', '預設值', '說明'], tableRows, 'sec-parameters-heading');
        } else {
            paramInner = '<p class="doc-empty-note">此方法不接受參數。</p>';
        }
        sectionsHtml.push(addSection('sec-parameters', '參數表', paramInner));
    }

    // 4. 回傳值
    if (item.returns) {
        const boxParts = [
            '<div class="doc-return-box">',
            `  <div class="doc-return-head"><span class="doc-type-badge">${escapeHtml(item.returns.type)}</span></div>`,
            `  <p class="doc-return-desc">${renderInlineCodeHtml(item.returns.description || '')}</p>`
        ];
        const returnFields = flattenParameters(item.returns.fields);
        if (returnFields.length > 0) {
            const rows = returnFields.map((r) => [r.name, r.type, r.required, r.defaultValue, r.description]);
            boxParts.push(renderTableHtml(['欄位名稱', '型別', '必填', '預設值', '說明'], rows, 'sec-returns-heading'));
        }
        boxParts.push('</div>');
        sectionsHtml.push(addSection('sec-returns', '回傳值', boxParts.join('\n')));
    }

    // 規格對照表
    if (Array.isArray(item.tables) && item.tables.length > 0) {
        item.tables.forEach((tableDef, idx) => {
            const secId = `sec-table-${idx}`;
            const title = tableDef.title || '規格說明';
            const tableHtml = renderTableHtml(tableDef.columns || [], tableDef.rows || [], `${secId}-heading`);
            sectionsHtml.push(addSection(secId, title, tableHtml));
        });
    }

    // 5. 呼叫時機與生命週期
    if (item.summary || (Array.isArray(item.callouts) && item.callouts.length > 0)) {
        const inner = [];
        if (item.summary) {
            const rows = [
                ['所屬命名空間', item.summary.namespace || '未標註'],
                ['權限需求', item.summary.permission || '未標註'],
                ['權限常數', item.summary.constant || '未標註'],
                ['呼叫時機與執行型態', item.summary.async || '未標註'],
                ['執行環境與生命週期', item.summary.runtime || '未標註'],
                ['適用版本', item.summary.since || item.status?.apiVersion || '未標註']
            ];
            inner.push(renderTableHtml([], rows, 'sec-lifecycle-heading', true));
        }
        if (Array.isArray(item.callouts)) {
            for (const callout of item.callouts) {
                const variant = callout.variant || 'info';
                const iconName = variant === 'danger' ? 'error' : variant === 'warning' ? 'warning' : 'info';
                const itemsLi = (callout.items || []).map((t) => `<li>${renderInlineCodeHtml(t)}</li>`).join('');
                inner.push([
                    `<div class="doc-callout is-${escapeHtml(variant)}">`,
                    `  <div class="doc-callout-title"><span class="material-symbols-outlined" aria-hidden="true">${iconName}</span><span>${escapeHtml(callout.title || '重要提醒')}</span></div>`,
                    `  <ul class="doc-bullet-list">${itemsLi}</ul>`,
                    '</div>'
                ].join('\n'));
            }
        }
        sectionsHtml.push(addSection('sec-lifecycle', '呼叫時機與生命週期', inner.join('\n')));
    }

    // 6. 完整可複製的最小範例
    if (Array.isArray(item.examples) && item.examples.length > 0) {
        const blocks = item.examples
            .map((ex) => renderCodeBlockHtml(ex.code, ex.label || '範例程式碼', ++codeBlockCounter))
            .join('\n');
        sectionsHtml.push(addSection('sec-examples', '完整可複製的最小範例', blocks));
    }

    // 7. 相關詞條連結
    const validRefs = (item.seeAlso || []).map((id) => ITEM_MAP.get(id)).filter(Boolean);
    if (validRefs.length > 0) {
        const linksLi = validRefs.map((ref) => {
            const label = ref.codeTitle || ref.title;
            return `<li><a class="doc-seealso-link" href="./${escapeHtml(ref.id)}.html"><span>${escapeHtml(label)}</span></a></li>`;
        }).join('');
        sectionsHtml.push(addSection('sec-see-also', '相關詞條連結', `<ul class="doc-seealso-list" role="list">${linksLi}</ul>`));
    }

    // 8. 注意事項
    if (Array.isArray(item.notes) && item.notes.length > 0) {
        const notesLi = item.notes.map((n) => `<li>${renderInlineCodeHtml(n)}</li>`).join('');
        sectionsHtml.push(addSection('sec-notes', '注意事項', `<ul class="doc-bullet-list">${notesLi}</ul>`));
    }

    // 頂部導覽連結
    const topNavHtml = DOC_CATEGORIES.map((c) => {
        const isActive = c.id === item.category;
        const activeClass = isActive ? ' is-active' : '';
        const ariaCurrent = isActive ? ' aria-current="page"' : '';
        return `<a class="doc-topnav-btn${activeClass}" href="./${escapeHtml(c.defaultDocId)}.html"${ariaCurrent}>${escapeHtml(c.label)}</a>`;
    }).join('');

    // 麵包屑
    const crumbs = [
        '<a class="doc-crumb-btn" href="./index.html">WMCX</a>'
    ];
    if (cat) {
        crumbs.push('<span class="material-symbols-outlined doc-crumb-sep" aria-hidden="true">chevron_right</span>');
        crumbs.push(`<a class="doc-crumb-btn" href="./${escapeHtml(cat.defaultDocId)}.html">${escapeHtml(cat.label)}</a>`);
    }
    if (group && group.mono && ITEM_MAP.has(group.title) && group.title !== item.id) {
        crumbs.push('<span class="material-symbols-outlined doc-crumb-sep" aria-hidden="true">chevron_right</span>');
        crumbs.push(`<a class="doc-crumb-btn" href="./${escapeHtml(group.title)}.html">${escapeHtml(group.title)}</a>`);
    }
    crumbs.push('<span class="material-symbols-outlined doc-crumb-sep" aria-hidden="true">chevron_right</span>');
    crumbs.push(`<span class="doc-crumb-current">${escapeHtml(item.codeTitle || item.title)}</span>`);

    // 側邊欄樹狀目錄
    const sidebarSections = [];
    for (const category of DOC_CATEGORIES) {
        const catGroups = DOC_GROUPS.filter((g) => g.category === category.id);
        const groupHtmls = [];
        for (const grp of catGroups) {
            const grpItems = DOC_ITEMS.filter((it) => it.groupId === grp.id);
            if (grpItems.length === 0) continue;
            const containsCurrent = grp.id === item.groupId;
            const shouldOpen = containsCurrent || Boolean(grp.defaultOpen);
            const linksHtml = grpItems.map((it) => {
                const active = it.id === item.id;
                const activeClass = active ? ' is-active' : '';
                const ariaCurr = active ? ' aria-current="page"' : '';
                const monoClass = it.sidebarMono ? ' is-mono' : '';
                const pill = it.badge ? `<span class="doc-tree-pill">${escapeHtml(it.badge)}</span>` : '';
                return [
                    `<a class="doc-tree-link${activeClass}" href="./${escapeHtml(it.id)}.html" data-doc-id="${escapeHtml(it.id)}" data-search-text="${escapeHtml(`${it.title} ${it.codeTitle || ''} ${it.sidebarLabel} ${it.subtitle || ''} ${(it.status?.permissions || []).join(' ')}`.toLowerCase())}"${ariaCurr}>`,
                    `  <span class="doc-tree-link-label${monoClass}">${escapeHtml(it.sidebarLabel)}</span>`,
                    pill ? `  ${pill}` : '',
                    '</a>'
                ].filter(Boolean).join('');
            }).join('');
            const titleClass = grp.mono ? ' class="doc-tree-group-code"' : '';
            groupHtmls.push([
                `<details class="doc-tree-group" data-group-id="${escapeHtml(grp.id)}"${shouldOpen ? ' open' : ''}>`,
                `  <summary class="doc-tree-summary"><span class="material-symbols-outlined doc-tree-chevron" aria-hidden="true">chevron_right</span><span${titleClass}>${escapeHtml(grp.title)}</span></summary>`,
                `  <div class="doc-tree-items">${linksHtml}</div>`,
                '</details>'
            ].join(''));
        }
        if (groupHtmls.length > 0) {
            sidebarSections.push(`<div class="doc-tree-section"><div class="doc-tree-section-title">${escapeHtml(category.label)}</div>${groupHtmls.join('')}</div>`);
        }
    }

    // 狀態與權限橫幅
    let statusHtml = '';
    if (item.status) {
        const variant = item.status.variant || 'free';
        const iconMap = { free: 'verified_user', perm: 'shield', caution: 'warning' };
        const permsHtml = (item.status.permissions || []).map((p) => `<code class="doc-perm-chip">${escapeHtml(p)}</code>`).join('');
        const envsHtml = (item.status.envs || []).map((e) => `<span class="doc-env-badge is-supported">${escapeHtml(e)}</span>`).join('');
        const verHtml = `<span class="doc-env-badge">${escapeHtml(apiVersion)}</span>`;
        statusHtml = [
            `<div class="doc-status-banner is-${escapeHtml(variant)}">`,
            `  <div class="doc-status-left"><span class="material-symbols-outlined doc-status-icon" aria-hidden="true">${iconMap[variant] || 'shield'}</span><span class="doc-status-label">${escapeHtml(item.status.label || 'API 狀態')}</span>${permsHtml}</div>`,
            `  <div class="doc-status-right">${envsHtml}${verHtml}</div>`,
            '</div>'
        ].join('');
    }

    // 上一篇 / 下一篇
    const prevItem = itemIndex > 0 ? DOC_ITEMS[itemIndex - 1] : null;
    const nextItem = itemIndex < DOC_ITEMS.length - 1 ? DOC_ITEMS[itemIndex + 1] : null;
    let pagerHtml = '';
    if (prevItem || nextItem) {
        const prevCard = prevItem
            ? `<a class="doc-pager-card" href="./${escapeHtml(prevItem.id)}.html"><span class="doc-pager-dir">上一篇</span><span class="doc-pager-title">${escapeHtml(prevItem.codeTitle || prevItem.title)}</span></a>`
            : '<div></div>';
        const nextCard = nextItem
            ? `<a class="doc-pager-card is-next" href="./${escapeHtml(nextItem.id)}.html"><span class="doc-pager-dir">下一篇</span><span class="doc-pager-title">${escapeHtml(nextItem.codeTitle || nextItem.title)}</span></a>`
            : '';
        pagerHtml = `<nav class="doc-pager" aria-label="前後詞條導覽">${prevCard}${nextCard}</nav>`;
    }

    // 本頁目錄
    const tocHtml = tocEntries.map((entry, idx) => {
        const activeClass = idx === 0 ? ' is-active' : '';
        return `<li><a class="doc-toc-link${activeClass}" href="#${escapeHtml(entry.id)}" data-target-id="${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</a></li>`;
    }).join('');

    // 結構化資料 JSON-LD
    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: item.codeTitle ? `${item.codeTitle} - ${item.title}` : item.title,
        description: item.subtitle || '',
        inLanguage: 'zh-Hant',
        url: `${DOC_BASE_URL}/${item.id}.html`,
        isPartOf: {
            '@type': 'WebSite',
            name: 'Web mai Chart X 插件開發者手冊',
            url: `${DOC_BASE_URL}/`
        }
    }).replace(/</g, '\\u003c');

    // <head> 最前面同步執行的舊版 #id 轉址腳本（與 doc/index.html 共用 doc-ids.js 白名單）
    const hashRedirectScript = `<script src="./doc-ids.js"></script>\n    <script>(function(){var h=window.location.hash||'';if(h.length<2)return;var id;try{id=decodeURIComponent(h.slice(1));}catch(_){return;}if(!id||id.indexOf('sec-')===0||id===${JSON.stringify(item.id)})return;var valid=window.__DOC_IDS__;if(Array.isArray(valid)&&valid.indexOf(id)!==-1){window.location.replace('./'+encodeURIComponent(id)+'.html');}})();</script>`;

    const pageTitle = `${item.codeTitle || item.title} - Web mai Chart X 插件開發者手冊`;
    const metaDesc = item.subtitle || 'Web mai Chart X 插件開發者 API 參考文件';

    return `<!DOCTYPE html>
<html lang="zh-Hant">

<head>
    ${hashRedirectScript}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="description" content="${escapeHtml(metaDesc)}">
    <title>${escapeHtml(pageTitle)}</title>
    <link rel="canonical" href="${escapeHtml(`${DOC_BASE_URL}/${item.id}.html`)}">
    <link rel="alternate" type="text/markdown" href="./md/${escapeHtml(item.id)}.md" title="Markdown 原文">
    <link rel="alternate" type="text/markdown" href="./llms.txt" title="LLM Documentation Index">
    <link rel="alternate" type="text/markdown" href="./llms-full.txt" title="LLM Full Documentation">
    <link rel="icon" type="image/x-icon" href="../favicon.ico">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200">

    <link rel="stylesheet" href="../Styles/popup.css">
    <link rel="stylesheet" href="./doc.css">
    <script type="application/ld+json">${jsonLd}</script>
</head>

<body data-doc-id="${escapeHtml(item.id)}" data-md-url="./md/${escapeHtml(item.id)}.md">
    <a class="doc-skip-link" href="#docMainHeading">跳至主要內容</a>

    <header class="doc-topbar">
        <div class="doc-topbar-left">
            <button type="button" id="mobileMenuBtn" class="doc-icon-btn doc-mobile-only" aria-label="開啟側邊導覽" aria-expanded="false" aria-controls="docSidebar">
                <span class="material-symbols-outlined" aria-hidden="true">menu</span>
            </button>
            <a href="./index.html" class="doc-brand" id="brandHomeLink">
                <img src="../favicon.png" alt="Web mai Chart X" width="24" height="24" class="doc-brand-icon">
                <span class="doc-brand-title">WMCX</span>
                <span class="doc-brand-badge">Plugin API</span>
            </a>
        </div>

        <nav class="doc-topnav" id="topCategoryNav" aria-label="手冊主分類">${topNavHtml}</nav>

        <div class="doc-topbar-right">
            <search class="doc-search-wrap" id="globalSearchWrap">
                <span class="material-symbols-outlined doc-search-icon" aria-hidden="true">search</span>
                <input type="search" id="globalSearchInput" class="doc-search-input" placeholder="搜尋 API、權限或主題..." aria-label="全站搜尋文件" autocomplete="off" spellcheck="false">
                <kbd class="doc-search-kbd" aria-hidden="true">/</kbd>
                <div id="globalSearchResults" class="doc-search-results" role="listbox" aria-label="搜尋結果" hidden></div>
            </search>

            <a href="../index.html" class="doc-action-link">
                <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                <span class="doc-action-text">返回編輯器</span>
            </a>
        </div>
    </header>

    <div class="doc-breadcrumb-bar" id="docBreadcrumbBar">
        <nav id="breadcrumbNav" class="doc-breadcrumb" aria-label="目前位置">${crumbs.join('')}</nav>
        <div class="doc-breadcrumb-meta">
            <span class="doc-meta-pill">${escapeHtml(apiVersion)}</span>
            <a href="./llms.txt" class="doc-meta-link"><span>llms.txt</span></a>
            <a href="../_play/" target="_blank" rel="noopener noreferrer" class="doc-meta-link">
                <span>遊玩模式</span>
                <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            </a>
        </div>
    </div>

    <div class="doc-backdrop" id="sidebarBackdrop" hidden></div>

    <div class="doc-layout">
        <aside id="docSidebar" class="doc-sidebar" aria-label="文件樹狀目錄">
            <search class="doc-sidebar-filter">
                <span class="material-symbols-outlined doc-filter-icon" aria-hidden="true">filter_alt</span>
                <input type="text" id="sidebarFilterInput" class="doc-filter-input" placeholder="篩選條目..." aria-label="篩選側邊欄條目" autocomplete="off" spellcheck="false">
                <button type="button" id="sidebarFilterClear" class="doc-filter-clear" aria-label="清除篩選" hidden>
                    <span class="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
            </search>

            <div class="doc-sidebar-scroll">
                <div class="doc-sidebar-header-row">
                    <span class="doc-sidebar-heading">參考目錄</span>
                    <button type="button" id="toggleAllGroupsBtn" class="doc-text-btn">全部展開</button>
                </div>
                <nav id="sidebarNav" class="doc-tree" data-full-tree="true" aria-label="API 與文件索引">${sidebarSections.join('')}</nav>
                <div id="sidebarEmptyState" class="doc-sidebar-empty" hidden>找不到符合篩選條件的條目。</div>
            </div>
        </aside>

        <main class="doc-main" id="docMain">
            <article id="docArticle" class="doc-article">
                <header class="doc-article-header">
                    <div class="doc-article-eyebrow">
                        ${cat ? `<span class="doc-eyebrow-tag">${escapeHtml(cat.label)}</span>` : ''}
                        ${item.badge ? `<span class="doc-eyebrow-tag">${escapeHtml(item.badge)}</span>` : ''}
                        <span class="doc-stability-badge is-${escapeHtml(stabilityClass)}">${escapeHtml(stability)}</span>
                        <span class="doc-eyebrow-tag">${escapeHtml(apiVersion)}</span>
                        <div class="doc-md-actions">
                            <a class="doc-md-action-btn" href="./md/${escapeHtml(item.id)}.md">檢視 Markdown</a>
                            <button type="button" class="doc-md-action-btn" id="copyPageMdBtn">
                                <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                                <span>複製 Markdown</span>
                            </button>
                        </div>
                    </div>
                    <h1 class="doc-article-title" id="docMainHeading" tabindex="-1">
                        ${item.codeTitle ? `<code class="doc-title-code">${escapeHtml(item.codeTitle)}</code>` : ''}
                        <span>${escapeHtml(item.title)}</span>
                    </h1>
                    ${item.subtitle ? `<p class="doc-article-subtitle">${renderInlineCodeHtml(item.subtitle)}</p>` : ''}
                </header>

                ${statusHtml}
                ${sectionsHtml.join('\n')}
                ${pagerHtml}
            </article>
        </main>

        <aside class="doc-toc" aria-label="本頁目錄">
            <div class="doc-toc-sticky">
                <h2 class="doc-toc-title">本頁目錄</h2>
                <nav aria-label="章節錨點">
                    <ul id="tocList" class="doc-toc-list">${tocHtml}</ul>
                </nav>
            </div>
        </aside>
    </div>

    <script type="module" src="./doc.js"></script>
</body>

</html>
`;
}

/**
 * 依 API 分類分組產出 doc/llms.txt（全程使用絕對網址）
 * @returns {string}
 */
function buildDocLlmsTxt() {
    const coreNoticeLines = (Array.isArray(DOC_CORE_NOTICES) ? DOC_CORE_NOTICES : []).map(
        (n) => `- **${n.label}**：${n.text}`
    );
    const lines = [
        '# Web mai Chart X 插件開發者手冊',
        '',
        '> 本手冊僅面向 Web mai Chart X 第三方插件開發者，提供完整插件 API 參考、生命週期、權限清單、離線錄影渲染與 WERP 儲存庫協定，並非譜面寫譜教學。',
        '',
        '## 核心提醒',
        '',
        ...coreNoticeLines,
        '',
        '## 全域檔案端點',
        '',
        `- [單檔完整手冊全文](${DOC_BASE_URL}/llms-full.txt): 一次讀取全部 ${DOC_ITEMS.length} 篇插件 API 與規範文件`,
        `- [手冊網頁首頁](${DOC_BASE_URL}/): 靜態多頁開發者手冊網站入口`,
        `- [網站地圖](${DOC_BASE_URL}/sitemap.xml): 全部 ${DOC_ITEMS.length} 個靜態詞條網址清單`,
        ''
    ];

    const sectionMapping = [
        { title: '開發入門與插件封裝', groupIds: ['group-guide'] },
        { title: '核心物件 ctx', groupIds: ['group-ctx-base'] },
        { title: '專案資料與編輯器介面', groupIds: ['group-ctx-editor', 'group-ctx-chart', 'group-ctx-view'] },
        { title: '播放與時間軸控制', groupIds: ['group-ctx-playback'] },
        { title: '畫布渲染與離線影片錄製', groupIds: ['group-ctx-render'] },
        { title: '指令、事件與設定面板', groupIds: ['group-ctx-commands', 'group-ctx-events', 'group-events-schema'] },
        { title: '使用者介面擴充', groupIds: ['group-ctx-ui'] },
        { title: '儲存、多語系、設定與素材覆寫', groupIds: ['group-ctx-storage', 'group-ctx-i18n', 'group-ctx-settings', 'group-ctx-assets'] },
        { title: 'WERP 儲存庫協定與系統架構', groupIds: ['group-werp', 'group-architecture'] }
    ];

    const coveredGroups = new Set();
    for (const sec of sectionMapping) {
        const secItems = [];
        for (const gid of sec.groupIds) {
            coveredGroups.add(gid);
            for (const item of DOC_ITEMS) {
                if (item.groupId === gid) secItems.push(item);
            }
        }
        if (secItems.length === 0) continue;
        lines.push(`## ${sec.title}`);
        lines.push('');
        for (const item of secItems) {
            const { stability, apiVersion } = getItemMetadata(item);
            const titleText = item.codeTitle ? `${item.codeTitle} - ${item.title}` : item.title;
            const desc = (item.subtitle || '').replace(/\s+/g, ' ').trim();
            lines.push(`- [${titleText}](${DOC_BASE_URL}/md/${item.id}.md): ${desc} 標籤 \`${stability}\` · \`${apiVersion}\``);
        }
        lines.push('');
    }

    // 自動收錄未來在 docData.js 新增的其他群組，無須手動更新建置腳本
    for (const group of DOC_GROUPS) {
        if (coveredGroups.has(group.id)) continue;
        const items = DOC_ITEMS.filter((it) => it.groupId === group.id);
        if (items.length === 0) continue;
        const cat = CATEGORY_MAP.get(group.category);
        lines.push(`## ${cat ? `${cat.label} - ${group.title}` : group.title}`);
        lines.push('');
        for (const item of items) {
            const { stability, apiVersion } = getItemMetadata(item);
            const titleText = item.codeTitle ? `${item.codeTitle} - ${item.title}` : item.title;
            const desc = (item.subtitle || '').replace(/\s+/g, ' ').trim();
            lines.push(`- [${titleText}](${DOC_BASE_URL}/md/${item.id}.md): ${desc} 標籤 \`${stability}\` · \`${apiVersion}\``);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * 產出單檔完整 Markdown (doc/llms-full.txt)
 * @returns {string}
 */
function buildLlmsFullTxt() {
    const lines = [
        '# Web mai Chart X 插件開發者手冊完整版',
        '',
        `> 官方手冊首頁: ${DOC_BASE_URL}/`,
        `> AI 索引檔案: ${DOC_BASE_URL}/llms.txt`,
        `> 總詞條數: ${DOC_ITEMS.length}`,
        '',
        '---',
        ''
    ];

    for (const item of DOC_ITEMS) {
        lines.push(renderItemMarkdown(item, 2));
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * 產出精簡前端搜尋索引 doc/search-index.json
 * @returns {string}
 */
function buildSearchIndexJson() {
    const records = DOC_ITEMS.map((item) => {
        const cat = CATEGORY_MAP.get(item.category);
        const group = GROUP_MAP.get(item.groupId);
        const { stability, apiVersion } = getItemMetadata(item);
        return {
            id: item.id,
            title: item.title,
            codeTitle: item.codeTitle || '',
            sidebarLabel: item.sidebarLabel || item.title,
            sidebarMono: Boolean(item.sidebarMono),
            badge: item.badge || '',
            subtitle: item.subtitle || '',
            category: item.category,
            categoryLabel: cat ? cat.label : item.category,
            groupId: item.groupId,
            groupTitle: group ? group.title : '',
            groupMono: Boolean(group?.mono),
            defaultOpen: Boolean(group?.defaultOpen),
            stability,
            apiVersion,
            permissions: item.status?.permissions || [],
            keywords: (item.overview || []).join(' '),
            url: `./${item.id}.html`,
            mdUrl: `./md/${item.id}.md`
        };
    });
    return JSON.stringify({
        categories: DOC_CATEGORIES,
        groups: DOC_GROUPS,
        items: records
    });
}

/**
 * 產出 XML Sitemap (doc/sitemap.xml)
 * @returns {string}
 */
function buildSitemapXml() {
    const urls = [
        `${DOC_BASE_URL}/`,
        ...DOC_ITEMS.map((item) => `${DOC_BASE_URL}/${item.id}.html`)
    ];
    const entries = urls
        .map((u) => `  <url>\n    <loc>${escapeHtml(u)}</loc>\n  </url>`)
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/**
 * 移除 Markdown 中的圍欄程式碼區塊（``` 或更長反引號圍欄），避免連結驗證誤掃程式碼片段
 * @param {string} mdContent
 * @returns {string}
 */
function stripMarkdownFences(mdContent) {
    const lines = String(mdContent ?? '').split(/\r?\n/);
    const kept = [];
    let inFence = false;
    let fenceTicks = 0;

    for (const line of lines) {
        const fenceMatch = line.match(/^(`{3,})/);
        if (fenceMatch) {
            const ticks = fenceMatch[1].length;
            if (!inFence) {
                inFence = true;
                fenceTicks = ticks;
                continue;
            }
            if (ticks >= fenceTicks && line.trim() === '`'.repeat(ticks)) {
                inFence = false;
                fenceTicks = 0;
                continue;
            }
        }
        if (!inFence) {
            kept.push(line);
        }
    }
    return kept.join('\n');
}

/**
 * 驗證 Markdown 表格未出現未跳脫的管線字元導致欄位數量異常
 * @param {string} mdContent
 * @param {string} fileLabel
 * @param {Array<string>} errors
 */
function validateMarkdownTables(mdContent, fileLabel, errors) {
    const lines = mdContent.split(/\r?\n/);
    let inFence = false;
    let fenceTicks = 0;
    let expectedCols = null;

    const countUnescapedPipes = (line) => {
        let count = 0;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '\\' && i + 1 < line.length) {
                i++;
                continue;
            }
            if (line[i] === '|') count++;
        }
        return count;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(/^(`{3,})/);
        if (fenceMatch) {
            const ticks = fenceMatch[1].length;
            if (!inFence) {
                inFence = true;
                fenceTicks = ticks;
            } else if (ticks >= fenceTicks && line.trim() === '`'.repeat(ticks)) {
                inFence = false;
                fenceTicks = 0;
            }
            continue;
        }
        if (inFence) continue;

        if (line.startsWith('|') && line.endsWith('|')) {
            const colCount = countUnescapedPipes(line) - 1;
            if (expectedCols === null) {
                expectedCols = colCount;
            } else if (colCount !== expectedCols) {
                errors.push(`[MD 表格驗證失敗] ${fileLabel} 第 ${i + 1} 行欄位數異常（預期 ${expectedCols}，實際 ${colCount}）`);
            }
        } else {
            expectedCols = null;
        }
    }
}

/**
 * 執行完整產出與一致性檢查，失敗則回傳非零結束碼中止 CI
 */
function runBuildAndValidate() {
    if (!Array.isArray(DOC_ITEMS) || DOC_ITEMS.length === 0) {
        console.error('[build-docs] DOC_ITEMS 為空，無法建置文件');
        process.exit(1);
    }

    // 清理既有衍生 HTML 與 md 檔案（保留 index.html、doc.js、doc.css、docData.js，並避免刪除目錄本體觸發 Windows EPERM 鎖定）
    for (const entry of fs.readdirSync(DOC_DIR, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html') {
            fs.unlinkSync(path.join(DOC_DIR, entry.name));
        }
    }
    fs.mkdirSync(MD_DIR, { recursive: true });
    for (const entry of fs.readdirSync(MD_DIR, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
            fs.unlinkSync(path.join(MD_DIR, entry.name));
        }
    }

    const allIds = DOC_ITEMS.map((item) => item.id);
    const errors = [];
    const missingFieldWarnings = [];

    // 檢查 ID 唯一性（含大小寫衝突）、保留名稱與基本格式
    const seenIds = new Set();
    const seenLowerIds = new Map();
    for (const item of DOC_ITEMS) {
        if (!item.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(item.id)) {
            errors.push(`[ID 格式錯誤] 無效的詞條識別碼: "${item.id}"`);
        }
        if (String(item.id).toLowerCase() === 'index') {
            errors.push('[ID 保留字衝突] 詞條識別碼不得為 "index"（與手寫入口頁 index.html 衝突）');
        }
        if (seenIds.has(item.id)) {
            errors.push(`[ID 重複] 重複的詞條識別碼: "${item.id}"`);
        } else {
            const lower = String(item.id).toLowerCase();
            if (seenLowerIds.has(lower)) {
                errors.push(`[ID 大小寫衝突] 詞條 "${item.id}" 與 "${seenLowerIds.get(lower)}" 僅大小寫不同`);
            } else {
                seenLowerIds.set(lower, item.id);
            }
        }
        seenIds.add(item.id);
        for (const refId of item.seeAlso || []) {
            if (!ITEM_MAP.has(refId)) {
                errors.push(`[參閱連結錯誤] 詞條 "${item.id}" 的 seeAlso 指向不存在的 ID: "${refId}"`);
            }
        }

        // 檢查必要標註欄位（僅警告，不中止建置）
        const missingFields = [];
        const rawStab = typeof item.stability === 'string' ? item.stability.trim().toLowerCase() : '';
        if (!STABILITY_LABELS[rawStab]) missingFields.push('stability');
        if (!(item.status?.apiVersion || item.summary?.since)) missingFields.push('apiVersion');
        if (!item.summary?.async) missingFields.push('summary.async');
        if (!item.summary?.permission) missingFields.push('summary.permission');
        if (!item.summary?.constant) missingFields.push('summary.constant');
        if (!item.summary?.runtime) missingFields.push('summary.runtime');
        if (missingFields.length > 0) {
            missingFieldWarnings.push({ id: item.id, fields: missingFields });
        }
    }

    // 寫入共用的同步轉址白名單腳本 doc/doc-ids.js
    fs.writeFileSync(
        path.join(DOC_DIR, 'doc-ids.js'),
        `window.__DOC_IDS__ = ${JSON.stringify(allIds)};\n`,
        'utf8'
    );

    // 寫入全部詞條 HTML 與 Markdown
    DOC_ITEMS.forEach((item, index) => {
        const mdContent = renderItemMarkdown(item, 1);
        const htmlContent = renderItemHtml(item, index);
        fs.writeFileSync(path.join(MD_DIR, `${item.id}.md`), mdContent, 'utf8');
        fs.writeFileSync(path.join(DOC_DIR, `${item.id}.html`), htmlContent, 'utf8');
    });

    // 寫入 llms.txt、llms-full.txt、search-index.json、sitemap.xml
    fs.writeFileSync(path.join(DOC_DIR, 'llms.txt'), buildDocLlmsTxt(), 'utf8');
    fs.writeFileSync(path.join(DOC_DIR, 'llms-full.txt'), buildLlmsFullTxt(), 'utf8');
    fs.writeFileSync(path.join(DOC_DIR, 'search-index.json'), buildSearchIndexJson(), 'utf8');
    fs.writeFileSync(path.join(DOC_DIR, 'sitemap.xml'), buildSitemapXml(), 'utf8');

    // ---------------- 自動化驗證 ----------------
    // 1. 驗證每個詞條皆有對應 html 與 md
    for (const item of DOC_ITEMS) {
        const htmlPath = path.join(DOC_DIR, `${item.id}.html`);
        const mdPath = path.join(MD_DIR, `${item.id}.md`);
        if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
            errors.push(`[產出缺失] 找不到或為空的 HTML: doc/${item.id}.html`);
        }
        if (!fs.existsSync(mdPath) || fs.statSync(mdPath).size === 0) {
            errors.push(`[產出缺失] 找不到或為空的 Markdown: doc/md/${item.id}.md`);
        } else {
            const md = fs.readFileSync(mdPath, 'utf8');
            if (!md.includes(item.title)) {
                errors.push(`[內容不一致] doc/md/${item.id}.md 缺少標題 "${item.title}"`);
            }
            if (item.subtitle && !md.includes(item.subtitle)) {
                errors.push(`[內容不一致] doc/md/${item.id}.md 缺少副標題`);
            }
            validateMarkdownTables(md, `doc/md/${item.id}.md`, errors);
        }
    }

    // 2. 驗證所有 HTML 檔案（含手寫 doc/index.html）的連結與資源路徑
    const htmlFiles = fs.readdirSync(DOC_DIR).filter((name) => name.endsWith('.html'));
    const attrRegex = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

    for (const fileName of htmlFiles) {
        const filePath = path.join(DOC_DIR, fileName);
        const content = fs.readFileSync(filePath, 'utf8');

        // 忽略 <script> 與 <style> 內容後再掃描屬性，避免 JS 字串誤判
        const htmlWithoutScripts = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

        let match;
        attrRegex.lastIndex = 0;
        while ((match = attrRegex.exec(htmlWithoutScripts)) !== null) {
            const rawTarget = match[1].trim();
            if (!rawTarget) continue;

            if (rawTarget.startsWith('/')) {
                errors.push(`[禁用根路徑] doc/${fileName} 包含以 / 開頭的連結: "${rawTarget}"`);
                continue;
            }

            if (/^(https?:|mailto:|data:|javascript:)/i.test(rawTarget)) {
                continue;
            }

            if (rawTarget.startsWith('#')) {
                const anchorId = rawTarget.slice(1);
                if (anchorId && !content.includes(`id="${anchorId}"`)) {
                    errors.push(`[錨點缺失] doc/${fileName} 內頁錨點 #${anchorId} 不存在對應元素`);
                }
                continue;
            }

            const cleanRel = rawTarget.split('#')[0].split('?')[0];
            if (!cleanRel) continue;

            const resolved = path.resolve(DOC_DIR, cleanRel);
            const targetFile = cleanRel.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
            if (!fs.existsSync(targetFile)) {
                errors.push(`[斷鏈錯誤] doc/${fileName} 引用了不存在的目標: "${rawTarget}" -> ${path.relative(ROOT_DIR, targetFile)}`);
            }
        }
    }

    // 3. 驗證 llms.txt、doc/llms.txt、doc/llms-full.txt 與 doc/sitemap.xml 絕對網址與目標存在性
    const absPrefix = `${SITE_BASE_URL}/`;
    const mdLinkRegex = /\[[^\]]+\]\(([^)\s]+)\)/g;
    for (const relFile of ['llms.txt', 'doc/llms.txt', 'doc/llms-full.txt']) {
        const fullPath = path.join(ROOT_DIR, relFile);
        if (!fs.existsSync(fullPath)) {
            errors.push(`[產出缺失] 找不到 ${relFile}`);
            continue;
        }
        const rawText = fs.readFileSync(fullPath, 'utf8');
        const textWithoutFences = stripMarkdownFences(rawText);
        let m;
        mdLinkRegex.lastIndex = 0;
        while ((m = mdLinkRegex.exec(textWithoutFences)) !== null) {
            const url = m[1];
            if (!url.startsWith(absPrefix)) {
                errors.push(`[網址格式錯誤] ${relFile} 內含非標準絕對網址連結: "${url}"`);
                continue;
            }
            const subPath = url.slice(absPrefix.length);
            const targetPath = subPath === '' || subPath.endsWith('/')
                ? path.join(ROOT_DIR, subPath, 'index.html')
                : path.join(ROOT_DIR, subPath);
            if (!fs.existsSync(targetPath)) {
                errors.push(`[絕對連結斷鏈] ${relFile} 指向不存在目標: "${url}"`);
            }
        }
    }

    const sitemapPath = path.join(DOC_DIR, 'sitemap.xml');
    const sitemapText = fs.readFileSync(sitemapPath, 'utf8');
    const locRegex = /<loc>([^<]+)<\/loc>/g;
    let locMatch;
    while ((locMatch = locRegex.exec(sitemapText)) !== null) {
        const url = locMatch[1].trim();
        if (!url.startsWith(absPrefix)) {
            errors.push(`[Sitemap 網址錯誤] doc/sitemap.xml 包含非絕對網址: "${url}"`);
            continue;
        }
        const subPath = url.slice(absPrefix.length);
        const targetPath = subPath.endsWith('/')
            ? path.join(ROOT_DIR, subPath, 'index.html')
            : path.join(ROOT_DIR, subPath);
        if (!fs.existsSync(targetPath)) {
            errors.push(`[Sitemap 斷鏈] doc/sitemap.xml 指向不存在檔案: "${url}"`);
        }
    }

    if (missingFieldWarnings.length > 0) {
        console.warn(`[build-docs] 欄位缺漏警告（共 ${missingFieldWarnings.length} 筆詞條，HTML 與 MD 已標示為「未標註」）：`);
        for (const w of missingFieldWarnings) {
            console.warn(`  - ${w.id}: 缺少 ${w.fields.join(', ')}`);
        }
    } else {
        console.log('[build-docs] 欄位標註檢查通過：所有詞條皆已完整標註 stability、apiVersion 與 summary 欄位。');
    }

    if (errors.length > 0) {
        console.error(`[build-docs] 驗證失敗，共發現 ${errors.length} 項錯誤：`);
        for (const err of errors) {
            console.error(`  - ${err}`);
        }
        process.exit(1);
    }

    console.log(
        `[build-docs] 建置與驗證成功：已產出 ${DOC_ITEMS.length} 份 HTML 與 Markdown、doc/llms.txt、doc/llms-full.txt、doc/search-index.json 與 doc/sitemap.xml`
    );
}

runBuildAndValidate();
