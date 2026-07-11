// 初始化資料庫
console.log("[IndexDB] 正在初始化 IndexedDB...");
const dbName = "SimaiEditorDB";
const storeName = "editorState";
openDB().then(() => {
    console.log("[IndexDB] IndexedDB 初始化完成");
}).catch((error) => {
    console.error("[IndexDB] IndexedDB 初始化失敗:", error);
});

export function openDB() {
    return new Promise((resolve, reject) => {
        // 先用不帶版本號的 open 取得目前 DB，若發現缺少 objectStore 再進行升級
        const request = indexedDB.open(dbName);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            if (db.objectStoreNames.contains(storeName)) {
                resolve(db);
                return;
            }

            // 如果目前 DB 沒有我們要的 store，關閉並用更高版本觸發 onupgradeneeded
            const newVersion = db.version + 1;
            db.close();
            const upgradeReq = indexedDB.open(dbName, newVersion);

            upgradeReq.onupgradeneeded = () => {
                const upgradeDb = upgradeReq.result;
                if (!upgradeDb.objectStoreNames.contains(storeName)) {
                    upgradeDb.createObjectStore(storeName);
                }
            };

            upgradeReq.onsuccess = () => resolve(upgradeReq.result);
            upgradeReq.onerror = () => reject(upgradeReq.error);
        };

        request.onerror = () => reject(request.error);
    });
}

// 讀取資料
export async function idbGet(key) {
    try {
        const db = await openDB();
        return await new Promise((resolve) => {
            try {
                const transaction = db.transaction(storeName, "readonly");
                const request = transaction.objectStore(storeName).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    console.warn("[IndexDB] idbGet request error:", request.error);
                    resolve(null);
                };
            } catch (e) {
                console.warn("[IndexDB] idbGet transaction failed:", e);
                resolve(null);
            }
        });
    } catch (e) {
        console.warn("[IndexDB] idbGet openDB failed:", e);
        return null;
    }
}

// 寫入資料
export async function idbSet(key, value) {
    try {
        const db = await openDB();
        return await new Promise((resolve) => {
            try {
                const transaction = db.transaction(storeName, "readwrite");
                const request = transaction.objectStore(storeName).put(value, key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.warn("[IndexDB] idbSet request error:", request.error);
                    resolve(false);
                };
            } catch (e) {
                console.warn("[IndexDB] idbSet transaction failed:", e);
                resolve(false);
            }
        });
    } catch (e) {
        console.warn("[IndexDB] idbSet openDB failed:", e);
        return false;
    }
}

// 刪除資料
export async function idbDelete(key) {
    try {
        const db = await openDB();
        return await new Promise((resolve) => {
            try {
                const transaction = db.transaction(storeName, "readwrite");
                const request = transaction.objectStore(storeName).delete(key);
                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.warn("[IndexDB] idbDelete request error:", request.error);
                    resolve(false);
                };
            } catch (e) {
                console.warn("[IndexDB] idbDelete transaction failed:", e);
                resolve(false);
            }
        });
    } catch (e) {
        console.warn("[IndexDB] idbDelete openDB failed:", e);
        return false;
    }
}

// ============================================================
// 專案管理層 (Project Management Layer)
// ============================================================

const PROJECT_LIST_KEY = '__project_list__';

// 專案命名空間下的 key：proj_{projectId}_{key}
function projKey(projectId, key) {
    return `proj_${projectId}_${key}`;
}

/**
 * 讀取專案專屬資料
 */
export function idbGetProject(projectId, key) {
    return idbGet(projKey(projectId, key));
}

/**
 * 寫入專案專屬資料
 */
export function idbSetProject(projectId, key, value) {
    return idbSet(projKey(projectId, key), value);
}

/**
 * 產生唯一的專案 ID（時間戳 base36 + 隨機碼）
 */
function generateProjectId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 取得所有專案的 metadata 清單
 * @returns {Promise<Array<{id: string, name: string, createdAt: number, updatedAt: number}>>}
 */
export async function projectList() {
    const list = await idbGet(PROJECT_LIST_KEY);
    return Array.isArray(list) ? list : [];
}

/**
 * 儲存專案清單
 */
