/**
 * @file doc.js
 * @description 靜態多頁開發者手冊漸進式增強控制器。
 * 保留即時搜尋、側邊欄篩選與收合、行動版抽屜、程式碼複製、Markdown 複製與目錄滾動追蹤；
 * 當瀏覽器停用 JavaScript 時，靜態 HTML 頁面仍具備完整閱讀與導覽能力。
 */

const currentDocId = document.body.dataset.docId || '';
const mobileSidebarMql = window.matchMedia('(max-width: 840px)');

const UI_ELEMENT_IDS = new Set([
    'docMainHeading',
    'topCategoryNav',
    'globalSearchWrap',
    'globalSearchInput',
    'globalSearchResults',
    'docBreadcrumbBar',
    'breadcrumbNav',
    'sidebarBackdrop',
    'docSidebar',
    'sidebarFilterInput',
    'sidebarFilterClear',
    'toggleAllGroupsBtn',
    'sidebarNav',
    'sidebarEmptyState',
    'docMain',
    'docArticle',
    'tocList',
    'mobileMenuBtn',
    'brandHomeLink',
    'copyPageMdBtn'
]);

const dom = {
    breadcrumbBar: document.getElementById('docBreadcrumbBar'),
    sidebar: document.getElementById('docSidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebarFilterInput: document.getElementById('sidebarFilterInput'),
    sidebarFilterClear: document.getElementById('sidebarFilterClear'),
    toggleAllGroupsBtn: document.getElementById('toggleAllGroupsBtn'),
    sidebarNav: document.getElementById('sidebarNav'),
    sidebarEmpty: document.getElementById('sidebarEmptyState'),
    main: document.getElementById('docMain'),
    toc: document.querySelector('.doc-toc'),
    tocList: document.getElementById('tocList'),
    searchWrap: document.getElementById('globalSearchWrap'),
    searchInput: document.getElementById('globalSearchInput'),
    searchResults: document.getElementById('globalSearchResults'),
    copyPageMdBtn: document.getElementById('copyPageMdBtn')
};

const state = {
    indexData: null,
    indexPromise: null,
    searchMatches: [],
    searchActiveIndex: -1,
    tocEntries: []
};

/**
 * 複製純文字至系統剪貼簿
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
 * 載入精簡搜尋索引 JSON
 * @returns {Promise<{ categories: Array, groups: Array, items: Array }|null>}
 */
async function loadSearchIndex() {
    if (state.indexData) return state.indexData;
    if (state.indexPromise) return state.indexPromise;

    state.indexPromise = fetch('./search-index.json')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
            if (data && Array.isArray(data.items)) {
                state.indexData = data;
                return data;
            }
            return null;
        })
        .catch(() => null);

    return state.indexPromise;
}

/**
 * 若目前為手寫入口頁 index.html，載入完整索引後補齊側邊欄全部條目
 */
async function hydrateIndexSidebarIfNeeded() {
    if (!dom.sidebarNav || dom.sidebarNav.dataset.fullTree === 'true') return;
    const data = await loadSearchIndex();
    if (!data) return;

    const fragment = document.createDocumentFragment();
    for (const category of data.categories || []) {
        const catGroups = (data.groups || []).filter((g) => g.category === category.id);
        const sectionEl = document.createElement('div');
        sectionEl.className = 'doc-tree-section';

        const secTitle = document.createElement('div');
        secTitle.className = 'doc-tree-section-title';
        secTitle.textContent = category.label;
        sectionEl.appendChild(secTitle);

        let hasAnyGroup = false;
        for (const group of catGroups) {
            const grpItems = data.items.filter((it) => it.groupId === group.id);
            if (grpItems.length === 0) continue;
            hasAnyGroup = true;

            const detailsEl = document.createElement('details');
            detailsEl.className = 'doc-tree-group';
            detailsEl.dataset.groupId = group.id;
            if (group.defaultOpen) detailsEl.open = true;

            const summaryEl = document.createElement('summary');
            summaryEl.className = 'doc-tree-summary';

            const chev = document.createElement('span');
            chev.className = 'material-symbols-outlined doc-tree-chevron';
            chev.setAttribute('aria-hidden', 'true');
            chev.textContent = 'chevron_right';

            const titleSpan = document.createElement('span');
            if (group.mono) titleSpan.className = 'doc-tree-group-code';
            titleSpan.textContent = group.title;
            summaryEl.append(chev, titleSpan);

            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'doc-tree-items';

            for (const item of grpItems) {
                const link = document.createElement('a');
                link.className = 'doc-tree-link';
                link.href = item.url;
                link.dataset.docId = item.id;
                link.dataset.searchText = `${item.title} ${item.codeTitle} ${item.sidebarLabel} ${item.subtitle} ${(item.permissions || []).join(' ')}`.toLowerCase();

                const labelSpan = document.createElement('span');
                labelSpan.className = item.sidebarMono ? 'doc-tree-link-label is-mono' : 'doc-tree-link-label';
                labelSpan.textContent = item.sidebarLabel;
                link.appendChild(labelSpan);

                if (item.badge) {
                    const pill = document.createElement('span');
                    pill.className = 'doc-tree-pill';
                    pill.textContent = item.badge;
                    link.appendChild(pill);
                }
                itemsWrap.appendChild(link);
            }

            detailsEl.append(summaryEl, itemsWrap);
            sectionEl.appendChild(detailsEl);
        }

        if (hasAnyGroup) {
            fragment.appendChild(sectionEl);
        }
    }

    dom.sidebarNav.replaceChildren(fragment);
    dom.sidebarNav.dataset.fullTree = 'true';
    bindSidebarGroupToggles();
    syncToggleAllButtonText();
    if (dom.sidebarFilterInput?.value.trim()) {
        applySidebarFilter();
    }
}

