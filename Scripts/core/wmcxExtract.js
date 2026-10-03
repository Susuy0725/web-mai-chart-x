/**
 * wmcxExtract.js
 * 
 * 職責：
 * 專注於唯讀提取當前 origin 下的 IndexedDB (SimaiEditorDB) 用戶資料。
 * 零外部相依的原生 ES Module，可被本專案或其他同源頁面獨立調用。
 */

const DB_NAME = 'SimaiEditorDB';
const STORE_NAME = 'editorState';

// Windows 保留字
const WINDOWS_RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * 安全過濾目錄名稱，避免非法路徑與作業系統保留字
 * @param {string} rawName 
 * @returns {string}
 */
export function sanitizeFolderName(rawName) {
    if (!rawName || typeof rawName !== 'string') {
        return '未命名專案';
    }

    // 1. 移除控制字元 (0-31) 與 Windows 檔名非法字元 < > : " / \ | ? *
    let cleaned = rawName.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_');

    // 2. 移除前後空白與點 (Windows 不允許資料夾結尾為點或空格)
    cleaned = cleaned.trim().replace(/^\.+|\.+$/g, '');

    // 3. 檢查是否為 Windows 保留字
    const upper = cleaned.toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(upper)) {
        cleaned = `${cleaned}_`;
    }

    return cleaned || '未命名專案';
}

/**
 * 序列化 maidata 物件為純文字（相容 getSimaiDataString）
 * @param {object|string} maidata 
 * @returns {string}
 */
export function serializeMaidata(maidata) {
    if (!maidata) return '';
    if (typeof maidata === 'string') return maidata;
    if (typeof maidata !== 'object') return String(maidata);

    return '&' + Object.entries(maidata)
        .filter(([_, value]) => value !== undefined && value !== null && value.toString().trim().length > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n&');
}

/**
 * 讀取 Blob 前幾個 Byte 並轉為 16 進位字串
 * @param {Blob} blob 
 * @param {number} length 
 * @returns {Promise<string>}
 */
async function getBlobMagicHex(blob, length = 16) {
    try {
        const slice = blob.slice(0, length);
        const buffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (_) {
        return '';
    }
}

/**
 * 透過 File.name、MIME Type 與 Magic Bytes 精確判定媒體副檔名
 * @param {Blob|File} fileOrBlob 
 * @param {'track'|'bg'|'pv'} mediaCategory 
 * @returns {Promise<string>}
 */
export async function detectFileExtension(fileOrBlob, mediaCategory) {
    if (!fileOrBlob || !(fileOrBlob instanceof Blob)) {
        return getDefaultExtension(mediaCategory);
    }

    // 1. 優先檢查 File.name
    if (typeof fileOrBlob.name === 'string' && fileOrBlob.name.includes('.')) {
        const ext = fileOrBlob.name.split('.').pop().trim().toLowerCase();
        if (ext) return ext;
    }

    // 2. 次要檢查 MIME Type
    const mime = (fileOrBlob.type || '').toLowerCase();
    const mimeExtMap = {
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/ogg': 'ogg',
        'audio/opus': 'ogg',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/flac': 'flac',
        'audio/x-flac': 'flac',
        'audio/aac': 'aac',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/svg+xml': 'svg',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'video/x-matroska': 'mkv',
        'video/x-msvideo': 'avi'
    };
    if (mimeExtMap[mime]) {
        return mimeExtMap[mime];
    }

    // 3. 深入檢查二進制 Magic Bytes 檔案特徵簽章
    const hex = await getBlobMagicHex(fileOrBlob, 16);

    // 圖片簽章
    if (hex.startsWith('89504E47')) return 'png';
    if (hex.startsWith('FFD8FF')) return 'jpg';
    if (hex.startsWith('47494638')) return 'gif';
    if (hex.startsWith('424D')) return 'bmp';
    if (hex.startsWith('52494646') && hex.length >= 24 && hex.substring(16, 24) === '57454250') return 'webp';

    // 音訊簽章
    if (hex.startsWith('494433') || hex.startsWith('FFFB') || hex.startsWith('FFF3') || hex.startsWith('FFF2')) return 'mp3';
    if (hex.startsWith('4F676753')) return 'ogg';
    if (hex.startsWith('664C6143')) return 'flac';
    if (hex.startsWith('52494646') && hex.length >= 24 && hex.substring(16, 24) === '57415645') return 'wav';

    // 影片簽章
    if (hex.startsWith('1A45DFA3')) return 'webm';
    // MP4 標頭常見: 前4位為長度，5-8位為 'ftyp' (66747970)
    if (hex.length >= 16 && hex.substring(8, 16) === '66747970') return 'mp4';

    // 4. 回退預設副檔名
    return getDefaultExtension(mediaCategory);
}

function getDefaultExtension(mediaCategory) {
    switch (mediaCategory) {
        case 'track': return 'mp3';
        case 'bg': return 'png';
        case 'pv': return 'mp4';
        default: return 'bin';
    }
}

/**
 * 安全開啟 SimaiEditorDB（唯讀檢查，防止誤創空庫）
 * @returns {Promise<IDBDatabase>}
 */
export async function openSimaiDBReadOnly() {
    // 檢查瀏覽器是否支援 databases() 列舉 API
    if (typeof indexedDB.databases === 'function') {
        try {
            const dbs = await indexedDB.databases();
            const exists = dbs.some(d => d.name === DB_NAME);
            if (!exists) {
                throw new Error(`查無 ${DB_NAME} 資料庫，目前環境尚未建立任何專案或設定資料。`);
            }
        } catch (e) {
            if (e.message?.includes('查無')) throw e;
        }
    }

    return new Promise((resolve, reject) => {
        let isNewOrUpgrade = false;
        const req = indexedDB.open(DB_NAME);

        req.onupgradeneeded = (e) => {
            // 若觸發升級，代表先前不存在此資料庫。中止交易以防止建立空庫
            isNewOrUpgrade = true;
            try {
                if (req.transaction) {
                    req.transaction.abort();
                }
            } catch (_) {}
            reject(new Error(`查無 ${DB_NAME} 資料庫，目前環境尚未建立任何專案或設定資料。`));
        };

        req.onsuccess = () => {
            if (isNewOrUpgrade) return;
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.close();
                reject(new Error(`資料庫缺少 ${STORE_NAME} 物件存儲空間。`));
                return;
            }
            resolve(db);
        };

        req.onerror = () => {
            reject(req.error || new Error(`開啟 ${DB_NAME} 失敗。`));
        };
    });
}

/**
 * 讀取 store 內的所有鍵值對為 Map
 * @param {IDBDatabase} db 
 * @returns {Promise<Map<string, any>>}
 */
function readAllFromStore(db) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const map = new Map();

            // 使用 openCursor 遍歷所有鍵值
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    map.set(cursor.key, cursor.value);
                    cursor.continue();
                } else {
                    resolve(map);
                }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 主提取函式：從當前 origin 的 SimaiEditorDB 提取使用者設定與專案資料
 * @param {object} [options]
 * @param {(progress: { step: string, current: number, total: number, message: string }) => void} [options.onProgress]
 * @returns {Promise<{
 *   settingsEnvelope: object,
 *   projects: Array<{
 *     id: string,
 *     name: string,
 *     dirName: string,
 *     maidataText: string,
 *     bg: { blob: Blob, ext: string, filename: string } | null,
 *     track: { blob: Blob, ext: string, filename: string } | null,
 *     pv: { blob: Blob, ext: string, filename: string } | null
 *   }>,
 *   meta: { extractedAt: number, projectCount: number, origin: string }
 * }>}
 */
