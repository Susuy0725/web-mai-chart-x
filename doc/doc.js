/**
 * @file doc.js
 * @description Web mai Chart X 開發者手冊互動控制器與安全詞條渲染器。
 */

import { DOC_CATEGORIES, DOC_GROUPS, DOC_ITEMS } from './docData.js';

const ITEM_MAP = new Map(DOC_ITEMS.map((item) => [item.id, item]));
const GROUP_MAP = new Map(DOC_GROUPS.map((group) => [group.id, group]));
const CATEGORY_MAP = new Map(DOC_CATEGORIES.map((cat) => [cat.id, cat]));

const DEFAULT_DOC_ID = DOC_ITEMS[0]?.id || 'guide-overview';

const openGroupIds = new Set(
    DOC_GROUPS.filter((group) => group.defaultOpen).map((group) => group.id)
);

const state = {
    currentDocId: DEFAULT_DOC_ID,
    filterText: '',
    tocEntries: [],
    searchMatches: [],
    searchActiveIndex: -1,
    allExpanded: false
};

let codeBlockCounter = 0;
const mobileSidebarMql = window.matchMedia('(max-width: 840px)');

const dom = {
    brandHomeLink: document.getElementById('brandHomeLink'),
    topNav: document.getElementById('topCategoryNav'),
    breadcrumbBar: document.getElementById('docBreadcrumbBar'),
    breadcrumb: document.getElementById('breadcrumbNav'),
    sidebar: document.getElementById('docSidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebarFilterInput: document.getElementById('sidebarFilterInput'),
    sidebarFilterClear: document.getElementById('sidebarFilterClear'),
    toggleAllGroupsBtn: document.getElementById('toggleAllGroupsBtn'),
    sidebarNav: document.getElementById('sidebarNav'),
    sidebarEmpty: document.getElementById('sidebarEmptyState'),
    main: document.getElementById('docMain'),
    article: document.getElementById('docArticle'),
    toc: document.querySelector('.doc-toc'),
    tocList: document.getElementById('tocList'),
    searchWrap: document.getElementById('globalSearchWrap'),
    searchInput: document.getElementById('globalSearchInput'),
    searchResults: document.getElementById('globalSearchResults')
};

/**
 * 建立 DOM 元素的簡潔工廠函式
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') {
        node.textContent = text;
    }
    return node;
}

/**
 * 建立 Material Symbols 圖示節點
 * @param {string} iconName
 * @param {string} [className]
 * @returns {HTMLSpanElement}
 */
function createIcon(iconName, className = '') {
    const span = el('span', `material-symbols-outlined ${className}`.trim(), iconName);
    span.setAttribute('aria-hidden', 'true');
    return span;
}

/**
 * 安全渲染包含反引號行內程式碼的純文字內容，不解析 HTML
 * @param {HTMLElement} container
 * @param {string} text
 */
function appendFormattedText(container, text) {
    const source = String(text ?? '');
    const parts = source.split(/(`[^`]+`)/g);
    for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            const codeEl = el('code', 'doc-inline-code', part.slice(1, -1));
            container.appendChild(codeEl);
        } else {
            container.appendChild(document.createTextNode(part));
        }
    }
}

/**
 * 複製文字至系統剪貼簿並支援降級方案
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 降級至選取複製方案
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    textarea.remove();
    return ok;
}

/**
 * 渲染頂部主分類導覽鈕
 * @param {string} activeCategoryId
 */
function renderTopNav(activeCategoryId) {
    dom.topNav.replaceChildren();
    for (const category of DOC_CATEGORIES) {
        const btn = el('button', 'doc-topnav-btn', category.label);
        btn.type = 'button';
        if (category.id === activeCategoryId) {
            btn.classList.add('is-active');
            btn.setAttribute('aria-current', 'page');
        }
        btn.addEventListener('click', () => {
            navigateToDoc(category.defaultDocId);
        });
        dom.topNav.appendChild(btn);
    }
}

/**
 * 渲染次級麵包屑導覽列
 * @param {Object} item
 */
function renderBreadcrumb(item) {
    dom.breadcrumb.replaceChildren();

    const homeBtn = el('button', 'doc-crumb-btn', 'WMCX');
    homeBtn.type = 'button';
    homeBtn.addEventListener('click', () => navigateToDoc(DEFAULT_DOC_ID));
    dom.breadcrumb.appendChild(homeBtn);

    const category = CATEGORY_MAP.get(item.category);
    if (category) {
        dom.breadcrumb.appendChild(createIcon('chevron_right', 'doc-crumb-sep'));
        const catBtn = el('button', 'doc-crumb-btn', category.label);
        catBtn.type = 'button';
        catBtn.addEventListener('click', () => navigateToDoc(category.defaultDocId));
        dom.breadcrumb.appendChild(catBtn);
    }

    const group = GROUP_MAP.get(item.groupId);
    if (group && group.mono) {
        const groupOverviewId = group.title;
        if (ITEM_MAP.has(groupOverviewId) && groupOverviewId !== item.id) {
            dom.breadcrumb.appendChild(createIcon('chevron_right', 'doc-crumb-sep'));
            const groupBtn = el('button', 'doc-crumb-btn', group.title);
            groupBtn.type = 'button';
            groupBtn.addEventListener('click', () => navigateToDoc(groupOverviewId));
            dom.breadcrumb.appendChild(groupBtn);
        }
    }

    dom.breadcrumb.appendChild(createIcon('chevron_right', 'doc-crumb-sep'));
    const currentLabel = item.codeTitle || item.title;
    dom.breadcrumb.appendChild(el('span', 'doc-crumb-current', currentLabel));
}

/**
 * 檢查詞條是否符合側邊欄篩選關鍵字
 * @param {Object} item
 * @param {string} queryLower
 * @returns {boolean}
 */
function matchesSidebarFilter(item, queryLower) {
    if (!queryLower) return true;
    const fields = [
        item.title,
        item.codeTitle || '',
        item.sidebarLabel,
        item.subtitle || '',
        ...(item.status?.permissions || [])
    ];
    return fields.some((field) => field.toLowerCase().includes(queryLower));
}

/**
 * 渲染左側樹狀索引導覽
 */
function renderSidebar() {
    dom.sidebarNav.replaceChildren();
    const query = state.filterText.trim().toLowerCase();
    const isFiltering = query.length > 0;
    let totalMatched = 0;

    for (const category of DOC_CATEGORIES) {
        const catGroups = DOC_GROUPS.filter((group) => group.category === category.id);
        const visibleGroups = [];

        for (const group of catGroups) {
            const groupItems = DOC_ITEMS.filter(
                (item) => item.groupId === group.id && matchesSidebarFilter(item, query)
            );
            if (groupItems.length > 0) {
                visibleGroups.push({ group, items: groupItems });
                totalMatched += groupItems.length;
            }
        }

        if (visibleGroups.length === 0) continue;

        const sectionEl = el('div', 'doc-tree-section');
        sectionEl.appendChild(el('div', 'doc-tree-section-title', category.label));

        for (const { group, items } of visibleGroups) {
            const detailsEl = el('details', 'doc-tree-group');
            const shouldOpen = isFiltering || openGroupIds.has(group.id);
            detailsEl.open = shouldOpen;

            detailsEl.addEventListener('toggle', () => {
                if (state.filterText.trim()) return;
                if (detailsEl.open) {
                    openGroupIds.add(group.id);
                } else {
                    openGroupIds.delete(group.id);
                }
                syncToggleAllButtonText();
            });

            const summaryEl = el('summary', 'doc-tree-summary');
            summaryEl.appendChild(createIcon('chevron_right', 'doc-tree-chevron'));
            const titleSpan = el(
                'span',
                group.mono ? 'doc-tree-group-code' : '',
                group.title
            );
            summaryEl.appendChild(titleSpan);
            detailsEl.appendChild(summaryEl);

            const itemsContainer = el('div', 'doc-tree-items');
            for (const item of items) {
                const link = el('a', 'doc-tree-link');
                link.href = `#${item.id}`;
                if (item.id === state.currentDocId) {
                    link.classList.add('is-active');
                    link.setAttribute('aria-current', 'page');
                }

                const labelSpan = el(
                    'span',
                    item.sidebarMono ? 'doc-tree-link-label is-mono' : 'doc-tree-link-label',
                    item.sidebarLabel
                );
                link.appendChild(labelSpan);

                if (item.badge) {
                    link.appendChild(el('span', 'doc-tree-pill', item.badge));
                }

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigateToDoc(item.id);
                    closeMobileSidebar(false);
                });

                itemsContainer.appendChild(link);
            }

            detailsEl.appendChild(itemsContainer);
            sectionEl.appendChild(detailsEl);
        }

        dom.sidebarNav.appendChild(sectionEl);
    }

    dom.sidebarEmpty.hidden = totalMatched > 0;
    syncToggleAllButtonText();
}