/**
 * 同步「全部展開 / 全部收合」按鈕文字
 */
function syncToggleAllButtonText() {
    if (!dom.sidebarNav || !dom.toggleAllGroupsBtn) return;
    const groups = Array.from(dom.sidebarNav.querySelectorAll('.doc-tree-group'));
    if (groups.length === 0) return;
    const allOpen = groups.every((g) => g.open);
    dom.toggleAllGroupsBtn.textContent = allOpen ? '全部收合' : '全部展開';
}

function bindSidebarGroupToggles() {
    if (!dom.sidebarNav) return;
    const groups = dom.sidebarNav.querySelectorAll('.doc-tree-group');
    for (const grp of groups) {
        grp.addEventListener('toggle', () => {
            if (!dom.sidebarFilterInput?.value.trim()) {
                syncToggleAllButtonText();
            }
        });
    }
}

/**
 * 依關鍵字即時篩選左側預渲染樹狀導覽
 */
function applySidebarFilter() {
    if (!dom.sidebarNav || !dom.sidebarFilterInput) return;
    const query = dom.sidebarFilterInput.value.trim().toLowerCase();
    if (dom.sidebarFilterClear) {
        dom.sidebarFilterClear.hidden = query.length === 0;
    }

    let matchedCount = 0;
    const sections = dom.sidebarNav.querySelectorAll('.doc-tree-section');

    for (const section of sections) {
        let sectionHasVisible = false;
        const groups = section.querySelectorAll('.doc-tree-group');

        for (const grp of groups) {
            let groupHasVisible = false;
            const links = grp.querySelectorAll('.doc-tree-link');

            for (const link of links) {
                const haystack = (link.dataset.searchText || link.textContent || '').toLowerCase();
                const matched = !query || haystack.includes(query);
                link.hidden = !matched;
                if (matched) {
                    groupHasVisible = true;
                    matchedCount++;
                }
            }

            grp.hidden = !groupHasVisible;
            if (query && groupHasVisible) {
                grp.open = true;
            }
            if (groupHasVisible) {
                sectionHasVisible = true;
            }
        }

        section.hidden = !sectionHasVisible;
    }

    if (dom.sidebarEmpty) {
        dom.sidebarEmpty.hidden = matchedCount > 0;
    }
    syncToggleAllButtonText();
}

/**
 * 全站搜尋過濾與結果渲染
 */
async function updateGlobalSearch() {
    if (!dom.searchInput || !dom.searchResults) return;
    const query = dom.searchInput.value.trim().toLowerCase();
    dom.searchResults.replaceChildren();
    state.searchMatches = [];
    state.searchActiveIndex = -1;

    if (!query) {
        dom.searchResults.hidden = true;
        return;
    }

    const data = await loadSearchIndex();
    if (!data || !Array.isArray(data.items)) {
        dom.searchResults.hidden = true;
        return;
    }

    const matches = data.items.filter((item) => {
        const haystacks = [
            item.title,
            item.codeTitle || '',
            item.subtitle || '',
            ...(item.permissions || []),
            item.keywords || ''
        ];
        return haystacks.some((h) => h.toLowerCase().includes(query));
    }).slice(0, 12);

    state.searchMatches = matches;

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'doc-search-empty';
        empty.textContent = '查無符合的文件詞條。';
        dom.searchResults.appendChild(empty);
        dom.searchResults.hidden = false;
        return;
    }

    matches.forEach((item, index) => {
        const link = document.createElement('a');
        link.className = 'doc-search-result-item';
        link.href = item.url;
        link.setAttribute('role', 'option');

        const top = document.createElement('div');
        top.className = 'doc-search-result-top';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'doc-search-result-title';
        titleSpan.textContent = item.codeTitle || item.title;
        top.appendChild(titleSpan);

        if (item.categoryLabel) {
            const catSpan = document.createElement('span');
            catSpan.className = 'doc-search-result-cat';
            catSpan.textContent = item.categoryLabel;
            top.appendChild(catSpan);
        }

        const descSpan = document.createElement('span');
        descSpan.className = 'doc-search-result-desc';
        descSpan.textContent = item.subtitle || item.title;

        link.append(top, descSpan);
        link.addEventListener('mouseenter', () => setSearchHighlight(index));
        dom.searchResults.appendChild(link);
    });

    setSearchHighlight(0);
    dom.searchResults.hidden = false;
}

