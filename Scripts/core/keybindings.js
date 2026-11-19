/**
 * @file keybindings.js
 * @description 統一管理編輯器快速鍵定義、組合鍵正規化、衝突偵測、跨平台顯示格式化與按鍵事件比對。
 */

export function isMacPlatform() {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');
}

const MODIFIER_KEYS = new Set([
    'Control', 'Shift', 'Alt', 'Meta', 'OS',
    'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock',
    'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock',
    'Dead', 'Process', 'Unidentified'
]);

const CODE_TO_KEY = {
    Space: 'Space',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Escape: 'Escape',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Tab: 'Tab',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    NumpadAdd: 'NumpadAdd',
    NumpadSubtract: 'NumpadSubtract',
    NumpadMultiply: 'NumpadMultiply',
    NumpadDivide: 'NumpadDivide',
    NumpadDecimal: 'NumpadDecimal',
};

const SPECIAL_KEY_ALIASES = {
    ' ': 'Space',
    space: 'Space',
    spacebar: 'Space',
    esc: 'Escape',
    escape: 'Escape',
    del: 'Delete',
    delete: 'Delete',
    backspace: 'Backspace',
    enter: 'Enter',
    return: 'Enter',
    tab: 'Tab',
    insert: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    arrowup: 'ArrowUp',
    up: 'ArrowUp',
    arrowdown: 'ArrowDown',
    down: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    left: 'ArrowLeft',
    arrowright: 'ArrowRight',
    right: 'ArrowRight',
};

/**
 * 將單一按鍵的 key/code 轉為標準鍵名；若為純修飾鍵或無效鍵則回傳 null。
 * @param {string} key
 * @param {string} [code='']
 * @returns {string|null}
 */
export function normalizeKeyToken(key, code = '') {
    if (!key && !code) return null;
    if (key && MODIFIER_KEYS.has(key)) return null;

    if (code) {
        if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
        if (/^Key[A-Z]$/.test(code)) return code.slice(3);
        if (/^Digit[0-9]$/.test(code)) return code.slice(5);
        if (/^Numpad[0-9]$/.test(code)) return code;
        if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    }

    if (!key) return null;
    const lower = key.toLowerCase();
    if (SPECIAL_KEY_ALIASES[lower]) return SPECIAL_KEY_ALIASES[lower];
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return key.toUpperCase();
    if (key.length === 1) return key.toUpperCase();
    return key;
}

/**
 * 將快速鍵字串正規化為標準格式 `[Mod+][Alt+][Shift+]<Key>`。
 * 空字串或無效字串回傳 `''`。
 * @param {string} shortcutStr
 * @returns {string}
 */
export function normalizeShortcut(shortcutStr) {
    if (!shortcutStr || typeof shortcutStr !== 'string') return '';
    if (shortcutStr === ' ') return 'Space';
    const trimmed = shortcutStr.trim();
    if (!trimmed) return '';

    const rawTokens = shortcutStr.split('+');
    const rawParts = rawTokens
        .map((p, idx) => {
            const t = p.trim();
            if (!t && idx === rawTokens.length - 1 && p.includes(' ')) return 'Space';
            return t;
        })
        .filter(Boolean);
    if (rawParts.length === 0) return '';

    let hasMod = false;
    let hasAlt = false;
    let hasShift = false;
    let mainKey = null;

    for (const part of rawParts) {
        const lower = part.toLowerCase();
        if (lower === 'mod' || lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command' || lower === 'meta') {
            hasMod = true;
        } else if (lower === 'alt' || lower === 'option') {
            hasAlt = true;
        } else if (lower === 'shift') {
            hasShift = true;
        } else {
            mainKey = normalizeKeyToken(part, '');
        }
    }

    if (!mainKey) return '';

    const parts = [];
    if (hasMod) parts.push('Mod');
    if (hasAlt) parts.push('Alt');
    if (hasShift) parts.push('Shift');
    parts.push(mainKey);
    return parts.join('+');
}

/**
 * 從 KeyboardEvent 提取標準快速鍵字串；若僅按下修飾鍵則回傳 null。
 * @param {KeyboardEvent} e
 * @returns {string|null}
 */
export function eventToShortcut(e) {
    if (!e) return null;
    const mainKey = normalizeKeyToken(e.key, e.code);
    if (!mainKey) return null;

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Mod');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(mainKey);
    return parts.join('+');
}

/**
 * 檢查標準快速鍵字串是否為僅修飾鍵外的不安全/瀏覽器系統保留鍵
 * （如僅單獨 Escape 用於取消錄製，單一輸入鍵需避免干擾打字時可提供提示）。
 * @param {string} shortcutStr
 * @returns {boolean}
 */
export function isFunctionKeyOnly(shortcutStr) {
    const norm = normalizeShortcut(shortcutStr);
    return /^F([1-9]|1[0-9]|2[0-4])$/.test(norm);
}

