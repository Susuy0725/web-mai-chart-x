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
    body.appendChild(metaCard);

    if (mode === 'detail' && error) {
        const errEl = document.createElement('div');
        errEl.className = 'ext-card-error';
        errEl.textContent = error;
        body.appendChild(errEl);
    }

    const listTitleKey = mode === 'install'
        ? 'extensions.requestedPermissions'
        : 'extensions.grantedPermissions';

    const listTitle = document.createElement('div');
    listTitle.className = 'ext-perm-title';
    listTitle.setAttribute('data-i18n', listTitleKey);
    listTitle.textContent = t(listTitleKey);
    body.appendChild(listTitle);

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
    body.appendChild(permList);

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

/**
 * 開啟參照專案總管設計的擴充程式管理視窗
 */
export function openExtensionManagerModal() {
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'pm-wrapper ext-modal-wrapper';

    const tabBar = document.createElement('div');
    tabBar.className = 'pm-tabs';

    const installedTabBtn = document.createElement('button');
    installedTabBtn.type = 'button';
    installedTabBtn.className = 'pm-tab-btn pm-tab-btn--active';
    installedTabBtn.setAttribute('data-i18n', 'extensions.tabInstalled');
    installedTabBtn.textContent = t('extensions.tabInstalled');
    tabBar.appendChild(installedTabBtn);

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
    mainWrapper.append(tabBar, listContainer);

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

