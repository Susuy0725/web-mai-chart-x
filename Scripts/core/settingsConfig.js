import { getCurrentLang, getLangSetting, setLang, getAvailableLanguages, detectDefaultLanguage, t } from '../i18n.js';
import { eventBus, EVENTS } from './eventBus.js';
import { openExportSelectionModal, openImportSelectionModal } from '../modals/maintenanceModal.js';
import { openResourceManager } from '../modals/resourceManagerModal.js';
import { simpleToast } from '../helper.js';

export const defaultSettings = {
    // Game
    speed: 6.5,
    touchSpeed: 7,
    slideSpeed: 0,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數(101%+), 3: 分數(101%-)
    moviebrightness: -3,
    skin: 'Default',
    showSensor: true,
    rotateStars: true,
    pinkStars: false,
    showJudge: true, // 顯示判定
    showCriticalPerfect: true, // 顯示 critical perfect
    showBreakCriticalPerfect: true, // 顯示 break critical perfect
    // Misc
    displayMode: 'simai', // simai 或 visual
    middleDistance: 0.25,
    effectDecayTime: 0.4,
    hanabiEffectDecayTime: 1.1,
    noteBaseSize: 11,
    maxSlideCount: 500, // on screen,
    inputDebounceTime: 800, // ms
    showSensorTextWhenPaused: true,
    hideBackgroundWhenPaused: false,
    disableVideo: false, // 關閉影片背景（如果有的話）
    renderSurroundingAuxiliaryText: true,
    visualZoom: 200, // 視覺模式下的縮放倍率
    gridDivision: 4, // SimaiVisualEditor 的網格切分 (4, 8, 12, 16, 24, 32...)
    visualToolMode: 'edit', // SimaiVisualEditor 工具模式: 'edit' (編輯) 或 'select' (選擇)
    visualLayerMode: 'note', // SimaiVisualEditor 圖層模式: 'note' (音符層) 或 'bpm' (BPM/時值層)
    visualSelectedNoteType: 'tap', // SimaiVisualEditor 選擇的音符類型: 'tap', 'hold', 'slide', 'touch', 'touchhold'
    visualSelectedModifier: 'none', // SimaiVisualEditor 選擇的附加效果: 'none', 'ex', 'break', 'mine', 'firework'
    splitRatio: 0.5, // 左右面板分割比例
    canvasSnapped: false, // Canvas 是否被 snap 隱藏
    slideIllegalRed: false,
    slideArrowHideBySensor: true, // 滑星依感應器消失
    hideOutline: false, // 隱藏判定圈
    showCoverWhenPaused: false, // 暫停時顯示封面圖
    lowRes: false, // 低解析度模式
    majdataWsUrl: 'ws://127.0.0.1:8083/majdata',
    autoConnectMajdataView: false,
    showUI: false,
    enableQuickPanel: true,
    richHanabi: true,
    disablePreviewWaveform: false,
    // Sound & Playback
    notPlayHoldEnd: false,
    playbackSpeed: 1, // 播放速度，1 是正常速度
    globalVolume: 0.65, // 全局音量，0 到 1 之間
    musicVolume: 0.8, // 音樂音量，0 到 1 之間
    SfxVolume: 1, // 音效音量，0 到 1 之間
    sfxVolumes: {
        'clock': 0.8,
        'answer': 1,
        'judge': 0.4,
        'judge_ex': 0.4,
        'judge_break': 0.4,
        'judge_break_slide': 0.4,
        'break': 0.4,
        'slide': 0.4,
        'break_slide_start': 0.4,
        'touch': 0.4,
        'touchHold_riser': 0.6,
        'hanabi': 0.6,
    },
    autoPauseOnScroll: true, // 滾動時自動暫停
    autocomplete: true, // 編輯器自動補齊括號
    disableSyntaxCheck: false, // 禁用語法檢查
    cursorFollow: true, // 游標跟隨
    globalTimeline: true, // 全局時間軸
    drawHitEffect: true,
    drawHanabiEffect: true,
    noBorder: false
};

