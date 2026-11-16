/**
 * @file extensionManagerModal.js
 * @description 參照專案總管版面設計的擴充程式管理視窗，支援手動匯入 .zip 外掛、權限確認、啟用切換與移除。
 */

import { extensionManager, EXTENSION_PERMISSIONS } from '../core/extensionManager.js';
import {
    parseExtensionZip,
    installExtensionPackage,
    toggleInstalledExtension,
    uninstallExtension
} from '../core/extensionLoader.js';
import { listStoredExtensionMeta } from '../core/extensionStorage.js';
import {
    fetchAndValidateRegistry,
    listExtensionRepos,
    addExtensionRepo,
    removeExtensionRepo,
    refreshExtensionRepo,
    refreshAllExtensionRepos,
    downloadAndVerifyPackage,
    getRepoExtensionStatus
} from '../core/extensionRepo.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

const PERMISSION_I18N_MAP = Object.freeze({
    [EXTENSION_PERMISSIONS.EDITOR_READ]: 'editor_read',
    [EXTENSION_PERMISSIONS.EDITOR_WRITE]: 'editor_write',
    [EXTENSION_PERMISSIONS.CHART_READ]: 'chart_read',
    [EXTENSION_PERMISSIONS.VIEW_READ]: 'view_read',
    [EXTENSION_PERMISSIONS.PLAYBACK_READ]: 'playback_read',
    [EXTENSION_PERMISSIONS.PLAYBACK_SEEK]: 'playback_seek',
    [EXTENSION_PERMISSIONS.RENDER_OVERLAY]: 'render_overlay',
    [EXTENSION_PERMISSIONS.COMMANDS_REGISTER]: 'commands_register',
    [EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE]: 'events_subscribe',
    [EXTENSION_PERMISSIONS.UI_TOAST]: 'ui_toast',
    [EXTENSION_PERMISSIONS.UI_MENU]: 'ui_menu',
    [EXTENSION_PERMISSIONS.UI_POPOVER]: 'ui_popover',
    [EXTENSION_PERMISSIONS.UI_OVERLAY]: 'ui_overlay',
    [EXTENSION_PERMISSIONS.I18N_REGISTER]: 'i18n_register',
    [EXTENSION_PERMISSIONS.STORAGE]: 'storage',
    [EXTENSION_PERMISSIONS.SETTINGS_READ]: 'settings_read',
    [EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE]: 'settings_override',
    [EXTENSION_PERMISSIONS.ASSETS_READ]: 'assets_read',
    [EXTENSION_PERMISSIONS.ASSETS_OVERRIDE]: 'assets_override'
});

function getPermissionDescription(perm) {
    const key = PERMISSION_I18N_MAP[perm];
    if (!key) {
        return {
            titleKey: 'extensions.unknownPermissionTitle',
            descKey: 'extensions.unknownPermissionDesc'
        };
    }
    return {
        titleKey: `extensions.perm.${key}.title`,
        descKey: `extensions.perm.${key}.desc`
    };
}

function getStatusKey(status) {
    if (status === 'active') return 'extensions.statusActive';
    if (status === 'error') return 'extensions.statusError';
    return 'extensions.statusInactive';
}

function getStatusText(status) {
    return t(getStatusKey(status));
}

function getStatusClass(status) {
    if (status === 'active') return 'is-active';
    if (status === 'error') return 'is-error';
    return 'is-inactive';
}

function createMetaRow(labelKey, valueText, isMono = false) {
    const row = document.createElement('div');
    row.className = 'ext-detail-meta-row';

    const dt = document.createElement('dt');
    dt.className = 'ext-detail-meta-label';
    dt.setAttribute('data-i18n', labelKey);
    dt.textContent = t(labelKey);

    const dd = document.createElement('dd');
    dd.className = isMono ? 'ext-detail-meta-value is-mono' : 'ext-detail-meta-value';
    dd.textContent = valueText;

    row.append(dt, dd);
    return row;
}

/**
 * 建構共用的擴充程式詳情內容（供安裝確認與已安裝檢視子彈窗復用）
 * @param {Object} manifest
 * @param {Object} [options={}]
 * @returns {HTMLElement}
 */