function syncToggleAllButtonText() {
    const allOpen = DOC_GROUPS.every((g) => openGroupIds.has(g.id));
    state.allExpanded = allOpen;
    dom.toggleAllGroupsBtn.textContent = allOpen ? '全部收合' : '全部展開';
}

/**
 * 渲染原站毛玻璃風格的狀態與權限橫幅
 * @param {Object} status
 * @returns {HTMLElement}
 */
function renderStatusBanner(status) {
    const variant = status?.variant || 'free';
    const banner = el('div', `doc-status-banner is-${variant}`);

    const left = el('div', 'doc-status-left');
    const iconMap = {
        free: 'verified_user',
        perm: 'shield',
        caution: 'warning'
    };
    left.appendChild(createIcon(iconMap[variant] || 'shield', 'doc-status-icon'));
    left.appendChild(el('span', 'doc-status-label', status?.label || 'API 狀態'));

    for (const perm of status?.permissions || []) {
        left.appendChild(el('code', 'doc-perm-chip', perm));
    }

    const right = el('div', 'doc-status-right');
    for (const env of status?.envs || []) {
        right.appendChild(el('span', 'doc-env-badge is-supported', env));
    }
    if (status?.apiVersion) {
        right.appendChild(el('span', 'doc-env-badge', status.apiVersion));
    }

    banner.append(left, right);
    return banner;
}

