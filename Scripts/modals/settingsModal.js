import { popupWindow, clamp, simpleToast, defaultSyntaxColors, applySyntaxColors, syntaxColorPresets } from '../helper.js';
import { settingsConfig, isEasterEggUnlocked } from '../core/settingsConfig.js';
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

        // 4. Color Wrap
        if (element.classList && element.classList.contains('popup-setting-color-wrap')) {
            const label = document.createElement('label');
            label.textContent = labelText;
            label.className = 'popup-setting-label';
            row.appendChild(label);
            row.appendChild(element);
            return row;
        }

        // 5. Button
        if (element.tagName === 'BUTTON') {
            const label = document.createElement('label');
            label.textContent = labelText;
            label.className = 'popup-setting-label';
            element.className = 'popup-setting-element';
            row.appendChild(label);
            row.appendChild(element);
            return row;
        }

        // 6. 一般 Number / Dropdown
        const label = document.createElement('label');
        label.textContent = labelText;
        label.className = 'popup-setting-label';
        if (!element.classList.contains('popup-setting-dropdown') &&
            !element.classList.contains('popup-setting-input') &&
            !element.classList.contains('popup-setting-color-wrap')) {
            element.classList.add('popup-setting-input');
        }
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
            } else if (config.type === 'text') {
                finalVal = config.el.value;
            } else if (config.type === 'object' || config.type === 'color-object') {
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

    const createRangeInput = (value, min = 0, max = 1, step = 0.1, onInputCallback) => {
        const wrap = document.createElement('div');
        wrap.className = 'popup-setting-range-wrap';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'popup-setting-range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;

        const valSpan = document.createElement('span');
        valSpan.className = 'popup-setting-range-val';
        const formatVal = (v) => {
            const num = parseFloat(v);
            if (isNaN(num)) return v;
            if (step >= 1) return Math.round(num).toString();
            const precision = step < 0.01 ? 3 : (step < 0.1 ? 2 : 1);
            return num.toFixed(precision);
        };

        const updateVisuals = () => {
            valSpan.textContent = formatVal(input.value);
            const minNum = parseFloat(input.min);
            const maxNum = parseFloat(input.max);
            const curVal = parseFloat(input.value);
            const pct = (maxNum <= minNum) ? 0 : Math.max(0, Math.min(100, ((curVal - minNum) / (maxNum - minNum)) * 100));
            input.style.setProperty('--range-pct', `${pct}%`);
        };

        updateVisuals();

        input.addEventListener('input', () => {
            updateVisuals();
            if (onInputCallback) onInputCallback(parseFloat(input.value));
        });
        input.addEventListener('change', () => {
            updateVisuals();
        });

        wrap.type = 'range';
        Object.defineProperty(wrap, 'value', {
            get: () => input.value,
            set: (v) => {
                input.value = v;
                updateVisuals();
            }
        });
        wrap.min = min;
        wrap.max = max;
        wrap.step = step;
        wrap._updateDisplay = () => {
            updateVisuals();
        };

        wrap.appendChild(input);
        wrap.appendChild(valSpan);
        return wrap;
    };

    const createColorInput = (value, onInputCallback, previewText = '') => {
        const wrap = document.createElement('div');
        wrap.className = 'popup-setting-color-wrap';

        const preview = document.createElement('span');
        preview.className = 'popup-setting-color-preview';
        preview.textContent = previewText;
        preview.style.color = value;

        const hexText = document.createElement('span');
        hexText.className = 'popup-setting-color-hex';
        hexText.textContent = (value || '').toUpperCase();

        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'popup-setting-color-input';
        input.value = value;

        const updateColor = (newVal) => {
            input.value = newVal;
            preview.style.color = newVal;
            hexText.textContent = (newVal || '').toUpperCase();
        };

        input.addEventListener('input', () => {
            updateColor(input.value);
            if (onInputCallback) onInputCallback(input.value);
        });

        wrap.setValue = (newVal) => {
            updateColor(newVal);
        };

        wrap.appendChild(preview);
        wrap.appendChild(hexText);
        wrap.appendChild(input);
        return wrap;
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
        if (category.secret && !isEasterEggUnlocked()) {
            return;
        }
        const section = addTab(category.label === '???' ? '???' : t(category.label));

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
                el = createRangeInput(currentVal, item.min, item.max, item.step, (val) => {
                    try {
                        targetRef[targetKey] = val;
                        appContext.setSetting(targetKey, val);
                        if (item.apply) item.apply(val);
                    } catch (err) { }
                });
            }
            // --- D. 處理 Text ---
            else if (item.type === 'text') {
                el = document.createElement('input');
                el.type = 'text';
                el.className = 'popup-setting-input popup-setting-input-text';
                el.value = currentVal ?? '';
                el.addEventListener('input', (e) => {
                    try {
                        targetRef[targetKey] = e.target.value;
                        appContext.setSetting(targetKey, e.target.value);
                        if (item.apply) item.apply(e.target.value);
                    } catch (err) { }
                });
            }
            // --- E. 處理 Object (如 sfxVolumes) ---
            else if (item.type === 'object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;

                    const subSlider = createRangeInput(subCurrent, 0, 1, 0.05, (subVal) => {
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
            // --- F. 處理 Color Object (如 syntaxColors) ---
            else if (item.type === 'color-object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                // 頂部色系預設組 (Presets) 與重設按鈕列
                const toolbarRow = document.createElement('div');
                toolbarRow.className = 'popup-setting-color-toolbar';

                const presetGroup = document.createElement('div');
                presetGroup.className = 'popup-setting-color-preset-group';

                const presetLabel = document.createElement('label');
                presetLabel.textContent = t('settings.syntaxColorPresets.title');

                const presetSelect = document.createElement('select');
                presetSelect.className = 'popup-setting-dropdown popup-setting-preset-dropdown';

                // 加入 Custom 選項
                const customOpt = document.createElement('option');
                customOpt.value = 'custom';
                customOpt.textContent = t('settings.syntaxColorPresets.custom');
                presetSelect.appendChild(customOpt);

                // 加入各預設組
                Object.keys(syntaxColorPresets).forEach(presetKey => {
                    const opt = document.createElement('option');
                    opt.value = presetKey;
                    opt.textContent = t(`settings.syntaxColorPresets.${presetKey}`);
                    presetSelect.appendChild(opt);
                });

                const detectMatchingPreset = (curColors) => {
                    if (!curColors) return 'custom';
                    for (const [key, preset] of Object.entries(syntaxColorPresets)) {
                        const matches = Object.keys(preset.colors).every(k =>
                            (curColors[k] || '').toLowerCase() === (preset.colors[k] || '').toLowerCase()
                        );
                        if (matches) return key;
                    }
                    return 'custom';
                };

                presetSelect.value = detectMatchingPreset(currentVal);

                presetSelect.addEventListener('change', (e) => {
                    const selected = e.target.value;
                    if (selected === 'custom' || !syntaxColorPresets[selected]) return;
                    const newColors = { ...syntaxColorPresets[selected].colors };
                    Object.assign(el.value, newColors);
                    targetRef[targetKey] = { ...newColors };
                    appContext.setSetting(targetKey, targetRef[targetKey]);
                    if (item.apply) item.apply(targetRef[targetKey]);
                    el._updateDisplay();
                });

                presetGroup.appendChild(presetLabel);
                presetGroup.appendChild(presetSelect);
                toolbarRow.appendChild(presetGroup);

                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'popup-setting-sub-reset-btn';
                resetBtn.textContent = t('settings.syntaxColorOpts.resetColors');
                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Object.assign(el.value, defaultSyntaxColors);
                    targetRef[targetKey] = { ...defaultSyntaxColors };
                    appContext.setSetting(targetKey, targetRef[targetKey]);
                    if (item.apply) item.apply(targetRef[targetKey]);
                    el._updateDisplay();
                });
                toolbarRow.appendChild(resetBtn);
                el.appendChild(toolbarRow);

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;
                    const subLabel = t(item.subLabels?.[subKey] || subKey);
                    const previewText = item.subPreviews?.[subKey] || '';

                    const colorInput = createColorInput(subCurrent, (newColor) => {
                        try {
                            el.value[subKey] = newColor;
                            targetRef[targetKey][subKey] = newColor;
                            appContext.setSetting(targetKey, targetRef[targetKey]);
                            if (item.apply) item.apply(targetRef[targetKey]);
                            presetSelect.value = detectMatchingPreset(targetRef[targetKey]);
                        } catch (e) { }
                    }, previewText);

                    el._subRefs[subKey] = colorInput;

                    const subRow = createRow(subLabel, colorInput);
                    el.appendChild(subRow);
                });

                el._updateDisplay = () => {
                    Object.keys(el._subRefs).forEach(subKey => {
                        const val = targetRef[targetKey]?.[subKey] ?? item.def[subKey];
                        if (el._subRefs[subKey]?.setValue) el._subRefs[subKey].setValue(val);
                    });
                    presetSelect.value = detectMatchingPreset(targetRef[targetKey]);
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

    const oldSyntaxColors = settings.syntaxColors ? { ...settings.syntaxColors } : null;

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
                    if (oldSyntaxColors) {
                        applySyntaxColors(oldSyntaxColors);
                        if (settings) settings.syntaxColors = { ...oldSyntaxColors };
                    }
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
                        } else if (ref.type === 'object' || ref.type === 'color-object') {
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
