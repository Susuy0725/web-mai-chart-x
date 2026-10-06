/**
 * visualSubMenu.js
 * 可復用的視覺化編輯器子選單按鈕組件 (VisualSubMenu)
 */

export class VisualSubMenu {
    static instances = new Set();
    static isGlobalListenerInitialized = false;

    /**
     * @param {Object} options
     * @param {string} options.id - 唯一識別碼
     * @param {HTMLElement} options.triggerEl - 觸發主按鈕元素
     * @param {HTMLElement} options.paletteEl - 左側子選單容器元素
     * @param {HTMLElement} options.iconContainerEl - 觸發主按鈕內的圖示插槽容器元素
     * @param {Object.<string, { render: () => string|HTMLElement, label?: string }>} [options.itemDefinitions] - 各選項的圖示渲染與定義
     * @param {string} [options.defaultValue] - 預設值 (例如 'none' 或 'tap' 或 '4')
     * @param {Function} [options.onSelect] - 選中項目時的回呼 (value) => void
     * @param {Function} [options.onToggle] - 展開/收合時的回呼 (isOpen) => void
     */
    constructor(options) {
        this.id = options.id;
        this.triggerEl = options.triggerEl;
        this.paletteEl = options.paletteEl;
        this.iconContainerEl = options.iconContainerEl;
        this.itemDefinitions = options.itemDefinitions || {};
        this.defaultValue = options.defaultValue;
        this.itemValueAttr = options.itemValueAttr || null;
        this.onSelect = options.onSelect;
        this.onToggle = options.onToggle;

        // 自動確保通用模組 class
        if (this.paletteEl && !this.paletteEl.classList.contains('visual-sub-palette')) {
            this.paletteEl.classList.add('visual-sub-palette');
        }
        if (this.triggerEl && !this.triggerEl.classList.contains('sub-menu-trigger')) {
            this.triggerEl.classList.add('sub-menu-trigger');
        }

        this.currentValue = this.defaultValue;
        this.isOpen = false;

        VisualSubMenu.instances.add(this);
        VisualSubMenu.initGlobalListeners();

        this._bindEvents();
    }

    _getItemValue(itemEl) {
        return itemEl.dataset.divisionVal || itemEl.dataset.value || itemEl.dataset.noteType || itemEl.dataset.modifierType;
    }