export const settingsConfig = [
    {
        label: 'settings.tabs.basic',
        items: [
            { id: 'speed', type: 'number', label: 'settings.items.speed', step: 0.25, min: 1, max: 20, def: defaultSettings.speed },
            { id: 'slideSpeed', type: 'number', label: 'settings.items.slideSpeed', step: 0.1, min: -1, max: 1, def: defaultSettings.slideSpeed },
            { id: 'touchSpeed', type: 'number', label: 'settings.items.touchSpeed', step: 0.25, min: 1, max: 20, def: defaultSettings.touchSpeed },
            { id: 'middleDisplay', type: 'dropdown', label: 'settings.items.middleDisplay', options: [{ value: 0, label: 'settings.middleDisplayOpts.off' }, { value: 1, label: 'settings.middleDisplayOpts.combo' }, { value: 2, label: 'settings.middleDisplayOpts.scorePlus' }, { value: 3, label: 'settings.middleDisplayOpts.scoreMinus' }], def: defaultSettings.middleDisplay },
            {
                id: 'moviebrightness',
                type: 'dropdown',
                label: 'settings.items.moviebrightness',
                options: [
                    { value: '0', label: 'settings.items.bright' },
                    { value: '-1', label: 'settings.items.normal' },
                    { value: '-2', label: 'settings.items.dark' },
                    { value: '-3', label: 'settings.items.veryDark' },
                ],
                def: defaultSettings.moviebrightness ?? -3,
                apply: (val) => {
                    const fn = window.applyMovieBrightness;
                    if (fn) fn(val);
                }
            },
            {
                id: 'pinkStars',
                type: 'checkbox',
                label: 'settings.items.pinkStars',
                def: defaultSettings.pinkStars || false
            },
            {
                id: 'lang',
                type: 'dropdown',
                label: 'settings.items.lang',
                get options() {
                    const detectedCode = detectDefaultLanguage();
                    const autoLabel = t('settings.items.langAuto', {}, detectedCode);

                    return [
                        { value: 'auto', label: autoLabel },
                        ...getAvailableLanguages().map(l => ({ value: l.code, label: l.name }))
                    ];
                },
                def: 'auto',
                get: () => getLangSetting(),
                apply: (val) => {
                    setLang(val);
                }
            },
        ]
    },
    {
        label: 'settings.tabs.display',
        items: [
            {
                id: 'skin',
                type: 'dropdown',
                label: 'settings.items.skin',
                options: [
                    { value: 'Default', label: 'Default' },
                    { value: 'Deluxe', label: 'Deluxe' },
                ],
                def: defaultSettings.skin || 'Default',
            },
            {
                id: 'showSensor',
                type: 'checkbox',
                label: 'settings.items.showSensor',
                def: defaultSettings.showSensor
            },
            {
                id: 'showSensorTextWhenPaused',
                type: 'checkbox',
                label: 'settings.items.showSensorTextWhenPaused',
                def: defaultSettings.showSensorTextWhenPaused
            },
            {
                id: 'hideBackgroundWhenPaused',
                type: 'checkbox',
                label: 'settings.items.hideBackgroundWhenPaused',
                def: defaultSettings.hideBackgroundWhenPaused,
            },
            {
                id: 'disableVideo',
                type: 'checkbox',
                label: 'settings.items.disableVideo',
                def: defaultSettings.disableVideo || false,
            },
            {
                id: 'rotateStars',
                type: 'checkbox',
                label: 'settings.items.rotateStars',
                def: defaultSettings.rotateStars || false
            },
            {
                id: 'slideArrowHideBySensor',
                type: 'checkbox',
                label: 'settings.items.slideArrowHideBySensor',
                def: defaultSettings.slideArrowHideBySensor ?? true
            },
            {
                id: 'hideOutline',
                type: 'checkbox',
                label: 'settings.items.hideOutline',
                def: defaultSettings.hideOutline || false,
            },
            {
                id: 'showCoverWhenPaused',
                type: 'checkbox',
                label: 'settings.items.showCoverWhenPaused',
                def: defaultSettings.showCoverWhenPaused || false,
            },
            {
                id: 'drawHitEffect',
                type: 'checkbox',
                label: 'settings.items.drawHitEffect',
                def: defaultSettings.drawHitEffect || false
            },
            {
                id: 'drawHanabiEffect',
                type: 'checkbox',
                label: 'settings.items.drawHanabiEffect',
                def: defaultSettings.drawHanabiEffect || false
            },
            {
                id: 'richHanabi',
                type: 'checkbox',
                label: 'settings.items.richHanabi',
                def: defaultSettings.richHanabi || true
            },
            {
                id: 'disablePreviewWaveform',
                type: 'checkbox',
                label: 'settings.items.disablePreviewWaveform',
                def: defaultSettings.disablePreviewWaveform || false
            },
            {
                id: 'showJudge', type: 'checkbox', label: 'settings.items.showJudge', def: defaultSettings.showJudge ?? true,
            },
            {
                id: 'showCriticalPerfect', type: 'checkbox', label: 'settings.items.showCriticalPerfect', def: defaultSettings.showCriticalPerfect ?? true,
            },
            {
                id: 'showBreakCriticalPerfect', type: 'checkbox', label: 'settings.items.showBreakCriticalPerfect', def: defaultSettings.showBreakCriticalPerfect ?? true,
            },
            {
                id: 'lowRes',
                type: 'checkbox',
                label: 'settings.items.lowRes',
                def: defaultSettings.lowRes || false,
            }, {
                id: 'noBorder',
                type: 'checkbox',
                label: 'settings.items.noBorder',
                def: defaultSettings.noBorder || false
            },
            {
                id: 'resetPanelRatio',
                type: 'button',
                label: 'settings.items.resetPanelRatio',
                btnText: 'popup.reset',
                onClick: () => {
                    eventBus.emit(EVENTS.LAYOUT_RESET);
                    simpleToast({ content: t('toast.panelRatioReset'), type: 'info', timeout: 1500 });
                }
            }
        ]
    },
    {
        label: 'settings.tabs.sfx',
        items: [
            {
                id: 'globalVolume', type: 'range', label: 'settings.items.globalVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.globalVolume,
            },
            {
                id: 'musicVolume', type: 'range', label: 'settings.items.musicVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.musicVolume,
            },
            {
                id: 'SfxVolume', type: 'range', label: 'settings.items.SfxVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.SfxVolume,
            },
            {
                id: 'sfxVolumes', type: 'object', label: 'settings.items.sfxVolumes', def: defaultSettings.sfxVolumes,
            },
            {
                id: 'notPlayHoldEnd',
                type: 'checkbox',
                label: 'settings.items.notPlayHoldEnd',
                def: defaultSettings.notPlayHoldEnd
            }
        ]
    },
    {
        label: 'settings.tabs.other',
        items: [
            {
                id: 'autocomplete', type: 'checkbox', label: 'settings.items.autocomplete', def: defaultSettings.autocomplete
            },
            {
                id: 'disableSyntaxCheck', type: 'checkbox', label: 'settings.items.disableSyntaxCheck', def: defaultSettings.disableSyntaxCheck || false
            },
            {
                id: 'maxSlideCount', type: 'number', label: 'settings.items.maxSlideCount', min: 1, max: 100000, step: 1, def: defaultSettings.maxSlideCount
            },
            {
                id: 'inputDebounceTime', type: 'number', label: 'settings.items.inputDebounceTime', min: 0, max: 2000, step: 50, def: defaultSettings.inputDebounceTime
            },
            {
                id: 'showUI', type: 'checkbox', label: 'settings.items.showUI', def: defaultSettings.showUI
            },
            {
                id: 'autoPauseOnScroll', type: 'checkbox', label: 'settings.items.autoPauseOnScroll', def: defaultSettings.autoPauseOnScroll
            },
            {
                id: 'globalTimeline', type: 'checkbox', label: 'settings.items.globalTimeline', def: defaultSettings.globalTimeline
            },
            {
                id: 'enableQuickPanel', type: 'checkbox', label: 'settings.items.enableQuickPanel', def: defaultSettings.enableQuickPanel
            },
            {
                id: 'majdataWsUrl',
                type: 'text',
                label: 'settings.items.majdataWsUrl',
                def: defaultSettings.majdataWsUrl || 'ws://127.0.0.1:8083/majdata'
            },
            {
                id: 'autoConnectMajdataView',
                type: 'checkbox',
                label: 'settings.items.autoConnectMajdataView',
                def: defaultSettings.autoConnectMajdataView || false
            },
        ]
    },
    {
        label: 'settings.tabs.maintenance',
        items: [
            {
                id: 'manageResources',
                type: 'button',
                label: 'settings.items.manageResources',
                btnText: 'settings.items.manageResourcesBtn',
                onClick: () => {
                    openResourceManager();
                }
            },
            {
                id: 'exportAllData',
                type: 'button',
                label: 'settings.items.exportAllData',
                btnText: 'settings.items.exportAllDataBtn',
                onClick: () => {
                    openExportSelectionModal();
                }
            },
            {
                id: 'importAllData',
                type: 'button',
                label: 'settings.items.importAllData',
                btnText: 'settings.items.importAllDataBtn',
                onClick: () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.zip,application/zip';
                    input.onchange = (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            openImportSelectionModal(file);
                        }
                    };
                    input.click();
                }
            }
        ]
    }
];