/**
 * 將標準快速鍵拆分為平台親和的顯示標籤陣列。
 * @param {string} shortcutStr
 * @param {boolean} [isMac=isMacPlatform()]
 * @returns {string[]}
 */
export function formatShortcutParts(shortcutStr, isMac = isMacPlatform()) {
    const norm = normalizeShortcut(shortcutStr);
    if (!norm) return [];

    return norm.split('+').map((part) => {
        if (part === 'Mod') return isMac ? 'Cmd' : 'Ctrl';
        if (part === 'Alt') return isMac ? 'Option' : 'Alt';
        if (part === 'Shift') return 'Shift';
        if (part === 'ArrowUp') return '↑';
        if (part === 'ArrowDown') return '↓';
        if (part === 'ArrowLeft') return '←';
        if (part === 'ArrowRight') return '→';
        if (part === 'Delete') return 'Del';
        return part;
    });
}

/**
 * 將標準快速鍵格式化為單行閱讀文字 (e.g. "Ctrl + Space")。
 * @param {string} shortcutStr
 * @param {boolean} [isMac=isMacPlatform()]
 * @returns {string}
 */
export function formatShortcutText(shortcutStr, isMac = isMacPlatform()) {
    return formatShortcutParts(shortcutStr, isMac).join(' + ');
}

export const KEYBINDING_CATEGORIES = ['playback', 'editing', 'visual', 'view'];

/**
 * 所有支援自訂快速鍵的內建動作定義。
 */
export const KEYBINDING_DEFINITIONS = [
    // --- 播放控制 ---
    {
        id: 'playback.toggle',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackToggle',
        defaultShortcut: 'Mod+Space',
    },
    {
        id: 'playback.reset',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackReset',
        defaultShortcut: 'Mod+Backspace',
    },
    {
        id: 'playback.stop',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackStop',
        defaultShortcut: '',
    },
    {
        id: 'playback.speedUp',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackSpeedUp',
        defaultShortcut: 'Mod+P',
        allowRepeat: true,
    },
    {
        id: 'playback.speedDown',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackSpeedDown',
        defaultShortcut: 'Mod+O',
        allowRepeat: true,
    },
    {
        id: 'playback.seekBackward',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackSeekBackward',
        defaultShortcut: 'Mod+ArrowLeft',
        allowRepeat: true,
    },
    {
        id: 'playback.seekForward',
        category: 'playback',
        labelKey: 'keybindings.actions.playbackSeekForward',
        defaultShortcut: 'Mod+ArrowRight',
        allowRepeat: true,
    },
    {
        id: 'playback.jumpToCursor',
        category: 'playback',
        labelKey: 'keybindings.actions.jumpToCursor',
        defaultShortcut: '',
    },
    {
        id: 'playback.cursorToPlayhead',
        category: 'playback',
        labelKey: 'keybindings.actions.cursorToPlayhead',
        defaultShortcut: '',
    },

    // --- 編輯與譜面 ---
    {
        id: 'edit.save',
        category: 'editing',
        labelKey: 'keybindings.actions.editSave',
        defaultShortcut: 'Mod+S',
    },
    {
        id: 'edit.find',
        category: 'editing',
        labelKey: 'keybindings.actions.editFind',
        defaultShortcut: 'Mod+F',
    },
    {
        id: 'edit.replace',
        category: 'editing',
        labelKey: 'keybindings.actions.editReplace',
        defaultShortcut: 'Mod+H',
    },
    {
        id: 'edit.undo',
        category: 'editing',
        labelKey: 'keybindings.actions.editUndo',
        defaultShortcut: 'Mod+Z',
        allowRepeat: true,
    },
    {
        id: 'edit.redo',
        category: 'editing',
        labelKey: 'keybindings.actions.editRedo',
        defaultShortcut: 'Mod+Y',
        fallbackShortcuts: ['Mod+Shift+Z'],
        allowRepeat: true,
    },
    {
        id: 'edit.format',
        category: 'editing',
        labelKey: 'keybindings.actions.editFormat',
        defaultShortcut: 'Shift+Alt+F',
        fallbackShortcuts: ['Mod+Shift+I'],
    },
    {
        id: 'edit.toggleBk',
        category: 'editing',
        labelKey: 'keybindings.actions.editToggleBk',
        defaultShortcut: '',
    },
    {
        id: 'edit.toggleEx',
        category: 'editing',
        labelKey: 'keybindings.actions.editToggleEx',
        defaultShortcut: '',
    },
    {
        id: 'edit.rotateClockwise',
        category: 'editing',
        labelKey: 'keybindings.actions.editRotateClockwise',
        defaultShortcut: '',
        allowRepeat: true,
    },
    {
        id: 'edit.rotateCounterClockwise',
        category: 'editing',
        labelKey: 'keybindings.actions.editRotateCounterClockwise',
        defaultShortcut: '',
        allowRepeat: true,
    },
    {
        id: 'edit.rotate180',
        category: 'editing',
        labelKey: 'keybindings.actions.editRotate180',
        defaultShortcut: '',
    },
    {
        id: 'edit.flipVertical',
        category: 'editing',
        labelKey: 'keybindings.actions.editFlipVertical',
        defaultShortcut: '',
    },
    {
        id: 'edit.flipHorizontal',
        category: 'editing',
        labelKey: 'keybindings.actions.editFlipHorizontal',
        defaultShortcut: '',
    },
    {
        id: 'edit.subdivision',
        category: 'editing',
        labelKey: 'keybindings.actions.editSubdivision',
        defaultShortcut: '',
    },
    {
        id: 'edit.smoothBpm',
        category: 'editing',
        labelKey: 'keybindings.actions.editSmoothBpm',
        defaultShortcut: '',
    },

    // --- 視覺化編輯模式 ---
    {
        id: 'visual.toolPlace',
        category: 'visual',
        labelKey: 'keybindings.actions.visualToolPlace',
        defaultShortcut: 'E',
        visualOnly: true,
    },
    {
        id: 'visual.toolSelect',
        category: 'visual',
        labelKey: 'keybindings.actions.visualToolSelect',
        defaultShortcut: 'V',
        fallbackShortcuts: ['S'],
        visualOnly: true,
    },
    {
        id: 'visual.toolBoxSelect',
        category: 'visual',
        labelKey: 'keybindings.actions.visualToolBoxSelect',
        defaultShortcut: 'B',
        visualOnly: true,
    },
    {
        id: 'visual.deleteSelected',
        category: 'visual',
        labelKey: 'keybindings.actions.visualDeleteSelected',
        defaultShortcut: 'Delete',
        fallbackShortcuts: ['Backspace'],
        visualOnly: true,
    },
    {
        id: 'visual.clearSelection',
        category: 'visual',
        labelKey: 'keybindings.actions.visualClearSelection',
        defaultShortcut: 'Escape',
        visualOnly: true,
    },

    // --- 檢視與介面 ---
    {
        id: 'view.toggleEditor',
        category: 'view',
        labelKey: 'keybindings.actions.viewToggleEditor',
        defaultShortcut: '',
    },
    {
        id: 'view.toggleMode',
        category: 'view',
        labelKey: 'keybindings.actions.viewToggleMode',
        defaultShortcut: '',
    },
    {
        id: 'view.togglePlayControls',
        category: 'view',
        labelKey: 'keybindings.actions.viewTogglePlayControls',
        defaultShortcut: '',
    },
    {
        id: 'view.fullscreen',
        category: 'view',
        labelKey: 'keybindings.actions.viewFullscreen',
        defaultShortcut: '',
    },
    {
        id: 'view.openSettings',
        category: 'view',
        labelKey: 'keybindings.actions.viewOpenSettings',
        defaultShortcut: '',
    },
];