/**
 * 建立章節標題並註冊至右側目錄清單
 * @param {string} id
 * @param {string} title
 * @returns {HTMLElement}
 */
function createSection(id, title) {
    state.tocEntries.push({ id, title });
    const section = el('section', 'doc-section');
    section.id = id;

    const heading = el('h2', 'doc-section-title');
    heading.id = `${id}-heading`;
    const anchor = el('a', 'doc-anchor-link', title);
    anchor.href = `#${state.currentDocId}`;
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    heading.appendChild(anchor);
    section.appendChild(heading);

    return section;
}

/**
 * 渲染可複製程式碼區塊
 * @param {string} code
 * @param {string} label
 * @returns {HTMLElement}
 */
function createCodeBlock(code, label = 'JavaScript') {
    const wrapper = el('div', 'doc-code-block');
    const header = el('div', 'doc-code-header');
    const labelId = `doc-code-label-${++codeBlockCounter}`;
    const labelEl = el('span', 'doc-code-label', label);
    labelEl.id = labelId;
    header.appendChild(labelEl);

    const copyBtn = el('button', 'doc-copy-btn');
    copyBtn.type = 'button';
    const icon = createIcon('content_copy');
    const textSpan = el('span', '', '複製');
    copyBtn.append(icon, textSpan);

    let resetTimer = 0;
    copyBtn.addEventListener('click', async () => {
        const copied = await copyTextToClipboard(code);
        if (!copied) return;
        clearTimeout(resetTimer);
        copyBtn.classList.add('is-copied');
        icon.textContent = 'check';
        textSpan.textContent = '已複製';
        resetTimer = window.setTimeout(() => {
            copyBtn.classList.remove('is-copied');
            icon.textContent = 'content_copy';
            textSpan.textContent = '複製';
        }, 1800);
    });

    header.appendChild(copyBtn);

    const pre = el('pre', 'doc-code-pre');
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-labelledby', labelId);
    const codeEl = document.createElement('code');
    codeEl.textContent = code;
    pre.appendChild(codeEl);

    wrapper.append(header, pre);
    return wrapper;
}