export async function extractSimaiEditorData(options = {}) {
    const { onProgress } = options;

    const report = (step, current, total, message) => {
        if (typeof onProgress === 'function') {
            try {
                onProgress({ step, current, total, message });
            } catch (_) {}
        }
    };

    report('connect_db', 0, 100, '正在連接 IndexedDB 資料庫...');
    const db = await openSimaiDBReadOnly();

    let allData;
    try {
        report('read_store', 10, 100, '正在讀取所有儲存資料...');
        allData = await readAllFromStore(db);
    } finally {
        db.close();
    }

    report('parse_settings', 20, 100, '正在解析全域設定檔...');
    // 1. 提取設定檔
    const rawSettings = allData.get('simai_settings');
    let parsedSettings = {};
    if (typeof rawSettings === 'string') {
        try {
            parsedSettings = JSON.parse(rawSettings);
        } catch (e) {
            console.warn('[wmcxExtract] 解析 simai_settings 失敗，保留空物件:', e);
        }
    } else if (rawSettings && typeof rawSettings === 'object') {
        parsedSettings = rawSettings;
    }

    // 2. 提取專案清單
    report('parse_projects', 30, 100, '正在整理專案清單與素材...');
    const rawProjectList = allData.get('__project_list__');
    let projectsMetaList = Array.isArray(rawProjectList) ? [...rawProjectList] : [];

    // 相容性檢查：若無專案清單但有舊版 simai_* 資料，虛擬出預設專案
    const hasLegacy = allData.has('simai_maidata') || allData.has('simai_resource_bgm') ||
        allData.has('simai_background_image') || allData.has('simai_background_video');

    if (projectsMetaList.length === 0 && hasLegacy) {
        const legacyMaidata = allData.get('simai_maidata');
        const legacyName = (legacyMaidata && legacyMaidata.title) ? legacyMaidata.title.trim() : '預設專案';
        projectsMetaList.push({
            id: '__legacy__',
            name: legacyName,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }

    const projects = [];
    const projectsMeta = {};
    const seenFolderNames = new Map(); // 用於名稱去重
    const totalProjects = projectsMetaList.length;

    for (let i = 0; i < totalProjects; i++) {
        const projMeta = projectsMetaList[i];
        const isLegacy = projMeta.id === '__legacy__';
        const keyPrefix = isLegacy ? 'simai_' : `proj_${projMeta.id}_`;

        const stepPercent = 30 + Math.round(((i + 1) / totalProjects) * 60);
        report('process_project', stepPercent, 100, `正在處理專案 (${i + 1}/${totalProjects}): ${projMeta.name}`);

        // 計算安全且不重複的資料夾名稱
        const baseSafeName = sanitizeFolderName(projMeta.name);
        const count = seenFolderNames.get(baseSafeName) || 0;
        seenFolderNames.set(baseSafeName, count + 1);
        const dirName = count === 0 ? baseSafeName : `${baseSafeName} (${count})`;

        // 讀取 maidata
        const maidataRaw = allData.get(`${keyPrefix}maidata`);
        const maidataText = serializeMaidata(maidataRaw);

        // 讀取媒體資源
        const rawBg = allData.get(`${keyPrefix}background_image`);
        const rawTrack = allData.get(`${keyPrefix}resource_bgm`);
        const rawPv = allData.get(`${keyPrefix}background_video`);

        // 處理背景圖
        let bg = null;
        if (rawBg instanceof Blob) {
            const ext = await detectFileExtension(rawBg, 'bg');
            bg = { blob: rawBg, ext, filename: `bg.${ext}` };
        }

        // 處理音樂軌
        let track = null;
        if (rawTrack instanceof Blob) {
            const ext = await detectFileExtension(rawTrack, 'track');
            track = { blob: rawTrack, ext, filename: `track.${ext}` };
        } else if (typeof rawTrack === 'string' && rawTrack.startsWith('http')) {
            try {
                const resp = await fetch(rawTrack);
                if (resp.ok) {
                    const blob = await resp.blob();
                    const ext = await detectFileExtension(blob, 'track');
                    track = { blob, ext, filename: `track.${ext}` };
                }
            } catch (err) {
                console.warn(`[wmcxExtract] 遠端讀取音訊失敗 (${projMeta.name}):`, err);
            }
        }

        // 處理背景影片 (PV)
        let pv = null;
        if (rawPv instanceof Blob) {
            const ext = await detectFileExtension(rawPv, 'pv');
            pv = { blob: rawPv, ext, filename: `pv.${ext}` };
        }

        // 紀錄執行期狀態中繼資料
        const nowDiff = allData.get(`${keyPrefix}now_difficulty`);
        const readyBeat = allData.get(`${keyPrefix}ready_beat`);
        const timeControl = allData.get(`${keyPrefix}timeControl`);
        const hideEditor = allData.get(`${keyPrefix}hide_editor`);

        projectsMeta[dirName] = {
            originalId: projMeta.id,
            name: projMeta.name,
            createdAt: projMeta.createdAt || Date.now(),
            updatedAt: projMeta.updatedAt || Date.now(),
            nowDifficulty: typeof nowDiff === 'number' ? nowDiff : 5,
            readyBeat: typeof readyBeat === 'boolean' ? readyBeat : true,
            timeControl: timeControl ?? null,
            hideEditor: hideEditor ?? null
        };

        projects.push({
            id: projMeta.id,
            name: projMeta.name,
            dirName,
            maidataText,
            bg,
            track,
            pv
        });
    }

    // 組織 settings.json 的標準外層封裝容器
    const settingsEnvelope = {
        version: 1,
        generator: 'web-mai-chart-x',
        exportedAt: Date.now(),
        sourceOrigin: typeof location !== 'undefined' ? location.origin : '',
        settings: parsedSettings,
        projectsMeta
    };

    report('completed', 100, 100, '提取完成');

    return {
        settingsEnvelope,
        projects,
        meta: {
            extractedAt: settingsEnvelope.exportedAt,
            projectCount: projects.length,
            origin: settingsEnvelope.sourceOrigin
        }
    };
}
