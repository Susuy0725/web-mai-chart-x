// Scripts/services/driveApi.js
// Google Drive REST API v3 封裝
// 使用原生 fetch 與 XMLHttpRequest，精確提供真實網路傳輸進度。

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const WMCX_QUERY = "name contains '.wmcx.zip' and trashed = false";

function _authHeader(token) {
    return { 'Authorization': `Bearer ${token}` };
}

async function _checkResponse(resp, actionName = 'Drive API 操作') {
    if (resp.ok) return;
    let detail = `HTTP ${resp.status}`;
    try {
        const errorData = await resp.json();
        detail = errorData?.error?.message || detail;
    } catch (_) {}
    throw new Error(`${actionName} 失敗: ${detail}`);
}

/**
 * 查詢雲端中的 .wmcx.zip 專案檔案清單
 * @param {string} token
 * @returns {Promise<Array<{id: string, name: string, size: string, modifiedTime: string}>>}
 */
export async function listWmcxFiles(token) {
    const params = new URLSearchParams({
        q: WMCX_QUERY,
        fields: 'files(id, name, size, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: '100',
    });

    const resp = await fetch(`${API_BASE}/files?${params.toString()}`, {
        headers: _authHeader(token),
    });

    await _checkResponse(resp, '讀取雲端檔案清單');
    const result = await resp.json();
    return result.files || [];
}

/**
 * 取得指定雲端檔案的元資料
 * @param {string} fileId
 * @param {string} token
 * @returns {Promise<{id: string, name: string, size: string, modifiedTime: string}|null>}
 */
export async function getFileMeta(fileId, token) {
    const params = new URLSearchParams({
        fields: 'id, name, size, modifiedTime, trashed',
    });

    const resp = await fetch(`${API_BASE}/files/${fileId}?${params.toString()}`, {
        headers: _authHeader(token),
    });

    if (resp.status === 404 || resp.status === 403) {
        return null;
    }

    await _checkResponse(resp, '檢視檔案狀態');
    const file = await resp.json();
    if (file.trashed) return null;
    return file;
}

/**
 * 從 Google Drive 下載檔案並透過 ReadableStream 回報真實傳輸進度
 * @param {string} fileId
 * @param {string} token
 * @param {Function} [onProgress] - ({ loaded: number, total: number|null }) => void
 * @returns {Promise<Blob>}
 */
export async function downloadFile(fileId, token, onProgress) {
    const resp = await fetch(`${API_BASE}/files/${fileId}?alt=media`, {
        headers: _authHeader(token),
    });

    await _checkResponse(resp, '下載雲端檔案');

    const contentLength = resp.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : null;

    if (!resp.body) {
        const fullBlob = await resp.blob();
        if (typeof onProgress === 'function') {
            onProgress({ loaded: fullBlob.size, total: fullBlob.size });
        }
        return fullBlob;
    }

    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            if (typeof onProgress === 'function') {
                onProgress({ loaded, total });
            }
        }
    }

    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return new Blob([merged], { type: 'application/zip' });
}

/**
 * 上傳檔案至 Google Drive。若傳入 fileId 則直接更新（PATCH 覆寫），否則建立新檔案（POST）。
 * 使用 XMLHttpRequest.upload.onprogress 取得真實的上傳進度。
 *
 * @param {Object} options
 * @param {Blob} options.blob - 打包好的 .wmcx.zip Blob
 * @param {string} options.name - 檔案名稱
 * @param {string} options.token - Access Token
 * @param {string|null} [options.fileId] - 既有雲端檔案 ID
 * @param {Function} [options.onProgress] - ({ loaded: number, total: number|null }) => void
 * @returns {Promise<{id: string, name: string}>}
 */
export function uploadFile({ blob, name, token, fileId = null, onProgress }) {
    return new Promise((resolve, reject) => {
        const isUpdate = Boolean(fileId);
        const method = isUpdate ? 'PATCH' : 'POST';
        const endpoint = isUpdate
            ? `${UPLOAD_BASE}/files/${fileId}?uploadType=multipart`
            : `${UPLOAD_BASE}/files?uploadType=multipart`;

        const boundary = '-------WebMaiChartXUploadBoundary' + Math.random().toString(36).slice(2);
        const metadata = JSON.stringify({
            name: name.endsWith('.wmcx.zip') ? name : `${name}.wmcx.zip`,
            mimeType: 'application/zip',
        });

        const part1 = new Blob([
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadata,
            '\r\n',
            `--${boundary}\r\n`,
            'Content-Type: application/zip\r\n\r\n',
        ], { type: 'text/plain' });

        const part2 = new Blob([`\r\n--${boundary}--`], { type: 'text/plain' });
        const requestBody = new Blob([part1, blob, part2]);

        const xhr = new XMLHttpRequest();
        xhr.open(method, endpoint);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

        if (xhr.upload && typeof onProgress === 'function') {
            xhr.upload.onprogress = (event) => {
                onProgress({
                    loaded: event.loaded,
                    total: event.lengthComputable ? event.total : null,
                });
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result = JSON.parse(xhr.responseText);
                    resolve(result);
                } catch (_) {
                    resolve({ id: fileId || 'unknown', name });
                }
            } else {
                let errorMsg = `HTTP ${xhr.status}`;
                try {
                    const errorObj = JSON.parse(xhr.responseText);
                    errorMsg = errorObj?.error?.message || errorMsg;
                } catch (_) {}
                reject(new Error(`上傳至雲端失敗: ${errorMsg}`));
            }
        };

        xhr.onerror = () => reject(new Error('上傳時發生網路通訊錯誤'));
        xhr.onabort = () => reject(new Error('上傳已被中斷'));

        xhr.send(requestBody);
    });
}
