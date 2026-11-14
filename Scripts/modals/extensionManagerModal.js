/**
 * @file extensionManagerModal.js
 * @description 參照專案總管版面設計的擴充程式管理視窗，支援手動匯入 .zip 外掛、權限確認、啟用切換與移除。
 */

import { extensionManager } from '../core/extensionManager.js';
import {
    parseExtensionZip,
    installExtensionPackage,
    toggleInstalledExtension,
    uninstallExtension
} from '../core/extensionLoader.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

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

        const body = document.createElement('div');
        body.className = 'ext-perm-confirm';

        const intro = document.createElement('p');
        intro.className = 'ext-perm-intro';
        intro.textContent = t('extensions.confirmInstallDesc', {
            name: pkg.manifest.name,
            version: pkg.manifest.version
        });
        body.appendChild(intro);

        const listTitle = document.createElement('div');
        listTitle.className = 'ext-perm-title';
        listTitle.setAttribute('data-i18n', 'extensions.requestedPermissions');
        listTitle.textContent = t('extensions.requestedPermissions');
        body.appendChild(listTitle);

        const permList = document.createElement('ul');
        permList.className = 'ext-perm-list';
        const perms = pkg.manifest.permissions || [];
        if (perms.length === 0) {
            const li = document.createElement('li');
            li.setAttribute('data-i18n', 'extensions.noPermissions');
            li.textContent = t('extensions.noPermissions');
            permList.appendChild(li);
        } else {
            for (const perm of perms) {
                const li = document.createElement('li');
                li.textContent = perm;
                permList.appendChild(li);
            }
        }
        body.appendChild(permList);

        const warning = document.createElement('p');
        warning.className = 'ext-perm-warning';
        warning.setAttribute('data-i18n', 'extensions.securityWarning');
        warning.textContent = t('extensions.securityWarning');
        body.appendChild(warning);

        popupWindow({
            title: t('extensions.confirmInstallTitle'),
            content: body,
            width: 420,
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

            if (item.manifest.permissions && item.manifest.permissions.length > 0) {
                const permWrap = document.createElement('div');
                permWrap.className = 'ext-card-perms';
                for (const perm of item.manifest.permissions) {
                    const chip = document.createElement('span');
                    chip.className = 'ext-perm-chip';
                    chip.textContent = perm;
                    permWrap.appendChild(chip);
                }
                card.appendChild(permWrap);
            }

            if (item.error) {
                const errEl = document.createElement('div');
                errEl.className = 'ext-card-error';
                errEl.textContent = item.error;
                card.appendChild(errEl);
            }

            const actions = document.createElement('div');
            actions.className = 'ext-card-actions';

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

            actions.append(toggleBtn, removeBtn);
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

