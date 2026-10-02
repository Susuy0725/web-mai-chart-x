let manifest = {
    defaultLocale: 'en',
    locales: [
        { code: 'zh-TW', name: '繁體中文', englishName: 'Traditional Chinese' },
        { code: 'en', name: 'English', englishName: 'English' },
        { code: 'ja', name: '日本語', englishName: 'Japanese' }
    ]
};

const translations = {};
const listeners = [];

// 'auto' 表示由 BCP 47 自動偵測系統語言
const AUTO_LANG = 'auto';

async function fetchManifest() {
    try {
        const url = new URL('../locales/manifest.json', import.meta.url).href;
        const res = await fetch(url);
        if (res.ok) {
            manifest = await res.json();
        }
    } catch (e) {
        console.warn('Failed to load locales/manifest.json, fallback to static manifest', e);
    }
    return manifest;
}

export function getAvailableLanguages() {
    return manifest.locales || [];
}

/**
 * BCP 47 自動語系偵測
 * 優先嘗試精確比對，再以前綴比對，最後回傳 defaultLocale
 */
export function detectDefaultLanguage(availableLocales = manifest.locales, defaultLocale = manifest.defaultLocale || 'en') {
    const userLangs = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length > 0)
        ? navigator.languages
        : [(typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en'];

    const availableCodes = (availableLocales || []).map(l => l.code);

    for (const uLang of userLangs) {
        if (!uLang) continue;
        const normalized = uLang.trim();

        // 1. Exact BCP 47 match (case-insensitive)
        const exactMatch = availableCodes.find(code => code.toLowerCase() === normalized.toLowerCase());
        if (exactMatch) return exactMatch;

        // 2. Prefix / Base language match (e.g. "zh-HK" -> "zh-TW", "en-US" -> "en")
        const primarySubtag = normalized.split('-')[0].toLowerCase();
        const prefixMatch = availableCodes.find(code => {
            const codePrimary = code.split('-')[0].toLowerCase();
            return codePrimary === primarySubtag;
        });
        if (prefixMatch) return prefixMatch;
    }

    return defaultLocale;
}

/**
 * 解析 'auto' 為實際語系代碼
 * 若傳入的是實際語系代碼則原樣回傳
 */
function resolveEffectiveLang(lang) {
    if (lang === AUTO_LANG) {
        return detectDefaultLanguage(manifest.locales, manifest.defaultLocale || 'en');
    }
    return lang;
}

export async function loadLocale(lang) {
    if (translations[lang]) {
        return translations[lang];
    }
    try {
        const url = new URL(`../locales/${lang}.json`, import.meta.url).href;
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Failed to load ${lang}.json: HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        translations[lang] = data;
        return data;
    } catch (e) {
        console.error(`Failed to fetch ${lang}.json:`, e);
        return null;
    }
}

// 同步判斷儲存的語言設定（可能是 'auto' 或實際語系代碼）
const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('simai_lang') : null;

// 儲存的設定值（'auto' 或語系代碼），供 getCurrentLang() 回傳
let currentLangSetting = savedLang || AUTO_LANG;

// 確保儲存的語系代碼仍在 manifest 中（若不在則退回 auto）
if (currentLangSetting !== AUTO_LANG && !manifest.locales.some(l => l.code === currentLangSetting)) {
    currentLangSetting = AUTO_LANG;
}

// Non-blocking initialization Promise
export const i18nReady = (async () => {
    await fetchManifest();

    // 更新後再次驗證儲存的語系是否仍在 manifest 中
    if (currentLangSetting !== AUTO_LANG && !manifest.locales.some(l => l.code === currentLangSetting)) {
        currentLangSetting = AUTO_LANG;
    }

    const defaultLocaleCode = manifest.defaultLocale || 'en';
    const effectiveLang = resolveEffectiveLang(currentLangSetting);

    // 預載：fallback 語系 + 目前實際語系（避免重複請求）
    const toLoad = [defaultLocaleCode];
    if (effectiveLang !== defaultLocaleCode) toLoad.push(effectiveLang);
    await Promise.all(toLoad.map(loadLocale));

    applyI18nToDOM();
    listeners.forEach(cb => cb(effectiveLang));
})();

/**
 * 取得目前套用的實際語系代碼（'auto' 模式下回傳偵測到的語系）
 */
export function getCurrentLang() {
    return resolveEffectiveLang(currentLangSetting);
}

/**
 * 取得目前儲存的語言設定（可能是 'auto' 或語系代碼）
 * 供設定選單顯示目前選項使用
 */
export function getLangSetting() {
    return currentLangSetting;
}

/**
 * 切換語言
 * @param {string} lang - 語系代碼，或 'auto' 表示自動偵測
 */
export async function setLang(lang) {
    const effectiveLang = resolveEffectiveLang(lang);

    if (!translations[effectiveLang]) {
        const loaded = await loadLocale(effectiveLang);
        if (!loaded) return false;
    }

    currentLangSetting = lang;

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('simai_lang', lang);
    }

    applyI18nToDOM();
    listeners.forEach(cb => cb(effectiveLang));
    return true;
}

export function onLanguageChange(callback) {
    listeners.push(callback);
}

export function t(key, params = {}) {
    const keys = key.split('.');
    const defaultCode = manifest.defaultLocale || 'en';
    const effectiveLang = resolveEffectiveLang(currentLangSetting);
    let value = translations[effectiveLang];

    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            // fallback to default locale (en)
            let fallbackValue = translations[defaultCode];
            for (const fk of keys) {
                if (fallbackValue && fallbackValue[fk] !== undefined) {
                    fallbackValue = fallbackValue[fk];
                } else {
                    fallbackValue = null;
                    break;
                }
            }
            if (fallbackValue !== null) {
                value = fallbackValue;
            } else {
                return key;
            }
        }
    }

    if (typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (match, p1) => {
            return params[p1] !== undefined ? params[p1] : match;
        });
    }
    return value;
}

export function applyI18nToDOM() {
    if (typeof document === 'undefined') return;
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.hasAttribute('placeholder')) {
                el.placeholder = translation;
            } else if (el.type === 'button' || el.type === 'submit') {
                el.value = translation;
            }
        } else if (el.tagName === 'OPTION') {
            el.textContent = translation;
        } else {
            const attr = el.getAttribute('data-i18n-attr');
            if (attr) {
                el.setAttribute(attr, translation);
            } else {
                let textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.nodeValue = translation;
                } else if (el.children.length === 0) {
                    el.textContent = translation;
                } else {
                    el.appendChild(document.createTextNode(translation));
                }
            }
        }
    });
}