/**
 * 渲染參數項目卡片，支援一層巢狀選項展開
 * @param {Object} param
 * @param {boolean} isChild
 * @returns {HTMLElement}
 */
function createParamElement(param, isChild = false) {
    const item = el(isChild ? 'div' : 'li', isChild ? 'doc-param-child' : 'doc-param-card');
    const head = el('div', 'doc-param-head');

    head.appendChild(el('code', 'doc-param-name', param.name));
    if (param.type) {
        head.appendChild(el('span', 'doc-type-badge', param.type));
    }
    if (typeof param.required === 'boolean') {
        const reqBadge = el(
            'span',
            `doc-req-badge ${param.required ? 'is-required' : 'is-optional'}`,
            param.required ? '必填' : '選填'
        );
        head.appendChild(reqBadge);
    }
    if (param.defaultValue !== undefined) {
        head.appendChild(el('span', 'doc-default-badge', `預設值 ${param.defaultValue}`));
    }

    const desc = el('p', 'doc-param-desc');
    appendFormattedText(desc, param.description);

    item.append(head, desc);

    if (Array.isArray(param.children) && param.children.length > 0) {
        const childWrap = el('div', 'doc-param-children');
        for (const child of param.children) {
            childWrap.appendChild(createParamElement(child, true));
        }
        item.appendChild(childWrap);
    }

    return item;
}

/**
 * 渲染資料規格表格
 * @param {Object} tableDef
 * @param {string} [headingId]
 * @returns {HTMLElement}
 */