async function saveProjectList(list) {
    await idbSet(PROJECT_LIST_KEY, list);
}

/**
 * 建立新專案
 * @param {string} name - 專案名稱
 * @returns {Promise<string>} 新專案的 ID
 */
export async function projectCreate(name = '未命名專案') {
    const id = generateProjectId();
    const now = Date.now();
    const list = await projectList();
    list.push({ id, name, createdAt: now, updatedAt: now });
    await saveProjectList(list);
    console.log(`[Project] 已建立專案: "${name}" (${id})`);
    return id;
}

/**
 * 刪除專案（清除其所有 key 與 metadata）
 * @param {string} projectId
 */
export async function projectDelete(projectId) {
    // 1. 從清單中移除
    const list = await projectList();
    const filtered = list.filter(p => p.id !== projectId);
    await saveProjectList(filtered);

    // 2. 刪除該專案的所有 key
    try {
        const db = await openDB();
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
            const prefix = `proj_${projectId}_`;
            for (const key of keysReq.result) {
                if (typeof key === 'string' && key.startsWith(prefix)) {
                    store.delete(key);
                }
            }
        };
    } catch (e) {
        console.warn("[Project] 刪除專案資料時發生錯誤:", e);
    }

    console.log(`[Project] 已刪除專案: ${projectId}`);
}

/**
 * 重新命名專案
 */
export async function projectRename(projectId, newName) {
    const list = await projectList();
    const project = list.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        project.updatedAt = Date.now();
        await saveProjectList(list);
        console.log(`[Project] 專案重新命名為: "${newName}"`);
    }
}

/**
 * 更新專案的 updatedAt 時間戳
 */
export async function projectTouch(projectId) {
    const list = await projectList();
    const project = list.find(p => p.id === projectId);
    if (project) {
        project.updatedAt = Date.now();
        await saveProjectList(list);
    }
}

/**
 * 更新專案名稱（通常在 saveMaidata 時一併呼叫）
 */
export async function projectUpdateName(projectId, name) {
    if (!name) return;
    const list = await projectList();
    const project = list.find(p => p.id === projectId);
    if (project && project.name !== name) {
        project.name = name;
        project.updatedAt = Date.now();
        await saveProjectList(list);
    }
}

/**
 * 從舊版 simai_* key 遷移至專案系統
 * 只在首次升級時執行一次
 * @returns {Promise<string|null>} 遷移後的專案 ID，若無需遷移則回傳 null
 */
export async function migrateFromLegacy() {
    // 如果已經有專案清單了，代表已遷移過或已在新系統
    const list = await projectList();
    if (list.length > 0) return null;

    // 檢查是否存在舊 key
    const legacyMaidata = await idbGet('simai_maidata');
    const legacyBgm = await idbGet('simai_resource_bgm');
    const legacyBg = await idbGet('simai_background_image');
    const legacyBgVideo = await idbGet('simai_background_video');
    const legacyDiff = await idbGet('simai_now_difficulty');
    const legacyTime = await idbGet('simai_timeControl');
    const legacyReady = await idbGet('simai_ready_beat');
    const legacyHide = await idbGet('simai_hide_editor');

    const hasLegacy = legacyMaidata || legacyBgm || legacyBg || legacyBgVideo;

    if (!hasLegacy) {
        // 沒有任何舊資料，不需要遷移
        return null;
    }

    console.log("[Project] 偵測到舊版資料，正在遷移...");

    // 建立「預設專案」
    const projectName = (legacyMaidata && legacyMaidata.title) || '預設專案';
    const projectId = await projectCreate(projectName);

    // 將舊 key 搬到新命名空間
    const migrations = [
        ['maidata', legacyMaidata],
        ['resource_bgm', legacyBgm],
        ['background_image', legacyBg],
        ['background_video', legacyBgVideo],
        ['now_difficulty', legacyDiff],
        ['timeControl', legacyTime],
        ['ready_beat', legacyReady],
        ['hide_editor', legacyHide],
    ];

    for (const [key, value] of migrations) {
        if (value !== undefined && value !== null) {
            await idbSetProject(projectId, key, value);
        }
    }

    console.log(`[Project] 遷移完成，已建立專案 "${projectName}" (${projectId})`);
    return projectId;
}