function buildExtensionDetailContent(manifest, options = {}) {
    const { mode = 'detail', status = null, error = null } = options;

    const body = document.createElement('div');
    body.className = 'ext-perm-confirm';

    const scrollBody = document.createElement('div');
    scrollBody.className = 'ext-detail-scroll-body';

    const metaCard = document.createElement('div');
    metaCard.className = 'ext-detail-meta-card';

    const headRow = document.createElement('div');
    headRow.className = 'ext-detail-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'ext-card-title-wrap';

    const nameEl = document.createElement('strong');
    nameEl.className = 'ext-detail-name';
    nameEl.textContent = manifest.name;

    const versionEl = document.createElement('span');
    versionEl.className = 'ext-card-version';
    versionEl.textContent = `v${manifest.version}`;

    titleWrap.append(nameEl, versionEl);
    headRow.appendChild(titleWrap);

    if (mode === 'detail' && status) {
        const statusBadge = document.createElement('span');
        statusBadge.className = `ext-status-badge ${getStatusClass(status)}`;
        statusBadge.setAttribute('data-i18n', getStatusKey(status));
        statusBadge.textContent = getStatusText(status);
        headRow.appendChild(statusBadge);
    }

    metaCard.appendChild(headRow);

    const descEl = document.createElement('p');
    if (manifest.description) {
        descEl.className = 'ext-detail-desc';
        descEl.textContent = manifest.description;
    } else {
        descEl.className = 'ext-detail-desc is-empty';
        descEl.setAttribute('data-i18n', 'extensions.noDescription');
        descEl.textContent = t('extensions.noDescription');
    }
    metaCard.appendChild(descEl);

    const metaGrid = document.createElement('dl');
    metaGrid.className = 'ext-detail-meta-grid';
    metaGrid.appendChild(createMetaRow('extensions.metaId', manifest.id, true));

    const authorText = manifest.author || t('extensions.metaAuthorUnknown');
    metaGrid.appendChild(createMetaRow('extensions.metaAuthor', authorText));

    const runtimeKey = manifest.runtime === 'worker'
        ? 'extensions.runtimeWorker'
        : 'extensions.runtimeTrusted';
    metaGrid.appendChild(createMetaRow('extensions.metaRuntime', t(runtimeKey)));

    metaCard.appendChild(metaGrid);

    const linkEntries = [
        { url: manifest.homepage, labelKey: 'extensions.linkHomepage' },
        { url: manifest.privacyUrl, labelKey: 'popup.about.privacyPolicy' },
        { url: manifest.termsUrl, labelKey: 'popup.about.termsOfService' }
    ].filter((entry) => {
        if (!entry.url || typeof entry.url !== 'string') return false;
        try {
            return new URL(entry.url).protocol === 'https:';
        } catch (_) {
            return false;
        }
    });

    if (linkEntries.length > 0) {
        const linksSection = document.createElement('div');
        linksSection.className = 'ext-detail-links-section';

        const linksTitle = document.createElement('div');
        linksTitle.className = 'ext-detail-meta-label';
        linksTitle.setAttribute('data-i18n', 'extensions.metaLinks');
        linksTitle.textContent = t('extensions.metaLinks');

        const linksWrap = document.createElement('div');
        linksWrap.className = 'about-legal-links';

        for (const entry of linkEntries) {
            const anchor = document.createElement('a');
            anchor.href = entry.url;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.className = 'about-legal-link';

            const labelSpan = document.createElement('span');
            labelSpan.setAttribute('data-i18n', entry.labelKey);
            labelSpan.textContent = t(entry.labelKey);
            anchor.appendChild(labelSpan);

            linksWrap.appendChild(anchor);
        }

        linksSection.append(linksTitle, linksWrap);
        metaCard.appendChild(linksSection);
    }

    scrollBody.appendChild(metaCard);

    if (mode === 'detail' && error) {
        const errEl = document.createElement('div');
        errEl.className = 'ext-card-error';
        errEl.textContent = error;
        scrollBody.appendChild(errEl);
    }

    const listTitleKey = mode === 'install'
        ? 'extensions.requestedPermissions'
        : 'extensions.grantedPermissions';

    const listTitle = document.createElement('div');
    listTitle.className = 'ext-perm-title';
    listTitle.setAttribute('data-i18n', listTitleKey);
    listTitle.textContent = t(listTitleKey);
    scrollBody.appendChild(listTitle);

    const permList = document.createElement('ul');
    permList.className = 'ext-perm-detail-list';
    const perms = manifest.permissions || [];
    if (perms.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'ext-perm-detail-empty';
        emptyLi.setAttribute('data-i18n', 'extensions.noPermissions');
        emptyLi.textContent = t('extensions.noPermissions');
        permList.appendChild(emptyLi);
    } else {
        for (const perm of perms) {
            const { titleKey, descKey } = getPermissionDescription(perm);
            const li = document.createElement('li');
            li.className = 'ext-perm-detail-item';

            const permHeader = document.createElement('div');
            permHeader.className = 'ext-perm-detail-header';

            const permTitle = document.createElement('strong');
            permTitle.className = 'ext-perm-detail-title';
            permTitle.setAttribute('data-i18n', titleKey);
            permTitle.textContent = t(titleKey);

            const permCode = document.createElement('code');
            permCode.className = 'ext-perm-code';
            permCode.textContent = perm;

            permHeader.append(permTitle, permCode);

            const permDesc = document.createElement('p');
            permDesc.className = 'ext-perm-detail-desc';
            permDesc.setAttribute('data-i18n', descKey);
            permDesc.textContent = t(descKey);

            li.append(permHeader, permDesc);
            permList.appendChild(li);
        }
    }
    scrollBody.appendChild(permList);
    body.appendChild(scrollBody);

    if (mode === 'install') {
        const warning = document.createElement('p');
        warning.className = 'ext-perm-warning';
        warning.setAttribute('data-i18n', 'extensions.securityWarning');
        warning.textContent = t('extensions.securityWarning');
        body.appendChild(warning);
    }

    return body;
}