function createTableElement(tableDef, headingId = '') {
    const wrap = el('div', 'doc-table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    if (headingId) {
        wrap.setAttribute('aria-labelledby', headingId);
    } else {
        wrap.setAttribute('aria-label', tableDef.title || '資料規格表');
    }

    const table = el('table', 'doc-table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of tableDef.columns) {
        const th = el('th', '', col);
        th.scope = 'col';
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    for (const row of tableDef.rows) {
        const tr = document.createElement('tr');
        for (const cellText of row) {
            const td = document.createElement('td');
            appendFormattedText(td, cellText);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    table.append(thead, tbody);
    wrap.appendChild(table);
    return wrap;
}

/**
 * 渲染提示資訊區塊
 * @param {Object} callout
 * @returns {HTMLElement}
 */
function createCalloutElement(callout) {
    const variant = callout.variant || 'info';
    const box = el('div', `doc-callout is-${variant}`);
    const titleEl = el('div', 'doc-callout-title');
    const iconName = variant === 'danger' ? 'error' : variant === 'warning' ? 'warning' : 'info';
    titleEl.appendChild(createIcon(iconName));
    titleEl.appendChild(el('span', '', callout.title));
    box.appendChild(titleEl);

    const list = el('ul', 'doc-bullet-list');
    for (const itemText of callout.items || []) {
        const li = document.createElement('li');
        appendFormattedText(li, itemText);
        list.appendChild(li);
    }
    box.appendChild(list);
    return box;
}

/**
 * 渲染單篇參考詞條主要內容
 * @param {Object} item
 */
function renderArticle(item) {
    state.tocEntries = [];
    dom.article.replaceChildren();

    // 詞條標頭
    const header = el('header', 'doc-article-header');
    const eyebrow = el('div', 'doc-article-eyebrow');
    const cat = CATEGORY_MAP.get(item.category);
    if (cat) {
        eyebrow.appendChild(el('span', 'doc-eyebrow-tag', cat.label));
    }
    if (item.badge) {
        eyebrow.appendChild(el('span', 'doc-eyebrow-tag', item.badge));
    }
    header.appendChild(eyebrow);

    const titleEl = el('h1', 'doc-article-title');
    titleEl.id = 'docMainHeading';
    titleEl.tabIndex = -1;
    if (item.codeTitle) {
        titleEl.appendChild(el('code', 'doc-title-code', item.codeTitle));
    }
    titleEl.appendChild(el('span', '', item.title));
    header.appendChild(titleEl);

    if (item.subtitle) {
        header.appendChild(el('p', 'doc-article-subtitle', item.subtitle));
    }
    dom.article.appendChild(header);

    // 狀態與權限橫幅
    if (item.status) {
        dom.article.appendChild(renderStatusBanner(item.status));
    }

    // 概述
    if (Array.isArray(item.overview) && item.overview.length > 0) {
        const sec = createSection('sec-overview', '概述');
        const prose = el('div', 'doc-prose');
        for (const para of item.overview) {
            const p = document.createElement('p');
            appendFormattedText(p, para);
            prose.appendChild(p);
        }
        sec.appendChild(prose);

        if (Array.isArray(item.callouts)) {
            for (const callout of item.callouts) {
                sec.appendChild(createCalloutElement(callout));
            }
        }
        dom.article.appendChild(sec);
    }

    // 語法
    if (item.syntax) {
        const sec = createSection('sec-syntax', '語法');
        sec.appendChild(createCodeBlock(item.syntax, '呼叫簽名'));
        dom.article.appendChild(sec);
    }

    // 參數
    if (Array.isArray(item.parameters) && item.parameters.length > 0) {
        const sec = createSection('sec-parameters', '參數');
        const list = el('ul', 'doc-param-list');
        list.setAttribute('role', 'list');
        for (const param of item.parameters) {
            list.appendChild(createParamElement(param));
        }
        sec.appendChild(list);
        dom.article.appendChild(sec);
    }

    // 回傳值
    if (item.returns) {
        const sec = createSection('sec-returns', '回傳值');
        const box = el('div', 'doc-return-box');
        const head = el('div', 'doc-return-head');
        head.appendChild(el('span', 'doc-type-badge', item.returns.type));
        box.appendChild(head);

        const desc = el('p', 'doc-return-desc');
        appendFormattedText(desc, item.returns.description);
        box.appendChild(desc);

        if (Array.isArray(item.returns.fields) && item.returns.fields.length > 0) {
            const fieldsWrap = el('div', 'doc-param-children');
            for (const f of item.returns.fields) {
                fieldsWrap.appendChild(createParamElement(f, true));
            }
            box.appendChild(fieldsWrap);
        }
        sec.appendChild(box);
        dom.article.appendChild(sec);
    }

    // 規格表格
    if (Array.isArray(item.tables) && item.tables.length > 0) {
        item.tables.forEach((tableDef, idx) => {
            const sec = createSection(`sec-table-${idx}`, tableDef.title || '規格說明');
            sec.appendChild(createTableElement(tableDef, `${sec.id}-heading`));
            dom.article.appendChild(sec);
        });
    }

    // 注意事項與生命週期
    if (Array.isArray(item.notes) && item.notes.length > 0) {
        const sec = createSection('sec-notes', '注意事項與生命週期');
        const list = el('ul', 'doc-bullet-list');
        for (const noteText of item.notes) {
            const li = document.createElement('li');
            appendFormattedText(li, noteText);
            list.appendChild(li);
        }
        sec.appendChild(list);
        dom.article.appendChild(sec);
    }

    // 範例
    if (Array.isArray(item.examples) && item.examples.length > 0) {
        const sec = createSection('sec-examples', '範例');
        for (const example of item.examples) {
            sec.appendChild(createCodeBlock(example.code, example.label || '範例程式碼'));
        }
        dom.article.appendChild(sec);
    }

    // 技術摘要
    if (item.summary) {
        const sec = createSection('sec-summary', '技術摘要');
        const wrap = el('div', 'doc-table-wrap');
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-labelledby', 'sec-summary-heading');

        const table = el('table', 'doc-table doc-summary-table');
        const tbody = document.createElement('tbody');
        const rows = [
            ['所屬命名空間', item.summary.namespace],
            ['權限需求', item.summary.permission],
            ['權限常數', item.summary.constant],
            ['執行型態', item.summary.async],
            ['執行環境', item.summary.runtime],
            ['支援版本', item.summary.since]
        ];

        for (const [label, value] of rows) {
            const tr = document.createElement('tr');
            const th = el('th', '', label);
            th.scope = 'row';
            tr.appendChild(th);
            const td = document.createElement('td');
            appendFormattedText(td, value || '無');
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        wrap.appendChild(table);
        sec.appendChild(wrap);
        dom.article.appendChild(sec);
    }

    // 另請參閱
    const validRefs = (item.seeAlso || []).map((id) => ITEM_MAP.get(id)).filter(Boolean);
    if (validRefs.length > 0) {
        const sec = createSection('sec-see-also', '另請參閱');
        const list = el('ul', 'doc-seealso-list');
        list.setAttribute('role', 'list');
        for (const ref of validRefs) {
            const li = document.createElement('li');
            const link = el('a', 'doc-seealso-link');
            link.href = `#${ref.id}`;
            link.appendChild(el('span', '', ref.codeTitle || ref.title));
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToDoc(ref.id);
            });
            li.appendChild(link);
            list.appendChild(li);
        }
        sec.appendChild(list);
        dom.article.appendChild(sec);
    }

    // 上一篇 / 下一篇導覽卡片
    const currentIndex = DOC_ITEMS.findIndex((entry) => entry.id === item.id);
    const prevItem = currentIndex > 0 ? DOC_ITEMS[currentIndex - 1] : null;
    const nextItem = currentIndex >= 0 && currentIndex < DOC_ITEMS.length - 1 ? DOC_ITEMS[currentIndex + 1] : null;

    if (prevItem || nextItem) {
        const pager = el('nav', 'doc-pager');
        pager.setAttribute('aria-label', '前後詞條導覽');

        if (prevItem) {
            const prevCard = el('a', 'doc-pager-card');
            prevCard.href = `#${prevItem.id}`;
            prevCard.appendChild(el('span', 'doc-pager-dir', '上一篇'));
            prevCard.appendChild(el('span', 'doc-pager-title', prevItem.codeTitle || prevItem.title));
            prevCard.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToDoc(prevItem.id);
            });
            pager.appendChild(prevCard);
        } else {
            pager.appendChild(el('div'));
        }

        if (nextItem) {
            const nextCard = el('a', 'doc-pager-card is-next');
            nextCard.href = `#${nextItem.id}`;
            nextCard.appendChild(el('span', 'doc-pager-dir', '下一篇'));
            nextCard.appendChild(el('span', 'doc-pager-title', nextItem.codeTitle || nextItem.title));
            nextCard.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToDoc(nextItem.id);
            });
            pager.appendChild(nextCard);
        }

        dom.article.appendChild(pager);
    }

    renderToc();
}

