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