export const KEYBINDING_DEF_MAP = new Map(
    KEYBINDING_DEFINITIONS.map(def => [def.id, def])
);

/**
 * 取得某個動作目前實際生效的主快速鍵（正規化字串；`''` 表示未設定/已清除）。
 * @param {string} actionId
 * @param {Record<string, string>} [customKeybindings]
 * @returns {string}
 */
export function getEffectiveShortcut(actionId, customKeybindings = {}) {
    const def = KEYBINDING_DEF_MAP.get(actionId);
    if (!def) return '';
    if (customKeybindings && Object.prototype.hasOwnProperty.call(customKeybindings, actionId)) {
        return normalizeShortcut(customKeybindings[actionId] || '');
    }
    return normalizeShortcut(def.defaultShortcut || '');
}

/**
 * 檢查某個動作是否被使用者修改過（與預設值不同）。
 * @param {string} actionId
 * @param {Record<string, string>} [customKeybindings]
 * @returns {boolean}
 */
export function isShortcutCustomized(actionId, customKeybindings = {}) {
    const def = KEYBINDING_DEF_MAP.get(actionId);
    if (!def) return false;
    return getEffectiveShortcut(actionId, customKeybindings) !== normalizeShortcut(def.defaultShortcut || '');
}

/**
 * 檢查指定的快速鍵是否與其他動作衝突，回傳第一個衝突的動作定義，若無則回傳 null。
 * 僅在範圍可能重疊時判定為衝突（visualOnly 之間衝突、全域之間衝突、visualOnly 與全域之間亦衝突）。
 * @param {string} shortcutStr
 * @param {string} excludeActionId
 * @param {Record<string, string>} [customKeybindings]
 * @returns {Object|null}
 */