/**
 * 渲染右側本頁目錄錨點
 */
function renderToc() {
    dom.tocList.replaceChildren();
    for (const entry of state.tocEntries) {
        const li = document.createElement('li');
        const link = el('a', 'doc-toc-link', entry.title);
        link.href = `#${entry.id}`;
        link.dataset.targetId = entry.id;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(entry.id);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActiveTocLink(entry.id);
            }
        });
        li.appendChild(link);
        dom.tocList.appendChild(li);
    }

    if (state.tocEntries.length > 0) {
        setActiveTocLink(state.tocEntries[0].id);
    }
}

function setActiveTocLink(targetId) {
    const links = dom.tocList.querySelectorAll('.doc-toc-link');
    for (const link of links) {
        link.classList.toggle('is-active', link.dataset.targetId === targetId);
    }
}

let scrollTicking = false;
function handleScrollSpy() {
    if (scrollTicking || state.tocEntries.length === 0) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
        scrollTicking = false;
        const offsetThreshold = 136;
        let currentId = state.tocEntries[0].id;

        for (const entry of state.tocEntries) {
            const sectionEl = document.getElementById(entry.id);
            if (!sectionEl) continue;
            const rect = sectionEl.getBoundingClientRect();
            if (rect.top <= offsetThreshold) {
                currentId = entry.id;
            }
        }

        setActiveTocLink(currentId);
    });
}

