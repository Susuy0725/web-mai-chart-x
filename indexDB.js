// 初始化資料庫
console.log("[IndexDB] 正在初始化 IndexedDB...");
const dbName = "SimaiEditorDB";
const storeName = "editorState";
openDB().then(() => {
    console.log("[IndexDB] IndexedDB 初始化完成");
}).catch((error) => {
    console.error("[IndexDB] IndexedDB 初始化失敗:", error);
});

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 讀取資料
export async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result);
    });
}

// 寫入資料
export async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const request = transaction.objectStore(storeName).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}