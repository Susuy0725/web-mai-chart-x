import { projectList, projectCreate, projectDelete, projectRename } from '../indexDB.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟專案總管 UI
 * @param {Object} options
 * @param {Function} options.getCurrentProjectId
 * @param {Function} options.loadProject
 */
export function openProjectManager({ getCurrentProjectId, loadProject }) {
    const buildList = async (container) => {
        container.innerHTML = '';
        const list = await projectList();

        if (list.length === 0) {
            container.innerHTML = '<div style="color: var(--popup-text-muted); text-align: center; padding: 28px 0; font-size: 13px;">尚無任何專案</div>';
            return;
        }

        // 按更新時間排序（最近的在上）
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        const currentProjectId = typeof getCurrentProjectId === 'function' ? getCurrentProjectId() : null;

        for (const proj of list) {
            const isCurrent = proj.id === currentProjectId;
            const row = document.createElement('div');
            row.className = `popup-list-item ${isCurrent ? 'active' : ''}`;

            // 左側：名稱 + 時間
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex: 1; min-width: 0; overflow: hidden;';

            const nameHeader = document.createElement('div');
            nameHeader.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden;';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'popup-list-item-title';
            nameSpan.textContent = proj.name || '未命名專案';
            nameHeader.appendChild(nameSpan);

            if (isCurrent) {
                const badge = document.createElement('span');
                badge.className = 'popup-badge popup-badge-accent';
                badge.textContent = '目前使用中';
                nameHeader.appendChild(badge);
            }

            const timeSpan = document.createElement('span');
            timeSpan.className = 'popup-list-item-sub';
            const d = new Date(proj.updatedAt || proj.createdAt);
            timeSpan.textContent = `上次編輯：${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

            infoDiv.appendChild(nameHeader);
            infoDiv.appendChild(timeSpan);

            // 右側：按鈕組
            const btnGroup = document.createElement('div');
            btnGroup.className = 'popup-list-actions';

            if (!isCurrent) {
                const openBtn = document.createElement('button');
                openBtn.className = 'popup-btn popup-btn-sm popup-btn-success';
                openBtn.textContent = '開啟';
                openBtn.onclick = async () => {
                    if (typeof loadProject === 'function') {
                        const loaded = await loadProject(proj.id);
                        simpleToast({ content: `已切換至專案：${loaded?.name || proj?.name || '未命名'}`, type: 'success', timeout: 1500 });
                    }
                    buildList(container);
                };
                btnGroup.appendChild(openBtn);
            }

            const renameBtn = document.createElement('button');
            renameBtn.className = 'popup-btn popup-btn-sm popup-btn-secondary';
            renameBtn.textContent = '重新命名';
            renameBtn.onclick = async () => {
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    buildList(container);
                }
            };
            btnGroup.appendChild(renameBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'popup-btn popup-btn-sm popup-btn-danger';
            deleteBtn.textContent = '刪除';
            deleteBtn.onclick = async () => {
                if (isCurrent) {
                    alert('無法刪除目前正在使用的專案。\n請先切換到其他專案後再刪除。');
                    return;
                }
                if (!confirm(`確定要刪除專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`)) return;
                await projectDelete(proj.id);
                buildList(container);
                simpleToast({ content: '已刪除專案', type: 'success', timeout: 1200 });
            };
            btnGroup.appendChild(deleteBtn);

            row.appendChild(infoDiv);
            row.appendChild(btnGroup);
            container.appendChild(row);
        }
    };

    const container = document.createElement('div');
    container.className = 'popup-list';
    container.style.cssText = 'max-height: 380px; overflow-y: auto; padding-right: 4px;';

    buildList(container);

    popupWindow({
        title: "專案總管",
        customContent: container,
        width: 500,
        maxWidth: 580,
        buttons: [
            {
                text: "新建空白專案",
                onClick: async () => {
                    const name = prompt('請輸入專案名稱：', '未命名專案');
                    if (name === null) return;
                    const newId = await projectCreate(name.trim() || t('popup.projectManager.untitled'));
                    if (typeof loadProject === 'function') {
                        const proj = await loadProject(newId);
                        simpleToast({ content: `已切換至專案：${proj?.name || '未命名'}`, type: 'success', timeout: 1500 });
                    }
                    buildList(container);
                }
            },
            {
                text: t('popup.close'),
                hideOnClick: true,
            }
        ]
    });
}