function setSearchHighlight(index) {
    if (!dom.searchResults) return;
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
    if (!dom.sidebar) return;
    dom.sidebar.classList.add('is-open');
    dom.sidebar.setAttribute('role', 'dialog');
    dom.sidebar.setAttribute('aria-modal', 'true');
    if (dom.sidebarBackdrop) dom.sidebarBackdrop.hidden = false;
    if (dom.mobileMenuBtn) dom.mobileMenuBtn.setAttribute('aria-expanded', 'true');
    setBackgroundInert(true);
    dom.sidebarFilterInput?.focus();
}

function closeMobileSidebar(restoreFocus = true) {
    if (!dom.sidebar || !dom.sidebar.classList.contains('is-open')) return;
    dom.sidebar.classList.remove('is-open');
    dom.sidebar.removeAttribute('role');
    dom.sidebar.removeAttribute('aria-modal');
    if (dom.sidebarBackdrop) dom.sidebarBackdrop.hidden = true;
    if (dom.mobileMenuBtn) dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    setBackgroundInert(false);
    if (restoreFocus && mobileSidebarMql.matches) {
        dom.mobileMenuBtn?.focus();
    }
}

/**
 * 綁定預渲染程式碼區塊的複製按鈕
 */
function initCodeCopyButtons() {
    const blocks = document.querySelectorAll('.doc-code-block');
    for (const block of blocks) {
        const btn = block.querySelector('.doc-copy-btn');
        const codeEl = block.querySelector('.doc-code-pre code');
        if (!btn || !codeEl) continue;

        const icon = btn.querySelector('.material-symbols-outlined');
        const labelSpan = btn.querySelector('span:last-child');
        let resetTimer = 0;

        btn.addEventListener('click', async () => {
            const copied = await copyTextToClipboard(codeEl.textContent || '');
            if (!copied) return;
            window.clearTimeout(resetTimer);
            btn.classList.add('is-copied');
            if (icon) icon.textContent = 'check';
            if (labelSpan) labelSpan.textContent = '已複製';
            resetTimer = window.setTimeout(() => {
                btn.classList.remove('is-copied');
                if (icon) icon.textContent = 'content_copy';
                if (labelSpan) labelSpan.textContent = '複製';
            }, 1800);
        });
    }
}

/**
 * 綁定頁面頂部「複製 Markdown」按鈕
 */
function initPageMarkdownCopyButton() {
    const btn = dom.copyPageMdBtn;
    const mdUrl = document.body.dataset.mdUrl;
    if (!btn || !mdUrl) return;

    const icon = btn.querySelector('.material-symbols-outlined');
    const labelSpan = btn.querySelector('span:last-child');
    let resetTimer = 0;

    btn.addEventListener('click', async () => {
        try {
            const res = await fetch(mdUrl);
            if (!res.ok) return;
            const mdText = await res.text();
            const copied = await copyTextToClipboard(mdText);
            if (!copied) return;
            window.clearTimeout(resetTimer);
            btn.classList.add('is-copied');
            if (icon) icon.textContent = 'check';
            if (labelSpan) labelSpan.textContent = '已複製';
            resetTimer = window.setTimeout(() => {
                btn.classList.remove('is-copied');
                if (icon) icon.textContent = 'content_copy';
                if (labelSpan) labelSpan.textContent = '複製 Markdown';
            }, 1800);
        } catch {
            // 網路異常時不覆蓋原按鈕狀態
        }
    });
}

/**
 * 初始化右側目錄 ScrollSpy 與平滑捲動
 */