/**
 * 開啟已安裝擴充程式的詳細資訊子彈窗
 * @param {{ manifest: Object, status: string, error: string|null }} item
 */
function openExtensionDetailModal(item) {
    const body = buildExtensionDetailContent(item.manifest, {
        mode: 'detail',
        status: item.status,
        error: item.error
    });

    popupWindow({
        title: t('extensions.detailTitle'),
        customContent: body,
        width: 520,
        maxWidth: 600,
        buttons: [
            {
                text: t('extensions.close'),
                hideOnClick: true
            }
        ]
    });
}

/**
 * 顯示安裝前權限確認視窗，避免未經授權即執行第三方腳本
 * @param {Object} pkg
 * @returns {Promise<boolean>}
 */
function confirmInstallPermissions(pkg) {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = (accepted) => {
            if (resolved) return;
            resolved = true;
            resolve(accepted);
        };

        const body = buildExtensionDetailContent(pkg.manifest, { mode: 'install' });

        popupWindow({
            title: t('extensions.confirmInstallTitle'),
            customContent: body,
            width: 520,
            maxWidth: 600,
            onClose: () => finish(false),
            buttons: [
                {
                    text: t('extensions.cancel'),
                    hideOnClick: true,
                    onClick: () => finish(false)
                },
                {
                    text: t('extensions.installAndEnable'),
                    hideOnClick: true,
                    onClick: () => finish(true)
                }
            ]
        });
    });
}

function triggerZipPicker(onInstalled) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;

        try {
            const pkg = await parseExtensionZip(file);
            const approved = await confirmInstallPermissions(pkg);
            if (!approved) return;

            await installExtensionPackage(pkg);
            simpleToast({
                content: t('extensions.installSuccess', { name: pkg.manifest.name }),
                type: 'success'
            });
            if (typeof onInstalled === 'function') {
                onInstalled();
            }
        } catch (error) {
            console.error('[ExtensionManagerModal] 匯入外掛失敗:', error);
            simpleToast({
                content: t('extensions.installFailed', { error: error.message }),
                type: 'error'
            });
        }
    });

    document.body.appendChild(input);
    input.click();
}

function formatRepoSyncTime(timestamp) {
    if (!timestamp) return t('extensions.repoNeverSynced');
    try {
        return new Date(timestamp).toLocaleString();
    } catch (_) {
        return String(timestamp);
    }
}

/**
 * 開啟資料源設定彈窗（整合新增資料源預檢與已加入資料源管理）
 * @param {Function} onChanged
 */
