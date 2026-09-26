/**
 * Google Drive 雲端服務模組 (Google Drive Service)
 * 使用 Google Identity Services (GIS) 與 Google Drive REST API v3
 */

const CLIENT_ID = '1075237013882-bbdr5s31phsu77afii792iqc8t8bfvua.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const APP_FOLDER_NAME = 'WebMaiChartX';

let tokenClient = null;
let currentToken = sessionStorage.getItem('gdrive_token') || null;
let tokenExpiresAt = parseInt(sessionStorage.getItem('gdrive_token_expires') || '0', 10);
let currentUser = null;

try {
    const savedUser = sessionStorage.getItem('gdrive_user');
    if (savedUser) currentUser = JSON.parse(savedUser);
} catch (_) { }

let authListeners = [];

/**
 * 載入 Google Identity Services SDK
 */
function loadGisScript() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            resolve();
            return;
        }
        const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (existingScript) {
            existingScript.addEventListener('load', resolve);
            existingScript.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('無法載入 Google Identity Services SDK'));
        document.head.appendChild(script);
    });
}

/**
 * 檢查目前是否有有效憑證
 */
export function isLoggedIn() {
    return !!currentToken && Date.now() < tokenExpiresAt;
}

/**
 * 取得當前已登入使用者資訊
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * 監聽登入狀態改變
 */
export function onAuthStateChanged(callback) {
    authListeners.push(callback);
    callback({ isLoggedIn: isLoggedIn(), user: currentUser });
    return () => {
        authListeners = authListeners.filter(cb => cb !== callback);
    };
}

function notifyAuthState() {
    const state = { isLoggedIn: isLoggedIn(), user: currentUser };
    authListeners.forEach(cb => {
        try { cb(state); } catch (e) { console.error('[GoogleDrive] Listener error:', e); }
    });
}

/**
 * 取得使用者資料 (Email, Name, Avatar)
 */
async function fetchUserInfo(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`UserInfo HTTP ${res.status}`);
    return await res.json();
}

/**
 * Google 帳號授權登入
 */
export async function login() {
    await loadGisScript();

    return new Promise((resolve, reject) => {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: async (tokenResponse) => {
                    if (tokenResponse.error) {
                        reject(new Error(tokenResponse.error_description || tokenResponse.error));
                        return;
                    }

                    currentToken = tokenResponse.access_token;
                    const expiresIn = parseInt(tokenResponse.expires_in, 10) || 3600;
                    tokenExpiresAt = Date.now() + (expiresIn * 1000);

                    sessionStorage.setItem('gdrive_token', currentToken);
                    sessionStorage.setItem('gdrive_token_expires', tokenExpiresAt.toString());

                    try {
                        currentUser = await fetchUserInfo(currentToken);
                        sessionStorage.setItem('gdrive_user', JSON.stringify(currentUser));
                    } catch (err) {
                        console.warn('[GoogleDrive] 取得帳號資料失敗:', err);
                        currentUser = { email: 'Google 使用者' };
                    }

                    notifyAuthState();
                    resolve({ user: currentUser, token: currentToken });
                }
            });

            tokenClient.requestAccessToken({ prompt: '' });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 登出帳號並清除本機工作階段
 */
export function logout() {
    if (currentToken && window.google?.accounts?.oauth2?.revoke) {
        try {
            google.accounts.oauth2.revoke(currentToken, () => {
                console.log('[GoogleDrive] 權限已撤銷');
            });
        } catch (_) { }
    }

    currentToken = null;
    tokenExpiresAt = 0;
    currentUser = null;

    sessionStorage.removeItem('gdrive_token');
    sessionStorage.removeItem('gdrive_token_expires');
    sessionStorage.removeItem('gdrive_user');

    notifyAuthState();
}

/**
 * 封裝帶有 Authorization 標頭的 API 請求
 */
async function driveFetch(url, options = {}) {
    if (!isLoggedIn()) {
        throw new Error('尚未登入 Google Drive 或憑證已過期');
    }
    const headers = options.headers ? { ...options.headers } : {};
    headers['Authorization'] = `Bearer ${currentToken}`;

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        if (res.status === 401) {
            // 憑證失效，清除以恢復登入按鈕
            logout();
        }
        throw new Error(`Google Drive API 錯誤 (${res.status}): ${errorText}`);
    }
    return res;
}

