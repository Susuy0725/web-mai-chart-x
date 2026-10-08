import { popupWindow, clamp, createCustomSlider, simpleToast } from '../helper.js';
import { settingsConfig } from '../core/settingsConfig.js';
import { t, setLang } from '../i18n.js';
import { idbSet } from '../indexDB.js';
import { appContext } from '../core/appContext.js';
import { eventBus, EVENTS } from '../core/eventBus.js';

/**
 * 開啟全域設定彈窗
 * @param {Object} [options={}]
 * @param {Object} [options.settings] 全域設定物件 (預設自 appContext 取得)
 * @param {Object} [options.audioManager] 音訊管理器 (預設自 appContext 取得)
 * @param {Function} [options.saveSettingsDebounce] 儲存設定防抖函數
 * @param {Function} [options.setEditorCss] 編輯器樣式套用函數
 * @param {Function} [options.draw] 畫布重繪函數
 * @param {number} [options.initialTab=0]
 */
export function openSettingsModal(options = {}) {
    const settings = options.settings || appContext.settings;
    const audioManager = options.audioManager || appContext.audioManager;
    const saveSettingsDebounce = options.saveSettingsDebounce || (() => appContext.saveSettings());
    const setEditorCss = options.setEditorCss || appContext.get('setEditorCss');
    const draw = options.draw || (() => appContext.draw());
    const initialTab = options.initialTab || 0;
    const container = document.createElement('div');
    container.className = 'popup-setting-container';

    // 左側導覽列 (Tabs)
    const sidebar = document.createElement('div');
    sidebar.className = 'popup-setting-sidebar';

    // 右側內容區
    const contentArea = document.createElement('div');
    contentArea.className = 'popup-setting-content';

    container.appendChild(sidebar);
    container.appendChild(contentArea);

    const sections = [];
    const tabs = [];
    let currentTabIndex = initialTab;

    const switchTab = (index) => {
        currentTabIndex = index;
        tabs.forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });
        sections.forEach((sec, i) => {
            sec.classList.toggle('active', i === index);
        });
    };

    const addTab = (label) => {
        const index = tabs.length;
        const tab = document.createElement('div');
        tab.textContent = label;
        tab.className = 'popup-setting-tab';
        tab.addEventListener('click', () => switchTab(index));
        sidebar.appendChild(tab);
        tabs.push(tab);

        const section = document.createElement('div');
        section.className = 'popup-setting-section';

        contentArea.appendChild(section);
        sections.push(section);

        return section;
    };

    const createRow = (labelText, element) => {
        const row = document.createElement('div');
        row.className = 'popup-setting-row';

        // 1. Checkbox
        if (element.type === 'checkbox') {
            const wrapper = document.createElement('label');
            wrapper.className = 'popup-setting-wrapper';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.className = 'popup-setting-text';
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 2. Range (自訂 div 滑桿主容器)
        if (element.type === 'range') {
            const wrapper = document.createElement('label');
            wrapper.className = 'popup-setting-wrapper';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.className = 'popup-setting-text';

            element.style.width = '140px';
            element.style.flexShrink = '0';
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 3. Object (子屬性折疊選單)
        if (element.dataset && element.dataset.type === 'object-container') {
            row.className = 'popup-setting-row popup-setting-row-object';

            const header = document.createElement('div');
            header.className = 'popup-setting-object-header';
            header.innerHTML = `<span>${labelText}</span><span class="popup-setting-arrow-icon">▼</span>`;

            const subBody = element;
            subBody.className = 'popup-setting-subbody';

            header.addEventListener('click', () => {
                const isExpanded = subBody.classList.toggle('open');
                header.querySelector('.popup-setting-arrow-icon').classList.toggle('expanded', isExpanded);
            });

            row.appendChild(header);
            row.appendChild(subBody);
            return row;
        }

        // 4. Button
        if (element.tagName === 'BUTTON') {
            const label = document.createElement('label');
            label.textContent = labelText;
            label.className = 'popup-setting-label';
            element.className = 'popup-setting-element';
            row.appendChild(label);
            row.appendChild(element);
            return row;
        }

        // 5. 一般 Number / Dropdown
        const label = document.createElement('label');
        label.textContent = labelText;
        label.className = 'popup-setting-label';
        element.className = 'popup-setting-input';
        row.appendChild(label);
        row.appendChild(element);
        return row;
    };

    const applySettings = () => {
        const values = {};

        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            let finalVal;

            if (config.type === 'button') {
                return;
            } else if (config.type === 'checkbox') {
                finalVal = config.el.checked;
            } else if (config.type === 'dropdown') {
                finalVal = isNaN(config.el.value) ? config.el.value : parseFloat(config.el.value);
            } else if (config.type === 'object') {
                // 直接複製子選單同步完的物件結果
                finalVal = { ...config.el.value };
            } else {
                const rawVal = parseFloat(config.el.value);
                finalVal = isNaN(rawVal) ? config.def : clamp(rawVal, Number(config.el.min), Number(config.el.max));
            }

            values[id] = finalVal;

            // 深度指派物件結構，避免直接蓋掉引用
            if (config.type === 'object') {
                Object.assign(config.ref[config.key], finalVal);
            } else {
                config.ref[config.key] = finalVal;
            }
        });

        // 透過 appContext 同步並派發變更事件
        Object.keys(values).forEach(id => {
            appContext.setSetting(id, values[id]);
        });

        Object.keys(inputRefs).forEach(id => {
            if (inputRefs[id].apply) {
                try {
                    inputRefs[id].apply(values[id], values);
                } catch (err) {
                    console.error(`[settingsModal] Error applying setting "${id}":`, err);
                }
            }
        });

        eventBus.emit(EVENTS.SETTINGS_SAVED, { allSettings: settings });
        if (saveSettingsDebounce) saveSettingsDebounce();
        if (setEditorCss) setEditorCss();
        if (draw) draw();
        simpleToast({ content: t('toast.settingsSaved'), type: 'success', timeout: 1500 });
    };

    const createNumberInput = (value, step = 0.1, min = -999, max = 9999) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = step;
        input.min = min;
        input.max = max;
        input.value = value;
        return input;
    };

    const createCheckbox = (checked, id) => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'popup-setting-checkbox';
        input.id = id;
        input.checked = checked;
        return input;
    };

    function applyAudioSettings(s) {
        if (!audioManager || !s) return;
        if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
        if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
        if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
        if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
    }

    const createDropdown = (value, rawOpts = []) => {
        const options = typeof rawOpts === 'function' ? rawOpts() : rawOpts;
        const select = document.createElement('select');
        select.className = 'popup-setting-dropdown';
        (options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = typeof opt.label === 'string' && opt.label.startsWith('settings.') ? t(opt.label) : opt.label;
            if (opt.value == value) o.selected = true;
            select.appendChild(o);
        });
        return select;
    };

    const inputRefs = {};
    let popupCtx = null;

    // 生成各分類與設定項
    settingsConfig.forEach((category) => {
        const section = addTab(t(category.label));

        if (category.html) {
            section.innerHTML += category.html;
        }

        (category.items || []).forEach(item => {
            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;

            // --- A. 處理 Checkbox ---
            if (item.type === 'checkbox') {
                el = createCheckbox(currentVal, `settings-${item.id}`);
                el.addEventListener('change', (e) => {
                    try {
                        const checked = e.target.checked;
                        targetRef[targetKey] = checked;
                        appContext.setSetting(targetKey, checked);
                        if (item.apply) item.apply(checked);
                    } catch (err) { }
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // --- B. 處理 Dropdown ---
            else if (item.type === 'dropdown') {
                el = createDropdown(currentVal, item.options);
                el.addEventListener('change', async (e) => {
                    const newValue = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value);
                    try {
                        targetRef[targetKey] = newValue;
                        appContext.setSetting(targetKey, newValue);
                    } catch (err) { }
                    if (item.id === 'lang') {
                        el.disabled = true;
                        const success = await setLang(newValue);
                        if (success) {
                            idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
                            if (popupCtx) {
                                popupCtx.close();
                                // 重新開啟設定彈窗以應用新語系介面
                                openSettingsModal({
                                    settings,
                                    audioManager,
                                    saveSettingsDebounce,
                                    setEditorCss,
                                    draw,
                                    initialTab: currentTabIndex
                                });
                            }
                        } else {
                            el.disabled = false;
                            el.value = currentVal;
                        }
                    }
                });
            }
            // --- C. 處理 Range ---
            else if (item.type === 'range') {
                el = createCustomSlider(currentVal, item.min, item.max, item.step, (val) => {
                    try {
                        targetRef[targetKey] = val;
                        appContext.setSetting(targetKey, val);
                        if (item.apply) item.apply(val);
                    } catch (err) { }
                });
            }
            // --- D. 處理 Object (如 sfxVolumes) ---
            else if (item.type === 'object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;

                    const subSlider = createCustomSlider(subCurrent, 0, 1, 0.05, (subVal) => {
                        try {
                            el.value[subKey] = subVal;
                            targetRef[targetKey][subKey] = subVal;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
                        } catch (e) { }
                    });

                    el._subRefs[subKey] = subSlider;

                    const subRow = createRow(subKey, subSlider);
                    el.appendChild(subRow);
                });

                el._updateDisplay = () => {
                    Object.keys(el._subRefs).forEach(subKey => {
                        el._subRefs[subKey].value = targetRef[targetKey][subKey] ?? item.def[subKey];
                        if (el._subRefs[subKey]._updateDisplay) el._subRefs[subKey]._updateDisplay();
                    });
                };
            }
            // --- E. 處理 Button ---
            else if (item.type === 'button') {
                el = document.createElement('button');
                el.type = 'button';
                el.textContent = t(item.btnText || 'popup.reset');
                if (item.onClick) {
                    el.addEventListener('click', item.onClick);
                }
            }
            // --- F. 一般 Number ---
            else {
                el = createNumberInput(currentVal, item.step, item.min, item.max);
            }

            inputRefs[item.id] = {
                el,
                def: item.def,
                type: item.type,
                apply: item.apply,
                ref: targetRef,
                key: targetKey
            };
            section.appendChild(createRow(t(item.label), el));
        });
    });

    switchTab(currentTabIndex);

    const oldAudioSettings = {
        globalVolume: settings.globalVolume,
        musicVolume: settings.musicVolume,
        SfxVolume: settings.SfxVolume,
        sfxVolumes: settings.sfxVolumes ? { ...settings.sfxVolumes } : null
    };

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "500px",
        buttons: [
            {
                text: t('popup.save'),
                onClick: () => { applySettings(); },
                hideOnClick: true
            },
            {
                text: t('popup.apply'),
                onClick: () => { applySettings(); }
            },
            {
                text: t('popup.cancel'),
                onClick: () => {
                    applyAudioSettings(oldAudioSettings);
                },
                hideOnClick: true
            },
            {
                text: t('popup.reset'),
                onClick: () => {
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'button') {
                            return;
                        } else if (ref.type === 'checkbox') {
                            ref.el.checked = ref.def;
                            ref.ref[ref.key] = ref.def;
                        } else if (ref.type === 'object') {
                            ref.el.value = { ...ref.def };
                            Object.assign(ref.ref[ref.key], ref.def);
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                            if (ref.apply) ref.apply(ref.ref[ref.key]);
                        } else {
                            ref.el.value = ref.def;
                            ref.ref[ref.key] = ref.def;
                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                            if (ref.apply) ref.apply(ref.def);
                        }
                    });

                    if (draw) draw();
                    simpleToast({ content: t('toast.restoreSaved'), type: 'info', timeout: 1500 });
                }
            },
        ]
    });
}