function openManageReposModal(onChanged) {
    const body = document.createElement('div');
    body.className = 'ext-perm-confirm';

    // ── 新增資料源區塊（WERP 5.1：取得、驗證並顯示儲存庫資訊供使用者確認） ──
    const addSection = document.createElement('div');
    addSection.className = 'ext-detail-meta-card';

    const hint = document.createElement('p');
    hint.className = 'ext-perm-intro';
    hint.textContent = t('extensions.repoAddDesc');

    const inputRow = document.createElement('div');
    inputRow.className = 'ext-repo-input-row';

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'popup-input ext-repo-input';
    urlInput.placeholder = 'https://example.github.io/reponame/index.json';
    urlInput.autocomplete = 'off';
    urlInput.spellcheck = false;

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'ext-card-btn';
    checkBtn.textContent = t('extensions.repoFetchPreview');

    inputRow.append(urlInput, checkBtn);

    const statusBox = document.createElement('div');
    statusBox.className = 'ext-repo-preview-area';

    let validatedRepo = null;

    const listEl = document.createElement('div');
    listEl.className = 'ext-repo-manage-list';

    const renderRepoList = async () => {
        listEl.textContent = '';
        const repos = await listExtensionRepos();

        if (repos.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'ext-perm-detail-empty';
            emptyEl.textContent = t('extensions.repoEmptyTitle');
            listEl.appendChild(emptyEl);
            return;
        }

        for (const repo of repos) {
            const item = document.createElement('div');
            item.className = 'ext-repo-manage-item';

            const head = document.createElement('div');
            head.className = 'ext-card-header';

            const titleWrap = document.createElement('div');
            titleWrap.className = 'ext-card-title-wrap';
            const nameEl = document.createElement('strong');
            nameEl.className = 'ext-card-title';
            nameEl.textContent = repo.name || repo.identifier;
            const idEl = document.createElement('span');
            idEl.className = 'ext-card-version';
            idEl.textContent = repo.identifier;
            titleWrap.append(nameEl, idEl);

            const statusBadge = document.createElement('span');
            statusBadge.className = repo.lastError ? 'ext-status-badge is-error' : 'ext-status-badge is-active';
            statusBadge.textContent = repo.lastError ? t('extensions.statusError') : t('extensions.repoStatusOk');

            head.append(titleWrap, statusBadge);

            const urlEl = document.createElement('div');
            urlEl.className = 'ext-card-id';
            urlEl.textContent = repo.url;

            const metaEl = document.createElement('div');
            metaEl.className = 'ext-card-summary';
            metaEl.textContent = t('extensions.repoLastSynced', { time: formatRepoSyncTime(repo.lastFetchedAt) });

            item.append(head, urlEl, metaEl);

            if (repo.lastError) {
                const errEl = document.createElement('div');
                errEl.className = 'ext-card-error';
                errEl.textContent = `[${repo.lastError.code}] ${repo.lastError.message}`;
                item.appendChild(errEl);
            }

            const actions = document.createElement('div');
            actions.className = 'ext-card-actions';

            const refreshBtn = document.createElement('button');
            refreshBtn.type = 'button';
            refreshBtn.className = 'ext-card-btn';
            refreshBtn.textContent = t('extensions.repoRefreshOne');
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                await refreshExtensionRepo(repo.url);
                await renderRepoList();
                if (typeof onChanged === 'function') onChanged();
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'ext-card-btn is-danger';
            removeBtn.textContent = t('extensions.remove');
            removeBtn.addEventListener('click', async () => {
                await removeExtensionRepo(repo.url);
                simpleToast({
                    content: t('extensions.repoRemovedSuccess', { name: repo.name || repo.url }),
                    type: 'info'
                });
                await renderRepoList();
                if (typeof onChanged === 'function') onChanged();
            });

            actions.append(refreshBtn, removeBtn);
            item.appendChild(actions);
            listEl.appendChild(item);
        }
    };

    const renderPreview = (validated) => {
        statusBox.textContent = '';
        const card = document.createElement('div');
        card.className = 'ext-repo-manage-item';

        const head = document.createElement('div');
        head.className = 'ext-detail-head';
        const nameEl = document.createElement('strong');
        nameEl.className = 'ext-detail-name';
        nameEl.textContent = validated.index.name;
        const countBadge = document.createElement('span');
        countBadge.className = 'ext-status-badge is-active';
        countBadge.textContent = t('extensions.repoExtCount', { count: validated.index.extensions.length });
        head.append(nameEl, countBadge);

        const descEl = document.createElement('p');
        descEl.className = validated.index.description ? 'ext-detail-desc' : 'ext-detail-desc is-empty';
        descEl.textContent = validated.index.description || t('extensions.noDescription');

        const metaGrid = document.createElement('dl');
        metaGrid.className = 'ext-detail-meta-grid';
        metaGrid.appendChild(createMetaRow('extensions.metaId', validated.index.identifier, true));
        metaGrid.appendChild(createMetaRow('extensions.repoUrlLabel', validated.url, true));

        const previewActions = document.createElement('div');
        previewActions.className = 'ext-card-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'ext-card-btn is-primary';
        confirmBtn.textContent = t('extensions.repoConfirmAdd');
        confirmBtn.addEventListener('click', async () => {
            if (!validatedRepo) return;
            confirmBtn.disabled = true;
            try {
                await addExtensionRepo(validatedRepo);
                simpleToast({
                    content: t('extensions.repoAddedSuccess', { name: validatedRepo.index.name }),
                    type: 'success'
                });
                validatedRepo = null;
                urlInput.value = '';
                statusBox.textContent = '';
                await renderRepoList();
                if (typeof onChanged === 'function') onChanged();
            } catch (error) {
                confirmBtn.disabled = false;
                simpleToast({ content: error.message, type: 'error' });
            }
        });

        previewActions.appendChild(confirmBtn);
        card.append(head, descEl, metaGrid, previewActions);
        statusBox.appendChild(card);
    };

    const runPreviewFetch = async () => {
        validatedRepo = null;
        checkBtn.disabled = true;
        statusBox.textContent = '';

        const loadingEl = document.createElement('p');
        loadingEl.className = 'ext-perm-intro';
        loadingEl.textContent = t('extensions.repoFetching');
        statusBox.appendChild(loadingEl);

        try {
            const result = await fetchAndValidateRegistry(urlInput.value);
            validatedRepo = result;
            renderPreview(result);
        } catch (error) {
            statusBox.textContent = '';
            const errEl = document.createElement('div');
            errEl.className = 'ext-card-error';
            errEl.textContent = error.message;
            statusBox.appendChild(errEl);
        } finally {
            checkBtn.disabled = false;
        }
    };

    checkBtn.addEventListener('click', runPreviewFetch);
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            runPreviewFetch();
        }
    });
    urlInput.addEventListener('input', () => {
        if (validatedRepo && urlInput.value.trim() !== validatedRepo.url) {
            validatedRepo = null;
            statusBox.textContent = '';
        }
    });

    addSection.append(hint, inputRow, statusBox);

    renderRepoList();

    const noteEl = document.createElement('p');
    noteEl.className = 'ext-perm-intro';
    noteEl.textContent = t('extensions.repoRemoveNote');

    body.append(addSection, listEl, noteEl);

    popupWindow({
        title: t('extensions.repoManageTitle'),
        customContent: body,
        width: 580,
        maxWidth: 660,
        buttons: [
            {
                text: t('extensions.close'),
                hideOnClick: true
            }
        ]
    });
}