/**
 * 取得或建立應用程式專屬根資料夾 (WebMaiChartX)
 */
export async function getAppRootFolder() {
    const q = `name = '${APP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }

    // 建立新根資料夾
    const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: APP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root']
        })
    });
    const newFolder = await createRes.json();
    return newFolder.id;
}

/**
 * 列出應用程式根目錄下的所有專案資料夾
 */
export async function listProjects() {
    const rootId = await getAppRootFolder();
    const q = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,createdTime)&orderBy=modifiedTime desc`);
    const data = await res.json();
    return data.files || [];
}

/**
 * 在專案資料夾內搜尋或建立/更新指定檔案 (支援文字、Blob、File)
 */
export async function uploadOrUpdateFile(folderId, fileName, mimeType, fileData) {
    const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
    const listRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    const listData = await listRes.json();
    let fileId = listData.files && listData.files[0]?.id;

    if (!fileId) {
        // 先建立檔案元資料
        const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: fileName,
                parents: [folderId],
                mimeType: mimeType || 'application/octet-stream'
            })
        });
        const created = await createRes.json();
        fileId = created.id;
    }

    // 依原生二進位流上傳檔案內容
    return await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType || 'application/octet-stream' },
        body: fileData
    });
}

/**
 * 載入指定雲端專案資料夾的所有檔案 (支援進度回呼)
 * @param {string} folderId 專案資料夾 ID
 * @param {function} onProgress 進度回呼 ({ current, total, file, percent })
 */
