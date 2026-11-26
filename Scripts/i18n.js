<<<<<<< HEAD
import zhTW from '../locales/zh-TW.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';

const translations = {
    'zh-TW': zhTW,
    'en': en,
    'ja': ja,
};

function detectInitialLanguage() {
    try {
        const saved = localStorage.getItem('simai_lang');
        if (saved && translations[saved]) {
            return saved;
        }
    } catch (_) { }

    const candidateLangs = [];
    if (typeof navigator !== 'undefined') {
        if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
            candidateLangs.push(...navigator.languages);
        }
        if (navigator.language) {
            candidateLangs.push(navigator.language);
        }
        if (navigator.userLanguage) {
            candidateLangs.push(navigator.userLanguage);
        }
    }

    for (const lang of candidateLangs) {
        if (!lang || typeof lang !== 'string') continue;
        const lower = lang.toLowerCase().trim();
        if (lower.startsWith('ja')) {
            return 'ja';
        }
        if (lower.startsWith('zh')) {
            return 'zh-TW';
        }
        if (lower.startsWith('en')) {
            return 'en';
        }
    }

    return 'zh-TW';
}

let currentLang = detectInitialLanguage();

=======
let manifest = {
    defaultLocale: 'en',
    locales: [
        { code: 'zh-TW', name: '繁體中文', englishName: 'Traditional Chinese' },
        { code: 'zh-CN', name: '简体中文', englishName: 'Simplified Chinese' },
        { code: 'en', name: 'English', englishName: 'English' },
        { code: 'ja', name: '日本語', englishName: 'Japanese' },
        { code: 'ko', name: '한국어', englishName: 'Korean' }
    ]
};

const translations = {};
const extensionTranslations = {};
const loadedLocales = new Set();
>>>>>>> baeb70bd35e488c679d3c1668fe1646a88f6e96c
const listeners = [];

/**
 * 將已註冊的擴充詞庫合併至指定語系物件中
 * @param {string} lang
 */
function mergeExtensionTranslations(lang) {
    const extMap = extensionTranslations[lang];
    if (!extMap || !translations[lang]) return;

    for (const [namespace, dict] of Object.entries(extMap)) {
        const parts = namespace.split('.');
        let target = translations[lang];
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!target[part] || typeof target[part] !== 'object') {
                target[part] = {};
            }
            target = target[part];
        }
        const leafKey = parts[parts.length - 1];
        target[leafKey] = {
            ...(target[leafKey] && typeof target[leafKey] === 'object' ? target[leafKey] : {}),
            ...dict
        };
    }
}

/**
 * 動態註冊擴充程式專屬翻譯詞庫
 * @param {string} namespace 命名空間，例如 "ext.myPlugin"
 * @param {Record<string, Object>} localeMap 以語系代碼為鍵的翻譯字典
 * @returns {Function} 取消註冊函式
 */
export function registerTranslations(namespace, localeMap) {
    if (!namespace || typeof namespace !== 'string') {
        throw new TypeError('[i18n] 翻譯命名空間必須為非空字串');
    }
    if (!localeMap || typeof localeMap !== 'object') {
        return () => {};
    }

    const registeredLangs = [];
    for (const [lang, dict] of Object.entries(localeMap)) {
        if (!dict || typeof dict !== 'object') continue;
        if (!extensionTranslations[lang]) {
            extensionTranslations[lang] = {};
        }
        extensionTranslations[lang][namespace] = dict;
        registeredLangs.push(lang);
        if (!translations[lang]) {
            translations[lang] = {};
        }
        mergeExtensionTranslations(lang);
    }

    if (typeof document !== 'undefined') {
        applyI18nToDOM();
    }

    return () => {
        for (const lang of registeredLangs) {
            if (extensionTranslations[lang]) {
                delete extensionTranslations[lang][namespace];
            }
            if (translations[lang]) {
                const parts = namespace.split('.');
                let target = translations[lang];
                for (let i = 0; i < parts.length - 1; i++) {
                    target = target?.[parts[i]];
                }
                if (target && typeof target === 'object') {
                    delete target[parts[parts.length - 1]];
                }
            }
        }
    };
}

// 'auto' 表示由 BCP 47 自動偵測系統語言
const AUTO_LANG = 'auto';

async function fetchManifest() {
    try {
        const url = new URL('../config/manifest.json', import.meta.url).href;
        const res = await fetch(url);
        if (res.ok) {
            manifest = await res.json();
        }
    } catch (e) {
        console.warn('Failed to load config/manifest.json, fallback to static manifest', e);
    }
    return manifest;
}

export function getAvailableLanguages() {
    return manifest.locales || [];
}

/**
 * BCP 47 自動語系偵測
 * 優先嘗試精確比對，再進行中文變體映射，最後以前綴比對與 defaultLocale 回傳
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

        // 2. 中文特定變體與腳本標籤映射 (Simplified / Traditional)
        const lowerNorm = normalized.toLowerCase();
        if (lowerNorm.startsWith('zh')) {
            // 簡體中文模式 (zh-Hans, zh-CN, zh-SG, zh-MY)
            const isSimplified = lowerNorm.includes('hans') || lowerNorm.includes('cn') || lowerNorm.includes('sg') || lowerNorm.includes('my');
            if (isSimplified && availableCodes.includes('zh-CN')) {
                return 'zh-CN';
            }
            // 繁體中文模式 (zh-Hant, zh-TW, zh-HK, zh-MO)
            const isTraditional = lowerNorm.includes('hant') || lowerNorm.includes('tw') || lowerNorm.includes('hk') || lowerNorm.includes('mo');
            if (isTraditional && availableCodes.includes('zh-TW')) {
                return 'zh-TW';
            }
        }

        // 3. Prefix / Base language match (e.g. "en-US" -> "en", "ko-KR" -> "ko")
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
    if (loadedLocales.has(lang) && translations[lang]) {
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
        loadedLocales.add(lang);
        mergeExtensionTranslations(lang);
        return translations[lang];
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
    const detectedLang = detectDefaultLanguage(manifest.locales, defaultLocaleCode);

    // 預載：fallback 語系 + 目前實際語系 + 系統偵測語系（避免重複請求）
    const toLoad = [defaultLocaleCode];
    if (effectiveLang !== defaultLocaleCode) toLoad.push(effectiveLang);
    if (!toLoad.includes(detectedLang)) toLoad.push(detectedLang);
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

export function t(key, params = {}, targetLang = null) {
    const keys = key.split('.');
    const defaultCode = manifest.defaultLocale || 'en';
    const effectiveLang = targetLang ? resolveEffectiveLang(targetLang) : resolveEffectiveLang(currentLangSetting);
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
    const elements = document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]');
    elements.forEach(el => {
        // 處理特定屬性多語系
        if (el.hasAttribute('data-i18n-title')) {
            el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
        }
        if (el.hasAttribute('data-i18n-aria-label')) {
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
        }
        if (el.hasAttribute('data-i18n-placeholder')) {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        }

        // 處理主要文字 / 傳統 data-i18n
        if (el.hasAttribute('data-i18n')) {
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
        }
    });
}