/**
 * 切換並渲染指定詞條頁面
 * @param {string} docId
 * @param {boolean} [updateHash=true]
 */
function navigateToDoc(docId, updateHash = true) {
    const target = ITEM_MAP.get(docId) || ITEM_MAP.get(DEFAULT_DOC_ID);
    if (!target) return;

    state.currentDocId = target.id;
    openGroupIds.add(target.groupId);

    if (updateHash && window.location.hash !== `#${target.id}`) {
        history.pushState(null, '', `#${target.id}`);
    }

    document.title = `${target.codeTitle || target.title} - Web mai Chart X 開發者手冊`;

    renderTopNav(target.category);
    renderBreadcrumb(target);
    renderSidebar();
    renderArticle(target);

    window.scrollTo({ top: 0, behavior: 'auto' });

    const activeSidebarLink = dom.sidebarNav.querySelector('.doc-tree-link.is-active');
    if (activeSidebarLink) {
        activeSidebarLink.scrollIntoView({ block: 'nearest' });
    }
}

/**
 * 處理頂部全站搜尋輸入與結果清單
 */
function updateGlobalSearch() {
    const query = dom.searchInput.value.trim().toLowerCase();
    dom.searchResults.replaceChildren();
    state.searchMatches = [];
    state.searchActiveIndex = -1;

    if (!query) {
        dom.searchResults.hidden = true;
        return;
    }

    const matches = DOC_ITEMS.filter((item) => {
        const haystacks = [
            item.title,
            item.codeTitle || '',
            item.subtitle || '',
            ...(item.status?.permissions || []),
            ...(item.overview || [])
        ];
        return haystacks.some((h) => h.toLowerCase().includes(query));
    }).slice(0, 12);

    state.searchMatches = matches;

    if (matches.length === 0) {
        dom.searchResults.appendChild(el('div', 'doc-search-empty', '查無符合的文件詞條。'));
        dom.searchResults.hidden = false;
        return;
    }

    matches.forEach((item, index) => {
        const btn = el('button', 'doc-search-result-item');
        btn.type = 'button';
        btn.setAttribute('role', 'option');

        const top = el('div', 'doc-search-result-top');
        top.appendChild(el('span', 'doc-search-result-title', item.codeTitle || item.title));
        const cat = CATEGORY_MAP.get(item.category);
        if (cat) {
            top.appendChild(el('span', 'doc-search-result-cat', cat.label));
        }

        const desc = el('span', 'doc-search-result-desc', item.subtitle || item.title);
        btn.append(top, desc);

        btn.addEventListener('click', () => {
            dom.searchResults.hidden = true;
            dom.searchInput.blur();
            navigateToDoc(item.id);
        });

        btn.addEventListener('mouseenter', () => {
            setSearchHighlight(index);
        });

        dom.searchResults.appendChild(btn);
    });

    setSearchHighlight(0);
    dom.searchResults.hidden = false;
}

function setSearchHighlight(index) {
    const items = dom.searchResults.querySelectorAll('.doc-search-result-item');
    if (items.length === 0) return;
    const bounded = Math.max(0, Math.min(index, items.length - 1));
    state.searchActiveIndex = bounded;

    items.forEach((node, idx) => {
        node.classList.toggle('is-highlighted', idx === bounded);
        if (idx === bounded) {
            node.scrollIntoView({ block: 'nearest' });
        }
    });
}