export async function loadProject(folderId, onProgress) {
    if (typeof onProgress === 'function') {
        onProgress({ current: 0, total: 1, file: '正在讀取專案檔案清單...', percent: 5 });
    }

    const q = `'${folderId}' in parents and trashed = false`;
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)`);
    const data = await res.json();
    const files = data.files || [];

    let maidataText = '';
    let projectMeta = null;
    let audioFile = null;
    let bgImageFile = null;
    let bgVideoFile = null;

    const total = files.length || 1;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lower = file.name.toLowerCase();
        const percent = Math.round(((i) / total) * 90) + 5;

        if (typeof onProgress === 'function') {
            onProgress({ current: i + 1, total, file: file.name, percent });
        }

        if (lower === 'maidata.txt') {
            const dl = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
            maidataText = await dl.text();
        } else if (lower === 'project.json') {
            try {
                const dl = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
                projectMeta = await dl.json();
            } catch (_) { }
        } else if (lower.startsWith('track.') || file.mimeType.startsWith('audio/')) {
            const dl = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
            const blob = await dl.blob();
            audioFile = new File([blob], file.name, { type: blob.type || 'audio/mp3' });
        } else if (lower.startsWith('bg.') || (file.mimeType.startsWith('image/') && !lower.includes('jacket'))) {
            const dl = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
            const blob = await dl.blob();
            bgImageFile = new File([blob], file.name, { type: blob.type || 'image/png' });
        } else if (lower.startsWith('pv.') || file.mimeType.startsWith('video/')) {
            const dl = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
            const blob = await dl.blob();
            bgVideoFile = new File([blob], file.name, { type: blob.type || 'video/mp4' });
        }
    }

    if (typeof onProgress === 'function') {
        onProgress({ current: total, total, file: '專案載入完成', percent: 100 });
    }

    return {
        folderId,
        maidataText,
        projectMeta,
        audioFile,
        bgImageFile,
        bgVideoFile
    };
}

/**
 * 雲端專案文字自動存檔 (僅同步 maidata.txt 與 project.json)
 */
export async function autoSaveProject(folderId, { maidataText, metadata = {} }) {
    if (!isLoggedIn() || !folderId) return;

    try {
        if (typeof maidataText === 'string') {
            await uploadOrUpdateFile(folderId, 'maidata.txt', 'text/plain; charset=utf-8', maidataText);
        }

        const metaObj = {
            ...metadata,
            updatedAt: Date.now()
        };
        await uploadOrUpdateFile(folderId, 'project.json', 'application/json; charset=utf-8', JSON.stringify(metaObj, null, 2));

        console.log(`[GoogleDrive] 專案 ${folderId} 文字自動存檔完成`);
    } catch (err) {
        console.error('[GoogleDrive] 自動存檔失敗:', err);
        throw err;
    }
}

/**
 * 清空雲端專案資料夾內的所有現存檔案
 * @param {string} folderId 專案資料夾 ID
 */
export async function clearProjectFolder(folderId) {
    if (!isLoggedIn() || !folderId) return;
    try {
        const q = `'${folderId}' in parents and trashed = false`;
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
        const data = await res.json();
        const files = data.files || [];
        for (const f of files) {
            try {
                await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' });
                console.log(`[GoogleDrive] 已清理舊檔案: ${f.name} (${f.id})`);
            } catch (delErr) {
                console.warn(`[GoogleDrive] 刪除舊檔案 ${f.name} 失敗:`, delErr);
            }
        }
    } catch (err) {
        console.error('[GoogleDrive] 清理資料夾失敗:', err);
        throw err;
    }
}

/**
 * 全量推送雲端專案 (包含 maidata.txt、音訊、圖片、影片、設定，支援進度回呼與清理舊檔)
 * @param {string} folderId 專案資料夾 ID
 * @param {object} param1 專案資料物件
 * @param {function} onProgress 進度回呼 ({ current, total, file, percent })
 * @param {object} options 選項 ({ clearExisting = false })
 */
export async function uploadFullProject(folderId, { maidataText, audioFile, bgImageFile, bgVideoFile, metadata = {} }, onProgress, { clearExisting = false } = {}) {
    if (!isLoggedIn() || !folderId) return;

    try {
        if (clearExisting) {
            if (typeof onProgress === 'function') {
                onProgress({ current: 0, total: 1, file: '正在清理雲端專案舊檔案...', percent: 5 });
            }
            await clearProjectFolder(folderId);
        }

        const uploadQueue = [];

        if (typeof maidataText === 'string') {
            uploadQueue.push({
                name: 'maidata.txt',
                mime: 'text/plain; charset=utf-8',
                data: maidataText
            });
        }

        if (audioFile) {
            uploadQueue.push({
                name: audioFile.name || 'track.mp3',
                mime: audioFile.type || 'audio/mp3',
                data: audioFile
            });
        }

        if (bgImageFile) {
            uploadQueue.push({
                name: bgImageFile.name || 'bg.png',
                mime: bgImageFile.type || 'image/png',
                data: bgImageFile
            });
        }

        if (bgVideoFile) {
            uploadQueue.push({
                name: bgVideoFile.name || 'pv.mp4',
                mime: bgVideoFile.type || 'video/mp4',
                data: bgVideoFile
            });
        }

        const metaObj = {
            ...metadata,
            updatedAt: Date.now()
        };
        uploadQueue.push({
            name: 'project.json',
            mime: 'application/json; charset=utf-8',
            data: JSON.stringify(metaObj, null, 2)
        });

        const total = uploadQueue.length;
        for (let i = 0; i < total; i++) {
            const item = uploadQueue[i];
            const percent = Math.round((i / total) * 95);
            if (typeof onProgress === 'function') {
                onProgress({ current: i + 1, total, file: item.name, percent });
            }
            await uploadOrUpdateFile(folderId, item.name, item.mime, item.data);
        }

        if (typeof onProgress === 'function') {
            onProgress({ current: total, total, file: '全部檔案已同步完成', percent: 100 });
        }

        console.log(`[GoogleDrive] 專案 ${folderId} 全量檔案推送完成`);
    } catch (err) {
        console.error('[GoogleDrive] 全量檔案推送失敗:', err);
        throw err;
    }
}

/**
 * 建立新的雲端專案資料夾
 */
export async function createProjectFolder(projectName) {
    const rootId = await getAppRootFolder();
    const res = await driveFetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: projectName || '未命名專案',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootId]
        })
    });
    return await res.json();
}

/**
 * 重新命名雲端專案資料夾
 */
export async function renameProjectFolder(folderId, newName) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
    });
    return await res.json();
}

/**
 * 刪除雲端專案資料夾 (移至垃圾桶)
 */
export async function deleteProjectFolder(folderId) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
    });
    return await res.json();
}
