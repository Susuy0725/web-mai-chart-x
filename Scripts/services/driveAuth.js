// Scripts/services/driveAuth.js
// 使用 Google Identity Services (GIS) Token Client
// Access token 僅存於記憶體，絕不寫入 localStorage / IndexedDB / URL。

const CLIENT_ID = '1075237013882-bbdr5s31phsu77afii792iqc8t8bfvua.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let _accessToken = null;
let _tokenExpiry = 0;
let _userInfo = null;
let _authListeners = [];
let _tokenClient = null;

/**
 * 動態確保 Google Identity Services (GIS) SDK 載入
 */
function ensureGisScript() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            resolve(window.google.accounts.oauth2);
            return;
        }

        const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.google.accounts.oauth2));
            existingScript.addEventListener('error', () => reject(new Error('Google 授權函式庫載入失敗')));
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (window.google?.accounts?.oauth2) {
                resolve(window.google.accounts.oauth2);
            } else {
                reject(new Error('Google 授權物件初始化失敗'));
            }
        };
        script.onerror = () => reject(new Error('無法連線至 Google 授權伺服器'));
        document.head.appendChild(script);
    });
}

function _notifyListeners() {
    const state = { isSignedIn: isSignedIn(), user: _userInfo };
    _authListeners.forEach(fn => {
        try {
            fn(state);
        } catch (e) {
            console.error('[DriveAuth] 狀態監聽器執行錯誤:', e);
        }
    });
}

/**
 * 取得使用者基本資訊
 */
async function _fetchUserInfo(token) {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
        throw new Error('無法取得 Google 帳號資訊');
    }
    const data = await resp.json();
    return {
        email: data.email || '',
        name: data.name || data.email || 'Google 使用者',
        picture: data.picture || null,
    };
}

/**
 * 檢查目前是否已登入且 Token 仍有效
 */
export function isSignedIn() {
    return !!_accessToken && Date.now() < _tokenExpiry - 60_000;
}

/**
 * 取得記憶體中的 Access Token
 */
export function getAccessToken() {
    if (!isSignedIn()) return null;
    return _accessToken;
}

/**
 * 取得目前登入之使用者資訊
 */
export function getUserInfo() {
    return _userInfo;
}

/**
 * 透過 Google Identity Services 觸發授權彈窗
 */
export async function signIn() {
    const oauth2 = await ensureGisScript();

    return new Promise((resolve, reject) => {
        try {
            _tokenClient = oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                prompt: 'select_account',
                callback: async (tokenResponse) => {
                    if (tokenResponse.error) {
                        reject(new Error(`Google 授權失敗: ${tokenResponse.error_description || tokenResponse.error}`));
                        return;
                    }

                    if (!tokenResponse.access_token) {
                        reject(new Error('未收到有效的 Access Token'));
                        return;
                    }

                    _accessToken = tokenResponse.access_token;
                    const expiresIn = parseInt(tokenResponse.expires_in, 10) || 3599;
                    _tokenExpiry = Date.now() + expiresIn * 1000;

                    try {
                        _userInfo = await _fetchUserInfo(_accessToken);
                    } catch (_) {
                        _userInfo = { email: '', name: 'Google 使用者', picture: null };
                    }

                    _notifyListeners();
                    resolve({ token: _accessToken, user: _userInfo });
                },
                error_callback: (err) => {
                    reject(new Error(`授權彈窗錯誤: ${err.message || '彈窗關閉或被阻擋'}`));
                }
            });

            _tokenClient.requestAccessToken();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 登出 Google 帳號（清除記憶體 Token 與使用者狀態）
 */
export function signOut() {
    if (_accessToken && window.google?.accounts?.oauth2?.revoke) {
        try {
            window.google.accounts.oauth2.revoke(_accessToken, () => {
                console.log('[DriveAuth] 已註銷 Access Token');
            });
        } catch (_) {}
    }

    _accessToken = null;
    _tokenExpiry = 0;
    _userInfo = null;
    _notifyListeners();
}

/**
 * 訂閱授權狀態變更
 */
export function onAuthChanged(fn) {
    _authListeners.push(fn);
    return () => {
        _authListeners = _authListeners.filter(f => f !== fn);
    };
}

/**
 * 確保已取得有效 Token
 */
export async function ensureSignedIn() {
    if (isSignedIn()) return _accessToken;
    const { token } = await signIn();
    return token;
}
