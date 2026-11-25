export const DEFAULT_THEME_MODE = 'dark';
export const DEFAULT_ACCENT_COLOR = '#4499ee';
export const VALID_THEME_MODES = ['dark', 'light', 'auto'];

const BACKUP_SETTINGS_KEY = 'simai_settings_backup';

let _currentThemeMode = DEFAULT_THEME_MODE;
let _currentAccentColor = DEFAULT_ACCENT_COLOR;
let _mediaQuery = null;
let _mediaListenerAttached = false;
const _themeChangeListeners = new Set();

/**
 * 標準化主題模式名稱 ('dark' | 'light' | 'auto')
 * @param {string} mode
 * @returns {'dark' | 'light' | 'auto'}
 */
export function normalizeThemeMode(mode) {
    if (typeof mode === 'string') {
        const cleaned = mode.trim().toLowerCase();
        if (VALID_THEME_MODES.includes(cleaned)) {
            return cleaned;
        }
    }
    return DEFAULT_THEME_MODE;
}

/**
 * 標準化 6 位數 Hex 顏色字串 (例如 #49e -> #4499ee)
 * @param {string} raw
 * @param {string} [fallback=DEFAULT_ACCENT_COLOR]
 * @returns {string}
 */
export function normalizeHexColor(raw, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof raw !== 'string') return fallback;
    const cleaned = raw.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
        return `#${cleaned.split('').map((ch) => ch + ch).join('').toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        return `#${cleaned.toLowerCase()}`;
    }
    return fallback;
}

/**
 * 計算背景 Hex 色彩之對比前景色（深字或白字），確保主色按鈕文字清晰可讀
 * @param {string} hexColor
 * @returns {'#111827' | '#ffffff'}
 */
export function computeContrastTextColor(hexColor) {
    const normalized = normalizeHexColor(hexColor, DEFAULT_ACCENT_COLOR).slice(1);
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return luminance > 0.45 ? '#111827' : '#ffffff';
}

/**
 * 解析實際生效的主題 ('dark' | 'light')
 * @param {string} [mode=_currentThemeMode]
 * @returns {'dark' | 'light'}
 */
export function resolveEffectiveTheme(mode = _currentThemeMode) {
    const normalized = normalizeThemeMode(mode);
    if (normalized === 'light') return 'light';
    if (normalized === 'dark') return 'dark';
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        try {
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        } catch {
            return 'dark';
        }
    }
    return 'dark';
}

function notifyThemeChanged(effectiveTheme) {
    _themeChangeListeners.forEach((cb) => {
        try {
            cb({
                themeMode: _currentThemeMode,
                effectiveTheme,
                accentColor: _currentAccentColor,
            });
        } catch (err) {
            console.warn('[themeManager] Theme change listener failed:', err);
        }
    });
}

function ensureSystemThemeListener() {
    if (_mediaListenerAttached || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return;
    }
    try {
        _mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        const onSystemChange = () => {
            if (_currentThemeMode === 'auto') {
                applyThemeSettings({
                    themeMode: _currentThemeMode,
                    accentColor: _currentAccentColor,
                });
            }
        };
        if (typeof _mediaQuery.addEventListener === 'function') {
            _mediaQuery.addEventListener('change', onSystemChange);
        } else if (typeof _mediaQuery.addListener === 'function') {
            _mediaQuery.addListener(onSystemChange);
        }
        _mediaListenerAttached = true;
    } catch { }
}

/**
 * 註冊主題 / 主色變更監聽器
 * @param {Function} callback
 * @returns {Function} 取消監聽函式
 */
export function onThemeChange(callback) {
    if (typeof callback !== 'function') return () => { };
    _themeChangeListeners.add(callback);
    return () => _themeChangeListeners.delete(callback);
}

/**
 * 套用主題模式與主色設定到 DOM 根樣式
 * @param {Object} [opts={}]
 * @param {string} [opts.themeMode]
 * @param {string} [opts.accentColor]
 * @returns {{ themeMode: 'dark' | 'light' | 'auto', effectiveTheme: 'dark' | 'light', accentColor: string }}
 */
export function applyThemeSettings({ themeMode, accentColor } = {}) {
    if (themeMode !== undefined) {
        _currentThemeMode = normalizeThemeMode(themeMode);
    }
    if (accentColor !== undefined) {
        _currentAccentColor = normalizeHexColor(accentColor, DEFAULT_ACCENT_COLOR);
    }

    ensureSystemThemeListener();

    const effectiveTheme = resolveEffectiveTheme(_currentThemeMode);
    const contrastText = computeContrastTextColor(_currentAccentColor);

    if (typeof document !== 'undefined' && document.documentElement) {
        const root = document.documentElement;
        root.dataset.theme = effectiveTheme;
        root.dataset.themeMode = _currentThemeMode;
        root.style.colorScheme = effectiveTheme;
        root.style.setProperty('--accent-color', _currentAccentColor);
        root.style.setProperty('--accent-contrast-text', contrastText);
    }

    notifyThemeChanged(effectiveTheme);

    return {
        themeMode: _currentThemeMode,
        effectiveTheme,
        accentColor: _currentAccentColor,
    };
}

/**
 * 於頁面初始化早期從 localStorage 備份同步套用主題，降低深淺色切換閃爍
 * @returns {{ themeMode: 'dark' | 'light' | 'auto', effectiveTheme: 'dark' | 'light', accentColor: string } | null}
 */
export function applyThemeFromBackup() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(BACKUP_SETTINGS_KEY);
        if (!raw) return applyThemeSettings({ themeMode: DEFAULT_THEME_MODE, accentColor: DEFAULT_ACCENT_COLOR });
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return applyThemeSettings({
                themeMode: parsed.themeMode ?? DEFAULT_THEME_MODE,
                accentColor: parsed.accentColor ?? DEFAULT_ACCENT_COLOR,
            });
        }
    } catch { }
    return applyThemeSettings({ themeMode: DEFAULT_THEME_MODE, accentColor: DEFAULT_ACCENT_COLOR });
}