    _bindEvents() {
        if (this.triggerEl) {
            this.triggerEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const forId = this.triggerEl.getAttribute('for') || this.triggerEl.htmlFor;
                if (forId) {
                    const radio = document.getElementById(forId);
                    if (radio && !radio.checked) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                        this.open();
                        return;
                    }
                }
                this.toggle();
            });
        }

        if (this.paletteEl) {
            this.paletteEl.addEventListener('click', (e) => {
                const itemEl = e.target.closest('.palette-item');
                if (!itemEl) return;
                e.stopPropagation();

                const value = this._getItemValue(itemEl);
                if (value) {
                    const def = this.itemDefinitions[value];
                    if (def && def.isAction && typeof def.action === 'function') {
                        def.action();
                        this.close();
                        return;
                    }
                    this.setValue(value);
                    const forId = this.triggerEl?.getAttribute('for') || this.triggerEl?.htmlFor;
                    if (forId) {
                        const radio = document.getElementById(forId);
                        if (radio && !radio.checked) {
                            radio.checked = true;
                            radio.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                    this.close();
                }
            });
        }
    }

    /**
     * 檢查是否已註冊特定選項定義
     * @param {string} value
     * @returns {boolean}
     */
    hasDefinition(value) {
        return Boolean(this.itemDefinitions && Object.prototype.hasOwnProperty.call(this.itemDefinitions, value));
    }

    /**
     * 動態註冊或更新選項定義
     * @param {string} value
     * @param {Object} def
     */
    registerItemDefinition(value, def) {
        this.itemDefinitions[value] = def;
    }

    /**
     * 動態確保某個選項存在：若不存在則自動創建 DOM 元素並註冊定義
     * @param {Object} itemDef
     * @param {string} itemDef.value
     * @param {string} [itemDef.title]
     * @param {string} [itemDef.label]
     * @param {Function} [itemDef.render]
     * @param {string} [itemDef.contentHtml]
     * @param {string} [beforeValue=null] - 若指定，則插入至該 value 的選項前
     */
    ensureItem(itemDef, beforeValue = null) {
        if (!itemDef || !itemDef.value) return;
        const valStr = String(itemDef.value);
        if (!this.hasDefinition(valStr)) {
            this.registerItemDefinition(valStr, {
                render: itemDef.render || (() => itemDef.contentHtml || valStr),
                label: itemDef.label || itemDef.title || valStr,
                isAction: Boolean(itemDef.isAction),
                action: itemDef.action
            });
        }

        if (this.paletteEl) {
            let existingItem = null;
            this.paletteEl.querySelectorAll('.palette-item').forEach(itemEl => {
                if (this._getItemValue(itemEl) === valStr) {
                    existingItem = itemEl;
                }
            });

            if (!existingItem) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'palette-item';
                if (this.itemValueAttr) {
                    btn.dataset[this.itemValueAttr] = valStr;
                } else {
                    btn.dataset.value = valStr;
                }
                btn.title = itemDef.title || itemDef.label || valStr;

                if (typeof itemDef.render === 'function') {
                    const rendered = itemDef.render();
                    if (typeof rendered === 'string') {
                        btn.innerHTML = rendered;
                    } else if (rendered instanceof HTMLElement) {
                        btn.appendChild(rendered);
                    }
                } else if (itemDef.contentHtml) {
                    btn.innerHTML = itemDef.contentHtml;
                } else {
                    btn.textContent = valStr;
                }

                let targetBeforeEl = null;
                if (beforeValue) {
                    this.paletteEl.querySelectorAll('.palette-item').forEach(itemEl => {
                        if (this._getItemValue(itemEl) === String(beforeValue)) {
                            targetBeforeEl = itemEl;
                        }
                    });
                }

                if (targetBeforeEl) {
                    this.paletteEl.insertBefore(btn, targetBeforeEl);
                } else {
                    this.paletteEl.appendChild(btn);
                }
            }
        }
    }

    /**
     * 設定目前選中值並更新 UI
     * @param {string} value
     * @param {boolean} [silent=false]
     */
    setValue(value, silent = false) {
        this.currentValue = value;
        this._updateUI();

        if (!silent && typeof this.onSelect === 'function') {
            this.onSelect(value);
        }
    }

    /**
     * 取得目前選中值
     * @returns {string}
     */
    getValue() {
        return this.currentValue;
    }

    _updateUI() {
        // 1. 更新主按鈕圖示或文字插槽
        if (this.iconContainerEl && this.itemDefinitions[this.currentValue]) {
            const def = this.itemDefinitions[this.currentValue];
            if (typeof def.render === 'function') {
                const content = def.render();
                if (typeof content === 'string') {
                    this.iconContainerEl.innerHTML = content;
                } else if (content instanceof HTMLElement) {
                    this.iconContainerEl.replaceChildren(content);
                }
            }
        }

        // 2. 更新子選單項目 active 狀態
        if (this.paletteEl) {
            this.paletteEl.querySelectorAll('.palette-item').forEach(itemEl => {
                const val = this._getItemValue(itemEl);
                itemEl.classList.toggle('active', val === this.currentValue);
            });
        }
    }

    /**
     * 展開子面板
     */
    open() {
        VisualSubMenu.instances.forEach(menu => {
            if (menu !== this) {
                menu.close();
            }
        });

        this.isOpen = true;
        if (this.paletteEl) {
            this.paletteEl.style.display = 'flex';
        }
        if (this.triggerEl) {
            this.triggerEl.classList.add('menu-open');
        }
        if (typeof this.onToggle === 'function') {
            this.onToggle(true);
        }
    }

    /**
     * 收合子面板
     */
    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.paletteEl) {
            this.paletteEl.style.display = 'none';
        }
        if (this.triggerEl) {
            this.triggerEl.classList.remove('menu-open');
        }
        if (typeof this.onToggle === 'function') {
            this.onToggle(false);
        }
    }

    /**
     * 切換展開/收合
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * 判斷目標節點是否在此菜單之內
     * @param {Node} target
     * @returns {boolean}
     */
    contains(target) {
        return (this.triggerEl && this.triggerEl.contains(target)) ||
               (this.paletteEl && this.paletteEl.contains(target));
    }

    /**
     * 關閉所有子選單
     */
    static closeAll() {
        VisualSubMenu.instances.forEach(menu => menu.close());
    }

    /**
     * 強制隱藏所有子選單面板 DOM (例如切換離開視覺化編輯模式時)
     */
    static hideAllPalettes() {
        VisualSubMenu.instances.forEach(menu => {
            menu.isOpen = false;
            if (menu.paletteEl) {
                menu.paletteEl.style.display = 'none';
            }
            if (menu.triggerEl) {
                menu.triggerEl.classList.remove('menu-open');
            }
        });
    }

    /**
     * 初始化全域外部點擊事件
     */
    static initGlobalListeners() {
        if (VisualSubMenu.isGlobalListenerInitialized) return;
        VisualSubMenu.isGlobalListenerInitialized = true;

        document.addEventListener('pointerdown', (e) => {
            let clickedInsideAny = false;
            for (const menu of VisualSubMenu.instances) {
                if (menu.contains(e.target)) {
                    clickedInsideAny = true;
                    break;
                }
            }
            if (!clickedInsideAny) {
                VisualSubMenu.closeAll();
            }
        });
    }
}