export function findConflictingAction(shortcutStr, excludeActionId, customKeybindings = {}) {
    const target = normalizeShortcut(shortcutStr);
    if (!target) return null;

    for (const def of KEYBINDING_DEFINITIONS) {
        if (def.id === excludeActionId) continue;
        const active = getEffectiveShortcut(def.id, customKeybindings);
        if (active === target) {
            return def;
        }
    }
    return null;
}

/**
 * 判斷指定 KeyboardEvent 與目標元素在當前模式下是否允許觸發快捷鍵。
 * @param {KeyboardEvent} e
 * @param {Object} actionDef
 * @param {string} matchedShortcut
 * @param {Object} context
 * @param {boolean} context.isVisualMode
 * @param {HTMLElement|null} context.editorInput
 * @returns {boolean}
 */
export function canTriggerActionInContext(e, actionDef, matchedShortcut, { isVisualMode = false, editorInput = null } = {}) {
    if (!actionDef || !matchedShortcut) return false;
    if (e.repeat && !actionDef.allowRepeat) return false;
    if (actionDef.visualOnly && !isVisualMode) return false;

    const target = e.target;
    const tagName = target?.tagName || '';
    const isEditorTextarea = Boolean(editorInput && target === editorInput);
    const isTextControl = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || Boolean(target?.isContentEditable);

    if (!isTextControl) return true;

    const hasPrimaryMod = matchedShortcut.includes('Mod+') || matchedShortcut.includes('Alt+');

    // 在一般單行輸入框 / 下拉選單 / 其他文字框內，不攔截單鍵或標準輸入框編輯捷徑
    if (!isEditorTextarea) {
        if (!hasPrimaryMod && !isFunctionKeyOnly(matchedShortcut)) {
            return false;
        }
        // 讓一般輸入框保留原生 Ctrl+Z / Ctrl+Y / Ctrl+A / Ctrl+C / Ctrl+V / Ctrl+X 等能力
        if (actionDef.id === 'edit.undo' || actionDef.id === 'edit.redo') {
            return false;
        }
        if (/^(Mod\+([ACVXZY]|Arrow(Left|Right)))$/i.test(matchedShortcut)) {
            return false;
        }
        return true;
    }

    // 焦點在主譜面 editorInput (<textarea>) 內時：
    // 僅允許帶 Mod/Alt 的組合鍵或 F1~F24 功能鍵，單鍵與純 Shift+鍵保留給打字輸入
    return hasPrimaryMod || isFunctionKeyOnly(matchedShortcut);
}

/**
 * 根據目前的 KeyboardEvent 與使用者快速鍵設定，解析對應的動作定義。
 * 先比對主要生效快速鍵，若無命中且該組合未被任何動作占用，再檢查內建相容備用鍵 (fallbackShortcuts)。
 * @param {KeyboardEvent} e
 * @param {Record<string, string>} customKeybindings
 * @param {{ isVisualMode: boolean, editorInput: HTMLElement|null }} context
 * @returns {{ action: Object, shortcut: string } | null}
 */
export function resolveKeybindingMatch(e, customKeybindings = {}, context = {}) {
    const combo = eventToShortcut(e);
    if (!combo) return null;

    // 1. 優先比對所有動作目前生效的主快速鍵
    for (const def of KEYBINDING_DEFINITIONS) {
        const active = getEffectiveShortcut(def.id, customKeybindings);
        if (active && active === combo) {
            if (canTriggerActionInContext(e, def, active, context)) {
                return { action: def, shortcut: active };
            }
            // 若在視覺模式下該鍵剛好綁定在全域/不相符作用域，繼續找是否有相符作用域（或無）
        }
    }

    // 檢查此組合鍵是否已被任何動作綁定為主要快捷鍵（若已被改寫佔用，則不退回別人的 fallback）
    const isClaimedByPrimary = KEYBINDING_DEFINITIONS.some(
        (def) => getEffectiveShortcut(def.id, customKeybindings) === combo
    );
    if (isClaimedByPrimary) {
        return null;
    }

    // 2. 向下相容備用鍵 (僅在該動作未被自訂為停用/覆寫，或維持預設時有效)
    for (const def of KEYBINDING_DEFINITIONS) {
        if (!Array.isArray(def.fallbackShortcuts) || def.fallbackShortcuts.length === 0) continue;
        // 若使用者已明確自訂該動作（包含清空停用），則不額外保留其舊備用鍵避免困惑
        if (isShortcutCustomized(def.id, customKeybindings)) continue;

        for (const fb of def.fallbackShortcuts) {
            const normFb = normalizeShortcut(fb);
            if (normFb && normFb === combo) {
                if (canTriggerActionInContext(e, def, normFb, context)) {
                    return { action: def, shortcut: normFb };
                }
            }
        }
    }

    return null;
}
