import { zhTW } from '../locales/zh-TW.js';
import { en } from '../locales/en.js';
import { ja } from '../locales/ja.js';

const translations = {
    'zh-TW': zhTW,
    'en': en,
    'ja': ja,
};

let currentLang = localStorage.getItem('simai_lang') || (navigator.language.startsWith('zh') ? 'zh-TW' : 'en');
if (!translations[currentLang]) {
    currentLang = 'zh-TW';
}

const listeners = [];

export function getCurrentLang() {
    return currentLang;
}

export function setLang(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('simai_lang', lang);
        applyI18nToDOM();
        listeners.forEach(cb => cb(lang));
    }
}

export function onLanguageChange(callback) {
    listeners.push(callback);
}

export function t(key, params = {}) {
    const keys = key.split('.');
    let value = translations[currentLang];
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            // fallback to zh-TW
            let fallbackValue = translations['zh-TW'];
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
                // To avoid destroying material icons, find the text node and replace only that
                // Or if it's a simple text element, set textContent
                let textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.nodeValue = translation;
                } else if (el.children.length === 0) {
                    el.textContent = translation;
                } else {
                    // if it has children and no text node, add a text node
                    el.appendChild(document.createTextNode(translation));
                }
            }
        }
    });
}
