/**
 * Google 品牌登入按鈕元件 (Google Sign-In Button)
 * 嚴格遵循 Google Identity Branding Guidelines 與 Material Design 規範
 * 使用原生 HTML + CSS 實作
 */

import { t } from '../i18n.js';

export const GOOGLE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18" style="display:block; flex-shrink:0;">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  <path fill="none" d="M0 0h48v48H0z"/>
</svg>
`.trim();

/**
 * 建立符合 Google 官方品牌指南與 Material Design 規範的 Google 登入按鈕
 * @param {Object} options
 * @param {'dark'|'light'} [options.theme='dark'] - 按鈕色彩模式 (深色/淺色)
 * @param {'small'|'medium'|'large'} [options.size='medium'] - 按鈕尺寸
 * @param {string} [options.text] - 按鈕文字 (預設為多國語系的「使用 Google 帳戶登入」)
 * @param {Function} [options.onClick] - 點擊回呼
 * @returns {HTMLButtonElement}
 */
export function createGoogleSignInButton(options = {}) {
    const {
        theme = 'dark',
        size = 'medium',
        text,
        onClick
    } = options;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gsi-material-button';

    // 依據 Material Design 3 與 Google 品牌準則設定色彩與邊框
    const isDark = theme === 'dark';
    const bg = isDark ? '#131314' : '#ffffff';
    const textColor = isDark ? '#e3e3e3' : '#1f1f1f';
    const borderColor = isDark ? '#8e918f' : '#747775';
    const hoverBg = isDark ? '#202124' : '#f8fafd';
    const activeBg = isDark ? '#303134' : '#eeeeee';

    let padding = '0 12px';
    let height = '36px';
    let fontSize = '13px';
    let iconSize = '18px';

    if (size === 'small') {
        height = '30px';
        padding = '0 10px';
        fontSize = '12px';
        iconSize = '16px';
    } else if (size === 'large') {
        height = '42px';
        padding = '0 16px';
        fontSize = '14px';
        iconSize = '20px';
    }

    btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: ${height};
        padding: ${padding};
        background: ${bg};
        color: ${textColor};
        border: 1px solid ${borderColor};
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: ${fontSize};
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        box-sizing: border-box;
        text-decoration: none;
        outline: none;
    `;

    // 官方四色 G 標誌容器
    const iconSpan = document.createElement('span');
    iconSpan.className = 'gsi-icon';
    iconSpan.style.cssText = `display: flex; align-items: center; justify-content: center; width: ${iconSize}; height: ${iconSize}; flex-shrink: 0;`;
    iconSpan.innerHTML = GOOGLE_ICON_SVG;

    // 文字容器
    const textSpan = document.createElement('span');
    textSpan.className = 'gsi-text';
    textSpan.style.cssText = 'white-space: nowrap; line-height: 1;';
    textSpan.textContent = text || (t('settings.gdrive.loginBtn') || '使用 Google 帳戶登入');

    btn.appendChild(iconSpan);
    btn.appendChild(textSpan);

    // 互動狀態反饋 (Material Design Hover / Active / Focus)
    btn.onmouseenter = () => {
        if (!btn.disabled) {
            btn.style.backgroundColor = hoverBg;
            btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
        }
    };
    btn.onmouseleave = () => {
        if (!btn.disabled) {
            btn.style.backgroundColor = bg;
            btn.style.boxShadow = 'none';
        }
    };
    btn.onmousedown = () => {
        if (!btn.disabled) {
            btn.style.backgroundColor = activeBg;
        }
    };
    btn.onmouseup = () => {
        if (!btn.disabled) {
            btn.style.backgroundColor = hoverBg;
        }
    };

    if (onClick) {
        btn.addEventListener('click', onClick);
    }

    // 擴充控制輔助函式
    btn.setLoading = (isLoading, loadingText) => {
        btn.disabled = isLoading;
        if (isLoading) {
            btn.style.opacity = '0.7';
            btn.style.cursor = 'wait';
            textSpan.textContent = loadingText || (t('settings.gdrive.loggingIn') || '正在登入...');
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            textSpan.textContent = text || (t('settings.gdrive.loginBtn') || '使用 Google 帳戶登入');
        }
    };

    btn.setText = (newText) => {
        textSpan.textContent = newText;
    };

    return btn;
}
