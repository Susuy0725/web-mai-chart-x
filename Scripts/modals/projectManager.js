import { projectList, projectCreate, projectDelete, projectRename } from '../indexDB.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟專案總管 UI
 */
export function openProjectManager({ getCurrentProjectId, loadProject }) {
    const setStyle = (el, styles) => Object.assign(el.style, styles);

    const buildList = async (container) => {
        container.innerHTML = '';
        const list = await projectList();

        if (list.length === 0) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">尚無任何專案</div>';
            return;
        }

        // 按更新時間排序（最近的在上）
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        const currentProjectId = typeof getCurrentProjectId === 'function' ? getCurrentProjectId() : null;

        for (const proj of list) {
            const isCurrent = proj.id === currentProjectId;
            const row = document.createElement('div');
            setStyle(row, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: isCurrent ? '#333' : '#1a1a1a',
                border: isCurrent ? '1px solid #ccc' : '1px solid #333',
                borderRadius: '6px',
                marginBottom: '6px',
                gap: '8px',
                transition: 'background 0.15s',
            });

            // 左側：名稱 + 時間
            const infoDiv = document.createElement('div');
            setStyle(infoDiv, { flex: '1', minWidth: '0', overflow: 'hidden' });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = proj.name || '未命名專案';
            setStyle(nameSpan, {
                fontWeight: '600',
                fontSize: '13px',
                color: isCurrent ? '#fff' : '#ccc',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            });
            if (isCurrent) nameSpan.textContent += ' （目前）';

            const timeSpan = document.createElement('span');
            const d = new Date(proj.updatedAt || proj.createdAt);
            timeSpan.textContent = `上次編輯：${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
            setStyle(timeSpan, { fontSize: '10px', color: '#888', display: 'block', marginTop: '2px' });

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(timeSpan);

            // 右側：按鈕
            const btnGroup = document.createElement('div');
            setStyle(btnGroup, { display: 'flex', gap: '4px', flexShrink: '0' });

            const makeBtn = (text, onClick, color = '#404040') => {
                const btn = document.createElement('button');
                btn.textContent = text;
                setStyle(btn, {
                    background: color,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                });
                btn.addEventListener('mouseenter', () => btn.style.opacity = '0.8');
                btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
                btn.onclick = onClick;
                return btn;
            };

            if (!isCurrent) {
                btnGroup.appendChild(makeBtn('開啟', async () => {
                    if (typeof loadProject === 'function') {
                        const loaded = await loadProject(proj.id);
                        simpleToast({ content: `已切換至專案：${loaded?.name || proj?.name || '未命名'}`, type: 'success', timeout: 1500 });
                    }
                    buildList(container);
                }, '#2d6e2d'));
            }

            btnGroup.appendChild(makeBtn('重新命名', async () => {
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    buildList(container);
                }
            }));

            btnGroup.appendChild(makeBtn('刪除', async () => {
                if (isCurrent) {
                    alert('無法刪除目前正在使用的專案。\n請先切換到其他專案後再刪除。');
                    return;
                }
                if (!confirm(`確定要刪除專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`)) return;
                await projectDelete(proj.id);
                buildList(container);
                simpleToast({ content: '已刪除專案', type: 'success', timeout: 1200 });
            }, '#6e2d2d'));

            row.appendChild(infoDiv);
            row.appendChild(btnGroup);
            container.appendChild(row);
        }
    };

    const container = document.createElement('div');
    setStyle(container, {
        maxHeight: '350px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#555 transparent',
    });

    buildList(container);

    popupWindow({
        title: "專案總管",
        customContent: container,
        width: 480,
        maxWidth: 560,
        buttons: [
            {
                text: "新建空白專案",
                onClick: async () => {
                    const name = prompt('請輸入專案名稱：', '未命名專案');
                    if (name === null) return;
                    const newId = await projectCreate(t('popup.projectManager.untitled'));
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