/**
 * 建構第二頁「擴充來源」分頁內容（排版參照專案總管雲端分頁）
 * @param {Function} onExtensionInstalled
 */
function buildRepositoriesTab(onExtensionInstalled) {
    const root = document.createElement('div');
    root.className = 'drive-tab-root ext-repo-tab-root';

    // 1. 頂部來源工具列（參照 drive-account-bar）
    const topBar = document.createElement('div');
    topBar.className = 'drive-account-bar ext-repo-bar';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'drive-account-avatar-placeholder';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined';
    iconSpan.setAttribute('translate', 'no');
    iconSpan.style.fontSize = '20px';
    iconSpan.textContent = 'extension';
    iconWrap.appendChild(iconSpan);

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'popup-input ext-repo-search';
    searchInput.placeholder = t('extensions.repoSearchPlaceholder');
    searchInput.setAttribute('aria-label', t('extensions.repoSearchPlaceholder'));
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'drive-account-actions';

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'drive-refresh-btn';
    settingsBtn.title = t('extensions.repoManageTitle');
    settingsBtn.setAttribute('aria-label', t('extensions.repoManageTitle'));
    const settingsIcon = document.createElement('span');
    settingsIcon.className = 'material-symbols-outlined';
    settingsIcon.setAttribute('translate', 'no');
    settingsIcon.textContent = 'settings';
    settingsBtn.appendChild(settingsIcon);

    const refreshAllBtn = document.createElement('button');
    refreshAllBtn.type = 'button';
    refreshAllBtn.className = 'drive-refresh-btn';
    refreshAllBtn.title = t('extensions.repoRefreshAll');
    const refreshIcon = document.createElement('span');
    refreshIcon.className = 'material-symbols-outlined';
    refreshIcon.setAttribute('translate', 'no');
    refreshIcon.textContent = 'sync';
    refreshAllBtn.appendChild(refreshIcon);

    actionsWrap.append(settingsBtn, refreshAllBtn);
    topBar.append(iconWrap, searchInput, actionsWrap);

    // 2. 離線快取或錯誤狀態提示列
    const noticeBar = document.createElement('div');
    noticeBar.className = 'ext-repo-cache-notice';
    noticeBar.style.display = 'none';

    // 3. 尚未加入資料源時的引導視圖（參照 drive-not-signed-in）
    const emptyGuide = document.createElement('div');
    emptyGuide.className = 'drive-not-signed-in ext-repo-empty';
    emptyGuide.style.display = 'none';

    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'material-symbols-outlined drive-cloud-icon';
    emptyIcon.setAttribute('translate', 'no');
    emptyIcon.textContent = 'cloud_off';

    const emptyTitle = document.createElement('div');
    emptyTitle.className = 'drive-not-signed-in-title';
    emptyTitle.textContent = t('extensions.repoEmptyTitle');

    const emptySub = document.createElement('div');
    emptySub.className = 'drive-not-signed-in-sub';
    emptySub.textContent = t('extensions.repoEmptyHint');

    const emptyAddBtn = document.createElement('button');
    emptyAddBtn.type = 'button';
    emptyAddBtn.className = 'ext-card-btn is-primary';
    emptyAddBtn.textContent = t('extensions.repoAddBtn');

    emptyGuide.append(emptyIcon, emptyTitle, emptySub, emptyAddBtn);

    // 4. 資料源擴充套件卡片網格
    const repoGrid = document.createElement('div');
    repoGrid.className = 'pm-grid ext-card-grid ext-repo-grid';

    root.append(noticeBar, emptyGuide, repoGrid);

    let searchQuery = '';
    let isRefreshing = false;

    const getInstalledMetaMap = async () => {
        const storedMetaList = await listStoredExtensionMeta();
        const storedById = new Map(storedMetaList.map((m) => [m.id, m]));
        const installedMap = new Map();
        for (const item of extensionManager.list()) {
            const meta = storedById.get(item.manifest.id);
            installedMap.set(item.manifest.id, {
                version: item.manifest.version,
                sourceRepoUrl: meta?.sourceRepoUrl || null,
                packageSha256: meta?.packageSha256 || null
            });
        }
        return installedMap;
    };

    const handleInstallFromRepo = async (repo, ext, actionBtn) => {
        actionBtn.disabled = true;
        const originalText = actionBtn.textContent;
        actionBtn.textContent = t('extensions.repoDownloading');

        try {
            const zipBlob = await downloadAndVerifyPackage(ext, repo.url);
            const pkg = await parseExtensionZip(zipBlob);
            if (pkg.manifest.id !== ext.id) {
                throw new Error(t('extensions.repoErrIdMismatch'));
            }
            const approved = await confirmInstallPermissions(pkg);
            if (!approved) {
                actionBtn.disabled = false;
                actionBtn.textContent = originalText;
                return;
            }

            await installExtensionPackage(pkg, {
                sourceRepoUrl: repo.url,
                packageSha256: ext.sha256
            });

            simpleToast({
                content: t('extensions.installSuccess', { name: pkg.manifest.name }),
                type: 'success'
            });
            if (typeof onExtensionInstalled === 'function') {
                onExtensionInstalled();
            }
            await renderRepoTab();
        } catch (error) {
            console.error('[ExtensionManagerModal] 從資料源安裝失敗:', error);
            simpleToast({
                content: t('extensions.installFailed', { error: error.message }),
                type: 'error'
            });
            actionBtn.disabled = false;
            actionBtn.textContent = originalText;
        }
    };

    const renderRepoTab = async () => {
        const repos = await listExtensionRepos();

        searchInput.disabled = repos.length === 0;
        refreshAllBtn.disabled = repos.length === 0 || isRefreshing;

        if (repos.length === 0) {
            noticeBar.style.display = 'none';
            emptyGuide.style.display = 'flex';
            repoGrid.style.display = 'none';
            return;
        }

        emptyGuide.style.display = 'none';
        repoGrid.style.display = '';

        // WERP 8：離線快取或失敗狀態明確標示，避免誤導為即時更新結果
        const errorRepos = repos.filter((r) => r.lastError);
        if (errorRepos.length > 0) {
            noticeBar.style.display = 'block';
            noticeBar.textContent = t('extensions.repoCacheNotice', { count: errorRepos.length });
        } else {
            noticeBar.style.display = 'none';
        }

        const installedMap = await getInstalledMetaMap();
        repoGrid.textContent = '';

        const keyword = searchQuery.trim().toLowerCase();
        const entries = [];
        for (const repo of repos) {
            const list = repo.cachedIndex?.extensions || [];
            for (const ext of list) {
                if (keyword) {
                    const haystack = `${ext.name}\n${ext.id}\n${ext.description || ''}\n${repo.name || ''}`.toLowerCase();
                    if (!haystack.includes(keyword)) continue;
                }
                entries.push({ repo, ext });
            }
        }

        if (entries.length === 0) {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'ext-empty-state';
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'ext-empty-title';
            emptyMsg.textContent = keyword
                ? t('extensions.repoNoSearchResults')
                : t('extensions.repoNoExtensions');
            emptyBox.appendChild(emptyMsg);
            repoGrid.appendChild(emptyBox);
            return;
        }

        for (const { repo, ext } of entries) {
            const status = getRepoExtensionStatus(ext, repo.url, installedMap);
            const card = document.createElement('div');
            card.className = 'pm-card ext-card';

            const header = document.createElement('div');
            header.className = 'ext-card-header';

            const titleWrap = document.createElement('div');
            titleWrap.className = 'ext-card-title-wrap';

            const titleEl = document.createElement('strong');
            titleEl.className = 'ext-card-title';
            titleEl.textContent = ext.name;

            const versionEl = document.createElement('span');
            versionEl.className = 'ext-card-version';
            versionEl.textContent = `v${ext.version}`;

            titleWrap.append(titleEl, versionEl);
            header.appendChild(titleWrap);

            if (status !== 'not_installed') {
                const badge = document.createElement('span');
                if (status === 'update_available') {
                    badge.className = 'ext-status-badge is-update';
                    badge.textContent = t('extensions.repoBadgeUpdate');
                } else if (status === 'hash_changed') {
                    badge.className = 'ext-status-badge is-error';
                    badge.textContent = t('extensions.repoBadgeHashChanged');
                } else if (status === 'installed_other_source') {
                    badge.className = 'ext-status-badge is-inactive';
                    badge.textContent = t('extensions.repoBadgeOtherSource');
                } else {
                    badge.className = 'ext-status-badge is-active';
                    badge.textContent = t('extensions.repoInstalled');
                }
                header.appendChild(badge);
            }

            card.appendChild(header);

            const idEl = document.createElement('div');
            idEl.className = 'ext-card-id';
            idEl.textContent = `${ext.id} · ${repo.name}`;
            card.appendChild(idEl);

            const summaryEl = document.createElement('div');
            summaryEl.className = 'ext-card-summary';
            summaryEl.textContent = ext.description || t('extensions.noDescription');
            card.appendChild(summaryEl);

            const actions = document.createElement('div');
            actions.className = 'ext-card-actions';

            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'ext-card-btn';

            if (status === 'not_installed') {
                actionBtn.classList.add('is-primary');
                actionBtn.textContent = t('extensions.repoInstall');
                actionBtn.addEventListener('click', () => handleInstallFromRepo(repo, ext, actionBtn));
            } else if (status === 'update_available') {
                actionBtn.classList.add('is-primary');
                actionBtn.textContent = t('extensions.repoUpdate');
                actionBtn.addEventListener('click', () => handleInstallFromRepo(repo, ext, actionBtn));
            } else if (status === 'hash_changed') {
                actionBtn.classList.add('is-danger');
                actionBtn.textContent = t('extensions.repoReinstall');
                actionBtn.addEventListener('click', () => handleInstallFromRepo(repo, ext, actionBtn));
            } else if (status === 'installed_other_source') {
                actionBtn.textContent = t('extensions.repoOtherSource');
                actionBtn.disabled = true;
            } else {
                actionBtn.textContent = t('extensions.repoInstalled');
                actionBtn.disabled = true;
            }

            actions.appendChild(actionBtn);
            card.appendChild(actions);
            repoGrid.appendChild(card);
        }
    };

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        renderRepoTab();
    });

    const openManageModal = () => openManageReposModal(renderRepoTab);

    settingsBtn.addEventListener('click', openManageModal);
    emptyAddBtn.addEventListener('click', openManageModal);

    refreshAllBtn.addEventListener('click', async () => {
        if (isRefreshing) return;
        isRefreshing = true;
        refreshAllBtn.disabled = true;
        refreshIcon.classList.add('is-spinning');
        try {
            await refreshAllExtensionRepos();
            await renderRepoTab();
        } finally {
            isRefreshing = false;
            refreshIcon.classList.remove('is-spinning');
            refreshAllBtn.disabled = false;
        }
    });

    return {
        topBar,
        element: root,
        refresh: renderRepoTab
    };
}

