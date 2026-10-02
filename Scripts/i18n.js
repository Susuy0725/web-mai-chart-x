let manifest = {
    defaultLocale: 'zh-TW',
    locales: [
        { code: 'zh-TW', name: '繁體中文', englishName: 'Traditional Chinese' },
        { code: 'en', name: 'English', englishName: 'English' },
        { code: 'ja', name: '日本語', englishName: 'Japanese' }
    ]
};

const translations = {};
const listeners = [];

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

export function detectDefaultLanguage(availableLocales = manifest.locales, defaultLocale = manifest.defaultLocale || 'zh-TW') {
    const userLangs = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length > 0)
        ? navigator.languages
        : [(typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'zh-TW'];

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

// Initial initialization
await fetchManifest();

const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('simai_lang') : null;
const defaultDetectedLang = detectDefaultLanguage(manifest.locales, manifest.defaultLocale || 'zh-TW');

let initialTargetLang = savedLang;
if (!initialTargetLang || !manifest.locales.some(l => l.code === initialTargetLang)) {
    initialTargetLang = defaultDetectedLang;
}

const defaultLocaleCode = manifest.defaultLocale || 'zh-TW';

// Pre-load default fallback locale and current target locale
await Promise.all([
    loadLocale(defaultLocaleCode),
    loadLocale(initialTargetLang)
]);

let currentLang = initialTargetLang;

export function getCurrentLang() {
    return currentLang;
}

export async function setLang(lang) {
    if (!translations[lang]) {
        const loaded = await loadLocale(lang);
        if (!loaded) return false;
    }
    currentLang = lang;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('simai_lang', lang);
    }
    applyI18nToDOM();
    listeners.forEach(cb => cb(lang));
    return true;
}

export function onLanguageChange(callback) {
    listeners.push(callback);
}

export function t(key, params = {}) {
    const keys = key.split('.');
    const defaultCode = manifest.defaultLocale || 'zh-TW';
    let value = translations[currentLang];
    
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            // fallback to default locale
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