function setBackgroundInert(isInert) {
    if (dom.main) dom.main.inert = isInert;
    if (dom.breadcrumbBar) dom.breadcrumbBar.inert = isInert;
    if (dom.toc) dom.toc.inert = isInert;
}

function openMobileSidebar() {
    dom.sidebar.classList.add('is-open');
    dom.sidebar.setAttribute('role', 'dialog');
    dom.sidebar.setAttribute('aria-modal', 'true');
    dom.sidebarBackdrop.hidden = false;
    dom.mobileMenuBtn.setAttribute('aria-expanded', 'true');
    setBackgroundInert(true);
    dom.sidebarFilterInput.focus();
}

function closeMobileSidebar(restoreFocus = true) {
    if (!dom.sidebar.classList.contains('is-open')) return;
    dom.sidebar.classList.remove('is-open');
    dom.sidebar.removeAttribute('role');
    dom.sidebar.removeAttribute('aria-modal');
    dom.sidebarBackdrop.hidden = true;
    dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    setBackgroundInert(false);
    if (restoreFocus && mobileSidebarMql.matches) {
        dom.mobileMenuBtn.focus();
    }
}

function syncFromHash() {
    const rawHash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (rawHash && ITEM_MAP.has(rawHash)) {
        navigateToDoc(rawHash, false);
    } else {
        navigateToDoc(DEFAULT_DOC_ID, false);
    }
}

function bindEvents() {
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('scroll', handleScrollSpy, { passive: true });

    dom.brandHomeLink?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDoc(DEFAULT_DOC_ID);
    });

    dom.sidebarFilterInput.addEventListener('input', () => {
        state.filterText = dom.sidebarFilterInput.value;
        dom.sidebarFilterClear.hidden = state.filterText.length === 0;
        renderSidebar();
    });

    dom.sidebarFilterClear.addEventListener('click', () => {
        state.filterText = '';
        dom.sidebarFilterInput.value = '';
        dom.sidebarFilterClear.hidden = true;
        renderSidebar();
        dom.sidebarFilterInput.focus();
    });

    dom.toggleAllGroupsBtn.addEventListener('click', () => {
        const shouldOpen = !state.allExpanded;
        if (shouldOpen) {
            for (const g of DOC_GROUPS) openGroupIds.add(g.id);
        } else {
            openGroupIds.clear();
            const current = ITEM_MAP.get(state.currentDocId);
            if (current) openGroupIds.add(current.groupId);
        }
        renderSidebar();
    });

    dom.searchInput.addEventListener('input', updateGlobalSearch);
    dom.searchInput.addEventListener('focus', () => {
        if (dom.searchInput.value.trim()) updateGlobalSearch();
    });

    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSearchHighlight(state.searchActiveIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSearchHighlight(state.searchActiveIndex - 1);
        } else if (e.key === 'Enter' && state.searchMatches.length > 0) {
            e.preventDefault();
            const picked = state.searchMatches[Math.max(0, state.searchActiveIndex)];
            if (picked) {
                dom.searchResults.hidden = true;
                dom.searchInput.blur();
                navigateToDoc(picked.id);
            }
        } else if (e.key === 'Escape') {
            dom.searchResults.hidden = true;
            dom.searchInput.blur();
        }
    });

    document.addEventListener('click', (e) => {
        if (!dom.searchWrap.contains(e.target)) {
            dom.searchResults.hidden = true;
        }
    });

    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            dom.searchInput.focus();
            dom.searchInput.select();
        } else if (e.key === 'Escape' && dom.sidebar.classList.contains('is-open')) {
            closeMobileSidebar();
        }
    });

    dom.mobileMenuBtn.addEventListener('click', () => {
        if (dom.sidebar.classList.contains('is-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    });

    dom.sidebarBackdrop.addEventListener('click', () => closeMobileSidebar());

    mobileSidebarMql.addEventListener('change', (e) => {
        if (!e.matches && dom.sidebar.classList.contains('is-open')) {
            closeMobileSidebar(false);
        }
    });
}

bindEvents();
syncFromHash();
