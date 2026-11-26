// Scripts/services/driveAuth.js
// Google Drive OAuth 2.0 授權管理模組

import { t } from '../i18n.js';

const CLIENT_ID = '1075237013882-bbdr5s31phsu77afii792iqc8t8bfvua.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install';

const SESSION_TOKEN_KEY = 'wmcx_drive_token';
const SESSION_EXPIRY_KEY = 'wmcx_drive_expiry';
const SESSION_USER_KEY = 'wmcx_drive_user';

let _accessToken = null;
let _tokenExpiry = 0;
let _userInfo = null;
let _authListeners = [];
let _tokenClient = null;

/**
 * 從 sessionStorage 同步還原 Token（頁面載入或重新整理時執行，0 延遲純同步）
 */
function _restoreSession() {
    try {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        const expiryStr = sessionStorage.getItem(SESSION_EXPIRY_KEY);
        const userStr = sessionStorage.getItem(SESSION_USER_KEY);

        if (token && expiryStr) {
            const expiry = parseInt(expiryStr, 10);
            if (Date.now() < expiry - 60_000) {
                _accessToken = token;
                _tokenExpiry = expiry;
                _userInfo = userStr ? JSON.parse(userStr) : null;
                return true;
            }
        }
    } catch (_) {}

    _clearSession();
    return false;
}

/**
 * 儲存 Token 與使用者資訊至 sessionStorage
 */
function _saveSession(token, expiry, user) {
    try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
        sessionStorage.setItem(SESSION_EXPIRY_KEY, String(expiry));
        if (user) {
            sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
        }
    } catch (_) {}
}

/**
 * 清除 sessionStorage 暫存
 */
function _clearSession() {
    _accessToken = null;
    _tokenExpiry = 0;
    _userInfo = null;
    try {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_EXPIRY_KEY);
        sessionStorage.removeItem(SESSION_USER_KEY);
    } catch (_) {}
}

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
            existingScript.addEventListener('error', () => reject(new Error(t('popup.drive.authScriptLoadFailed'))));
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
                reject(new Error(t('popup.drive.authInitFailed')));
            }
        };
        script.onerror = () => reject(new Error(t('popup.drive.authConnectFailed')));
        document.head.appendChild(script);
    });
}

/**
 * 廣播授權狀態變更給所有監聽者
 */
function _notifyListeners() {
    const payload = {
        isSignedIn: isSignedIn(),
        user: _userInfo,
    };
    _authListeners.forEach(fn => {
        try {
            fn(payload);
        } catch (e) {
            console.error('[DriveAuth] 狀態監聽器執行錯誤:', e);
        }
    });
}

/**
 * 使用 Drive about API 驗證 Token 是否真正有效，並取得使用者基本資訊
 */
async function _verifyDriveTokenAndFetchUser(token) {
    const resp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!resp.ok) {
        throw new Error(`Drive 權限驗證失敗: HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return {
        email: data.user?.emailAddress || '',
        name: data.user?.displayName || data.user?.emailAddress || 'Google 使用者',
        picture: data.user?.photoLink || null,
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
 * 清除當前記憶體與 sessionStorage 中的 Token（供 401 攔截器使用）
 */
export function clearCurrentToken() {
    _clearSession();
    _notifyListeners();
}

/**
 * 取得目前登入的使用者資訊
 */
export function getUserInfo() {
    return _userInfo;
}

/**
 * 使用者主動點擊「使用 Google 登入」（使用者手勢觸發，各平台表現一致）
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
                        const isCancelled = tokenResponse.error === 'popup_closed' || tokenResponse.error === 'user_cancelled';
                        const err = new Error(isCancelled ? t('popup.drive.userCancelledAuth') : t('popup.drive.toastSignInFailed', { msg: tokenResponse.error_description || tokenResponse.error }));
                        if (!isCancelled) {
                            console.warn('[DriveAuth] 授權回傳錯誤:', tokenResponse.error);
                        }
                        reject(err);
                        return;
                    }

                    if (!tokenResponse.access_token) {
                        reject(new Error(t('popup.drive.invalidAccessToken')));
                        return;
                    }

                    console.debug('[DriveAuth] Token received', {
                        hasToken: Boolean(tokenResponse.access_token),
                        expiresIn: tokenResponse.expires_in,
                        tokenType: tokenResponse.token_type,
                        scope: tokenResponse.scope,
                    });

                    try {
                        const verifiedUser = await _verifyDriveTokenAndFetchUser(tokenResponse.access_token);
                        const expiresIn = parseInt(tokenResponse.expires_in, 10) || 3599;
                        const expiry = Date.now() + expiresIn * 1000;

                        _accessToken = tokenResponse.access_token;
                        _tokenExpiry = expiry;
                        _userInfo = verifiedUser;

                        _saveSession(_accessToken, _tokenExpiry, _userInfo);
                        _notifyListeners();
                        resolve({ token: _accessToken, user: _userInfo });
                    } catch (verifyErr) {
                        console.error('[DriveAuth] Drive 驗證失敗:', verifyErr.message);
                        _clearSession();
                        _notifyListeners();
                        reject(verifyErr);
                    }
                },
                error_callback: (err) => {
                    console.warn('[DriveAuth] GIS 彈窗錯誤:', err);
                    reject(new Error(err?.message || '授權彈窗無法開啟'));
                }
            });

            _tokenClient.requestAccessToken();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * 登出 Google 帳號
 */
export function signOut() {
    if (_accessToken && window.google?.accounts?.oauth2?.revoke) {
        try {
            window.google.accounts.oauth2.revoke(_accessToken, () => {
                console.debug('[DriveAuth] 已註銷 Access Token');
            });
        } catch (_) {}
    }

    _clearSession();
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

// 模組載入時立即從 sessionStorage 同步還原（0 毫秒，保證同分頁重新整理登入不中斷）
_restoreSession();