function initTocScrollSpy() {
    if (!dom.tocList) return;
    const links = Array.from(dom.tocList.querySelectorAll('.doc-toc-link'));
    state.tocEntries = links
        .map((link) => ({
            id: link.dataset.targetId || (link.getAttribute('href') || '').replace(/^#/, ''),
            link
        }))
        .filter((e) => Boolean(e.id));

    if (state.tocEntries.length === 0) return;

    const setActive = (targetId) => {
        for (const entry of state.tocEntries) {
            entry.link.classList.toggle('is-active', entry.id === targetId);
        }
    };

    for (const entry of state.tocEntries) {
        entry.link.addEventListener('click', (e) => {
            const target = document.getElementById(entry.id);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', `#${entry.id}`);
            setActive(entry.id);
        });
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            ticking = false;
            const threshold = 136;
            let activeId = state.tocEntries[0].id;
            for (const entry of state.tocEntries) {
                const sectionEl = document.getElementById(entry.id);
                if (!sectionEl) continue;
                if (sectionEl.getBoundingClientRect().top <= threshold) {
                    activeId = entry.id;
                }
            }
            setActive(activeId);
        });
    }, { passive: true });
}

/**
 * 處理執行期間手動修改 URL Hash 跳轉至舊詞條的情況
 */
async function handleLegacyHashChange() {
    const raw = window.location.hash || '';
    if (raw.length < 2) return;
    let id;
    try {
        id = decodeURIComponent(raw.slice(1));
    } catch {
        return;
    }
    if (!id || id.startsWith('sec-') || UI_ELEMENT_IDS.has(id) || id === currentDocId) return;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) return;

    const data = await loadSearchIndex();
    if (data && data.items.some((item) => item.id === id)) {
        window.location.replace(`./${encodeURIComponent(id)}.html`);
    }
}

function bindEvents() {
    window.addEventListener('hashchange', handleLegacyHashChange);

    bindSidebarGroupToggles();
    syncToggleAllButtonText();

    const activeSidebarLink = dom.sidebarNav?.querySelector('.doc-tree-link.is-active');
    if (activeSidebarLink) {
        activeSidebarLink.scrollIntoView({ block: 'nearest' });
    }

    dom.sidebarFilterInput?.addEventListener('input', applySidebarFilter);
    dom.sidebarFilterClear?.addEventListener('click', () => {
        if (!dom.sidebarFilterInput) return;
        dom.sidebarFilterInput.value = '';
        applySidebarFilter();
        dom.sidebarFilterInput.focus();
    });

    dom.toggleAllGroupsBtn?.addEventListener('click', () => {
        if (!dom.sidebarNav) return;
        const groups = Array.from(dom.sidebarNav.querySelectorAll('.doc-tree-group'));
        const allOpen = groups.every((g) => g.open);
        for (const grp of groups) {
            grp.open = !allOpen;
        }
        syncToggleAllButtonText();
    });

    dom.searchInput?.addEventListener('input', updateGlobalSearch);
    dom.searchInput?.addEventListener('focus', () => {
        loadSearchIndex();
        if (dom.searchInput.value.trim()) updateGlobalSearch();
    });

    dom.searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSearchHighlight(state.searchActiveIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSearchHighlight(state.searchActiveIndex - 1);
        } else if (e.key === 'Enter' && state.searchMatches.length > 0) {
            e.preventDefault();
            const picked = state.searchMatches[Math.max(0, state.searchActiveIndex)];
            if (picked?.url) {
                window.location.href = picked.url;
            }
        } else if (e.key === 'Escape' && dom.searchResults) {
            dom.searchResults.hidden = true;
            dom.searchInput.blur();
        }
    });

    document.addEventListener('click', (e) => {
        if (dom.searchWrap && dom.searchResults && !dom.searchWrap.contains(e.target)) {
            dom.searchResults.hidden = true;
        }
    });

    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName;
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
        if (e.key === '/' && !isTyping && dom.searchInput) {
            e.preventDefault();
            dom.searchInput.focus();
            dom.searchInput.select();
        } else if (e.key === 'Escape' && dom.sidebar?.classList.contains('is-open')) {
            closeMobileSidebar();
        }
    });

    dom.mobileMenuBtn?.addEventListener('click', () => {
        if (dom.sidebar?.classList.contains('is-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    });

    dom.sidebarBackdrop?.addEventListener('click', () => closeMobileSidebar());

    mobileSidebarMql.addEventListener('change', (e) => {
        if (!e.matches && dom.sidebar?.classList.contains('is-open')) {
            closeMobileSidebar(false);
        }
    });

    initCodeCopyButtons();
    initPageMarkdownCopyButton();
    initTocScrollSpy();
    hydrateIndexSidebarIfNeeded();
}

bindEvents();