/**
 * 開啟參照專案總管設計的擴充程式管理視窗
 */
export function openExtensionManagerModal() {
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'pm-wrapper ext-modal-wrapper';

    const tabBar = document.createElement('div');
    tabBar.className = 'pm-tab-bar';

    const installedTabBtn = document.createElement('button');
    installedTabBtn.type = 'button';
    installedTabBtn.className = 'pm-tab-btn pm-tab-btn--active';
    installedTabBtn.setAttribute('data-i18n', 'extensions.tabInstalled');
    installedTabBtn.textContent = t('extensions.tabInstalled');

    const reposTabBtn = document.createElement('button');
    reposTabBtn.type = 'button';
    reposTabBtn.className = 'pm-tab-btn';
    reposTabBtn.setAttribute('data-i18n', 'extensions.tabRepositories');
    reposTabBtn.textContent = t('extensions.tabRepositories');

    tabBar.append(installedTabBtn, reposTabBtn);

    const listContainer = document.createElement('div');
    listContainer.className = 'pm-tab-content popup-list';

    const grid = document.createElement('div');
    grid.className = 'pm-grid ext-card-grid';
    listContainer.appendChild(grid);

    const renderGrid = () => {
        grid.textContent = '';
        const list = extensionManager.list();

        if (list.length === 0) {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'ext-empty-state';

            const emptyTitle = document.createElement('p');
            emptyTitle.className = 'ext-empty-title';
            emptyTitle.setAttribute('data-i18n', 'extensions.empty');
            emptyTitle.textContent = t('extensions.empty');

            const emptyHint = document.createElement('p');
            emptyHint.className = 'ext-empty-hint';
            emptyHint.setAttribute('data-i18n', 'extensions.emptyHint');
            emptyHint.textContent = t('extensions.emptyHint');

            emptyBox.append(emptyTitle, emptyHint);
            grid.appendChild(emptyBox);
            return;
        }

        for (const item of list) {
            const card = document.createElement('div');
            card.className = 'pm-card ext-card';

            const header = document.createElement('div');
            header.className = 'ext-card-header';

            const titleWrap = document.createElement('div');
            titleWrap.className = 'ext-card-title-wrap';

            const titleEl = document.createElement('strong');
            titleEl.className = 'ext-card-title';
            titleEl.textContent = item.manifest.name;

            const versionEl = document.createElement('span');
            versionEl.className = 'ext-card-version';
            versionEl.textContent = `v${item.manifest.version}`;

            titleWrap.append(titleEl, versionEl);

            const statusBadge = document.createElement('span');
            statusBadge.className = `ext-status-badge ${getStatusClass(item.status)}`;
            statusBadge.setAttribute('data-i18n', getStatusKey(item.status));
            statusBadge.textContent = getStatusText(item.status);

            header.append(titleWrap, statusBadge);
            card.appendChild(header);

            const idEl = document.createElement('div');
            idEl.className = 'ext-card-id';
            idEl.textContent = item.manifest.id;
            card.appendChild(idEl);

            const summaryEl = document.createElement('div');
            if (item.error) {
                summaryEl.className = 'ext-card-summary is-error';
                summaryEl.setAttribute('data-i18n', 'extensions.hasErrorHint');
                summaryEl.textContent = t('extensions.hasErrorHint');
            } else {
                const permCount = (item.manifest.permissions || []).length;
                summaryEl.className = 'ext-card-summary';
                summaryEl.textContent = permCount > 0
                    ? t('extensions.permCount', { count: permCount })
                    : t('extensions.noPermissions');
            }
            card.appendChild(summaryEl);

            const actions = document.createElement('div');
            actions.className = 'ext-card-actions';

            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'ext-card-btn';
            viewBtn.setAttribute('data-i18n', 'extensions.view');
            viewBtn.textContent = t('extensions.view');
            viewBtn.addEventListener('click', () => {
                openExtensionDetailModal(item);
            });

            const isActive = item.status === 'active';
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'ext-card-btn';
            toggleBtn.setAttribute('data-i18n', isActive ? 'extensions.disable' : 'extensions.enable');
            toggleBtn.textContent = isActive ? t('extensions.disable') : t('extensions.enable');
            toggleBtn.addEventListener('click', async () => {
                await toggleInstalledExtension(item.manifest.id, !isActive);
                renderGrid();
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'ext-card-btn is-danger';
            removeBtn.setAttribute('data-i18n', 'extensions.remove');
            removeBtn.textContent = t('extensions.remove');
            removeBtn.addEventListener('click', async () => {
                await uninstallExtension(item.manifest.id);
                simpleToast({
                    content: t('extensions.removedSuccess', { name: item.manifest.name }),
                    type: 'info'
                });
                renderGrid();
            });

            actions.append(viewBtn, toggleBtn, removeBtn);
            card.appendChild(actions);
            grid.appendChild(card);
        }
    };

    renderGrid();

    const reposContainer = document.createElement('div');
    reposContainer.className = 'pm-tab-content popup-list';
    reposContainer.style.display = 'none';

    const reposTab = buildRepositoriesTab(() => {
        renderGrid();
    });
    reposTab.topBar.style.display = 'none';
    reposContainer.appendChild(reposTab.element);

    installedTabBtn.addEventListener('click', () => {
        installedTabBtn.classList.add('pm-tab-btn--active');
        reposTabBtn.classList.remove('pm-tab-btn--active');
        reposTab.topBar.style.display = 'none';
        listContainer.style.display = '';
        reposContainer.style.display = 'none';
        renderGrid();
    });

    reposTabBtn.addEventListener('click', () => {
        reposTabBtn.classList.add('pm-tab-btn--active');
        installedTabBtn.classList.remove('pm-tab-btn--active');
        reposTab.topBar.style.display = '';
        listContainer.style.display = 'none';
        reposContainer.style.display = 'flex';
        reposTab.refresh();
    });

    const betaBanner = document.createElement('p');
    betaBanner.className = 'ext-perm-warning';
    betaBanner.setAttribute('data-i18n', 'extensions.betaNotice');
    betaBanner.textContent = t('extensions.betaNotice');

    mainWrapper.append(tabBar, reposTab.topBar, listContainer, reposContainer, betaBanner);

    return popupWindow({
        title: t('extensions.title'),
        customContent: mainWrapper,
        width: 760,
        maxWidth: 840,
        buttons: [
            {
                text: t('extensions.importZip'),
                onClick: () => triggerZipPicker(renderGrid)
            },
            {
                text: t('extensions.close'),
                hideOnClick: true
            }
        ]
    });
}

