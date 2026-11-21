import { getCurrentLang, getLangSetting, setLang, getAvailableLanguages, detectDefaultLanguage, t } from '../i18n.js';
import { eventBus, EVENTS } from './eventBus.js';
import { openExportSelectionModal, openImportSelectionModal } from '../modals/maintenanceModal.js';
import { openResourceManager } from '../modals/resourceManagerModal.js';
import { simpleToast, defaultSyntaxColors, applySyntaxColors } from '../helper.js';

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
    showBackgroundWhenPaused: true,
    enableVideo: true, // 啟用影片背景（如果有的話）
    renderSurroundingAuxiliaryText: true,
    visualZoom: 200, // 視覺模式下的縮放倍率
    gridDivision: 4, // SimaiVisualEditor 的網格切分 (4, 8, 12, 16, 24, 32...)
    visualToolMode: 'edit', // SimaiVisualEditor 工具模式: 'edit' (編輯) 或 'select' (選擇)
    visualLayerMode: 'note', // SimaiVisualEditor 圖層模式: 'note' (音符層) 或 'bpm' (BPM/時值層)
    visualSelectedNoteType: 'tap', // SimaiVisualEditor 選擇的音符類型: 'tap', 'hold', 'slide', 'touch', 'touchhold'
    visualSelectedModifier: 'none', // SimaiVisualEditor 選擇的附加效果: 'none', 'ex', 'break', 'mine', 'firework'
    splitRatio: 0.5, // 左右面板分割比例
    layoutDirection: 'horizontal', // 面板分割方向: 'horizontal' (左右) 或 'vertical' (上下)
    panelSwapped: false, // 面板是否互換位置
    canvasSnapped: false, // Canvas 是否被 snap 隱藏
    slideIllegalRed: false,
    slideArrowHideBySensor: true, // 滑星依感應器消失
    showOutline: true, // 顯示判定線
    showCoverWhenPaused: false, // 暫停時顯示封面圖
    lowRes: false, // 低解析度模式
    majdataWsUrl: 'ws://127.0.0.1:8083/majdata',
    autoConnectMajdataView: false,
    showUI: false,
    showUIHorizontalPosition: 'left',
    showUIVerticalPosition: 'top',
    enableQuickPanel: true,
    richHanabi: true,
    previewAudioVisualMode: 'waveform', // 'off' | 'waveform' | 'spectrogram'
    previewWaveformColor: '#888888',
    previewSpectrogramMinFreq: 20,
    previewSpectrogramMaxFreq: 16000,
    previewSpectrogramBrightness: 0.5,
    previewTagOpacity: 1,
    previewBpmLineOpacity: 1,
    // Sound & Playback
    playHoldEnd: true,
    readyBeat: false,
    playbackSpeed: 1, // 播放速度，1 是正常速度
    seekStepSeconds: 5, // 快捷鍵前後跳轉秒數 (Ctrl+← / Ctrl+→)
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
    smoothScroll: true, // 啟用平滑滾輪 (消除時間軸跳動)
    wheelSensitivity: 1.0, // 滾輪靈敏度倍率 (0.2 ~ 3.0)
    invertWheelDirection: 'none', // 滾輪滑動方向反轉: 'none' (無), 'preview' (僅預覽軌道), 'visualEditor' (僅視覺化編輯器), 'both' (兩者皆反轉)
    syntaxColors: { ...defaultSyntaxColors },
    autoPauseOnScroll: true, // 滾動時自動暫停
    autocomplete: true, // 編輯器自動補齊括號
    enableSyntaxCheck: true, // 啟用語法檢查
    cursorFollow: true, // 游標跟隨
    highlightCurrentNote: true, // 根據進度高亮目前音符
    editorAutoScroll: true, // 播放時編輯器自動捲動
    globalTimeline: true, // 全局時間軸
    timeDisplayCapsule: true, // 懸浮時間膠囊
    timeDisplayCapsulePosition: 'center', // 懸浮時間膠囊位置: 'left' | 'center' | 'right'
    drawHitEffect: true,
    drawHanabiEffect: true,
    richHitEffectBeta: false,
    showBorder: true,
    customKeybindings: {}
};

export const settingsConfig = [
    {
        label: 'settings.tabs.basic',
        items: [
            { type: 'header', label: 'settings.sections.speedAndNotes' },
            { id: 'speed', type: 'number', label: 'settings.items.speed', step: 0.25, min: -1, max: 40, def: defaultSettings.speed },
            { id: 'slideSpeed', type: 'number', label: 'settings.items.slideSpeed', step: 0.1, min: -1, max: 1, def: defaultSettings.slideSpeed },
            { id: 'touchSpeed', type: 'number', label: 'settings.items.touchSpeed', step: 0.25, min: -1, max: 40, def: defaultSettings.touchSpeed },
            {
                id: 'pinkStars',
                type: 'checkbox',
                label: 'settings.items.pinkStars',
                def: defaultSettings.pinkStars || false
            },
            { type: 'header', label: 'settings.sections.language' },
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
            { type: 'header', label: 'settings.sections.appearanceAndNotes' },
            {
                id: 'skin',
                type: 'dropdown',
                label: 'settings.items.skin',
                options: [
                    { value: 'Default', label: 'Standard' },
                    { value: 'Deluxe', label: 'Deluxe' },
                ],
                def: defaultSettings.skin || 'Default',
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
                id: 'showOutline',
                type: 'checkbox',
                label: 'settings.items.showOutline',
                def: defaultSettings.showOutline ?? true,
            },
            {
                id: 'showBorder',
                type: 'checkbox',
                label: 'settings.items.showBorder',
                def: defaultSettings.showBorder ?? true
            },
            { type: 'header', label: 'settings.sections.effectsAndJudge' },
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
                id: 'showJudge', type: 'checkbox', label: 'settings.items.showJudge', def: defaultSettings.showJudge ?? true,
            },
            {
                id: 'showCriticalPerfect', type: 'checkbox', label: 'settings.items.showCriticalPerfect', def: defaultSettings.showCriticalPerfect ?? true,
            },
            {
                id: 'showBreakCriticalPerfect', type: 'checkbox', label: 'settings.items.showBreakCriticalPerfect', def: defaultSettings.showBreakCriticalPerfect ?? true,
            },
            { type: 'header', label: 'settings.sections.backgroundAndSensor' },
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
                id: 'enableVideo',
                type: 'checkbox',
                label: 'settings.items.enableVideo',
                def: defaultSettings.enableVideo ?? true,
            },
            {
                id: 'showBackgroundWhenPaused',
                type: 'checkbox',
                label: 'settings.items.showBackgroundWhenPaused',
                def: defaultSettings.showBackgroundWhenPaused ?? true,
            },
            {
                id: 'showCoverWhenPaused',
                type: 'checkbox',
                label: 'settings.items.showCoverWhenPaused',
                def: defaultSettings.showCoverWhenPaused || false,
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
            { type: 'header', label: 'settings.sections.canvasInfo' },
            { id: 'middleDisplay', type: 'dropdown', label: 'settings.items.middleDisplay', options: [{ value: 0, label: 'settings.middleDisplayOpts.off' }, { value: 1, label: 'settings.middleDisplayOpts.combo' }, { value: 2, label: 'settings.middleDisplayOpts.scorePlus' }, { value: 3, label: 'settings.middleDisplayOpts.scoreMinus' }], def: defaultSettings.middleDisplay },
            {
                id: 'renderSurroundingAuxiliaryText',
                type: 'checkbox',
                label: 'settings.items.renderSurroundingAuxiliaryText',
                def: defaultSettings.renderSurroundingAuxiliaryText ?? true
            },
            { type: 'header', label: 'settings.sections.previewTrack' },
            {
                id: 'previewAudioVisualMode',
                type: 'dropdown',
                label: 'settings.items.previewAudioVisualMode',
                options: [
                    { value: 'waveform', label: 'settings.previewAudioVisualOpts.waveform' },
                    { value: 'spectrogram', label: 'settings.previewAudioVisualOpts.spectrogram' },
                    { value: 'off', label: 'settings.previewAudioVisualOpts.off' },
                ],
                def: defaultSettings.previewAudioVisualMode || 'waveform'
            },
            {
                id: 'previewWaveformColor',
                type: 'color',
                label: 'settings.items.previewWaveformColor',
                def: defaultSettings.previewWaveformColor || '#888888'
            },
            {
                id: 'previewSpectrogramMinFreq',
                type: 'range',
                label: 'settings.items.previewSpectrogramMinFreq',
                min: 0,
                max: 16000,
                step: 50,
                rangeOptions: { suffix: ' Hz' },
                def: defaultSettings.previewSpectrogramMinFreq ?? 20
            },
            {
                id: 'previewSpectrogramMaxFreq',
                type: 'range',
                label: 'settings.items.previewSpectrogramMaxFreq',
                min: 500,
                max: 22050,
                step: 100,
                rangeOptions: { suffix: ' Hz' },
                def: defaultSettings.previewSpectrogramMaxFreq ?? 16000
            },
            {
                id: 'previewSpectrogramBrightness',
                type: 'range',
                label: 'settings.items.previewSpectrogramBrightness',
                min: 0,
                max: 2,
                step: 0.05,
                def: defaultSettings.previewSpectrogramBrightness ?? 1
            },
            {
                id: 'previewTagOpacity',
                type: 'range',
                label: 'settings.items.previewTagOpacity',
                min: 0,
                max: 1,
                step: 0.05,
                def: defaultSettings.previewTagOpacity ?? 1
            },
            {
                id: 'previewBpmLineOpacity',
                type: 'range',
                label: 'settings.items.previewBpmLineOpacity',
                min: 0,
                max: 1,
                step: 0.05,
                def: defaultSettings.previewBpmLineOpacity ?? 1
            },
        ]
    },
    {
        label: 'settings.tabs.sfx',
        items: [
            { type: 'header', label: 'settings.sections.volume' },
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
            { type: 'header', label: 'settings.sections.sfxBehavior' },
            {
                id: 'playHoldEnd',
                type: 'checkbox',
                label: 'settings.items.playHoldEnd',
                def: defaultSettings.playHoldEnd ?? true
            },
            {
                id: 'readyBeat',
                type: 'checkbox',
                label: 'settings.items.readyBeat',
                def: defaultSettings.readyBeat ?? false
            }
        ]
    },
    {
        label: 'settings.tabs.operation',
        items: [
            { type: 'header', label: 'settings.sections.editorAssist' },
            {
                id: 'autocomplete', type: 'checkbox', label: 'settings.items.autocomplete', def: defaultSettings.autocomplete
            },
            {
                id: 'enableSyntaxCheck', type: 'checkbox', label: 'settings.items.enableSyntaxCheck', def: defaultSettings.enableSyntaxCheck ?? true
            },
            {
                id: 'cursorFollow', type: 'checkbox', label: 'settings.items.cursorFollow', def: defaultSettings.cursorFollow ?? true
            },
            {
                id: 'highlightCurrentNote', type: 'checkbox', label: 'settings.items.highlightCurrentNote', def: defaultSettings.highlightCurrentNote ?? true
            },
            {
                id: 'editorAutoScroll', type: 'checkbox', label: 'settings.items.editorAutoScroll', def: defaultSettings.editorAutoScroll ?? true
            },
            {
                id: 'syntaxColors',
                type: 'color-object',
                label: 'settings.items.syntaxColors',
                def: defaultSettings.syntaxColors,
                subLabels: {
                    note: 'settings.syntaxColorOpts.note',
                    comment: 'settings.syntaxColorOpts.comment',
                    bpm: 'settings.syntaxColorOpts.bpm',
                    split: 'settings.syntaxColorOpts.split',
                    time: 'settings.syntaxColorOpts.time',
                    slide: 'settings.syntaxColorOpts.slide',
                    customSlide: 'settings.syntaxColorOpts.customSlide',
                    hold: 'settings.syntaxColorOpts.hold',
                    break: 'settings.syntaxColorOpts.break',
                    ex: 'settings.syntaxColorOpts.ex',
                    mine: 'settings.syntaxColorOpts.mine',
                    hanabi: 'settings.syntaxColorOpts.hanabi',
                    touch: 'settings.syntaxColorOpts.touch',
                    comma: 'settings.syntaxColorOpts.comma',
                },
                subPreviews: {
                    note: '1',
                    comment: '/* 註釋 */',
                    bpm: '(120)',
                    split: '{4}',
                    time: '[1:4]',
                    slide: '-^v',
                    customSlide: '<A1>',
                    hold: 'h',
                    break: 'b',
                    ex: 'x',
                    mine: 'm',
                    hanabi: 'f',
                    touch: 'A1',
                    comma: ',',
                },
                apply: (val) => {
                    applySyntaxColors(val);
                }
            },
            { type: 'header', label: 'settings.sections.timelineAndPanel' },
            {
                id: 'autoPauseOnScroll', type: 'checkbox', label: 'settings.items.autoPauseOnScroll', def: defaultSettings.autoPauseOnScroll
            },
            {
                id: 'globalTimeline', type: 'checkbox', label: 'settings.items.globalTimeline', def: defaultSettings.globalTimeline
            },
            {
                id: 'timeDisplayCapsule', type: 'checkbox', label: 'settings.items.timeDisplayCapsule', def: defaultSettings.timeDisplayCapsule
            },
            {
                id: 'timeDisplayCapsulePosition',
                type: 'dropdown',
                label: 'settings.items.timeDisplayCapsulePosition',
                options: [
                    { value: 'left', label: 'settings.positionOpts.left' },
                    { value: 'center', label: 'settings.positionOpts.center' },
                    { value: 'right', label: 'settings.positionOpts.right' },
                ],
                def: defaultSettings.timeDisplayCapsulePosition || 'center'
            },
            {
                id: 'enableQuickPanel', type: 'checkbox', label: 'settings.items.enableQuickPanel', def: defaultSettings.enableQuickPanel
            },
            {
                id: 'seekStepSeconds',
                type: 'number',
                label: 'settings.items.seekStepSeconds',
                min: 0.5,
                max: 60,
                step: 0.5,
                def: defaultSettings.seekStepSeconds ?? 5
            },
            { type: 'header', label: 'settings.sections.wheelControl' },
            {
                id: 'smoothScroll',
                type: 'checkbox',
                label: 'settings.items.smoothScroll',
                def: defaultSettings.smoothScroll ?? true
            },
            {
                id: 'wheelSensitivity',
                type: 'range',
                label: 'settings.items.wheelSensitivity',
                min: 0.2,
                max: 3.0,
                step: 0.05,
                def: defaultSettings.wheelSensitivity || 1.0
            },
            {
                id: 'invertWheelDirection',
                type: 'dropdown',
                label: 'settings.items.invertWheelDirection',
                options: [
                    { value: 'none', label: 'settings.invertWheelOpts.none' },
                    { value: 'preview', label: 'settings.invertWheelOpts.preview' },
                    { value: 'visualEditor', label: 'settings.invertWheelOpts.visualEditor' },
                    { value: 'both', label: 'settings.invertWheelOpts.both' },
                ],
                def: defaultSettings.invertWheelDirection || 'none'
            },
        ]
    },
    {
        id: 'keybindings',
        label: 'settings.tabs.keybindings',
        items: [
            {
                id: 'customKeybindings',
                type: 'keybindings',
                label: 'settings.items.customKeybindings',
                def: defaultSettings.customKeybindings
            }
        ]
    },
    {
        label: 'settings.tabs.other',
        items: [
            { type: 'header', label: 'settings.sections.performanceAndUi' },
            {
                id: 'showUI', type: 'checkbox', label: 'settings.items.showUI', def: defaultSettings.showUI
            },
            {
                id: 'showUIHorizontalPosition',
                type: 'dropdown',
                label: 'settings.items.showUIHorizontalPosition',
                options: [
                    { value: 'left', label: 'settings.positionOpts.left' },
                    { value: 'right', label: 'settings.positionOpts.right' },
                ],
                def: defaultSettings.showUIHorizontalPosition || 'left'
            },
            {
                id: 'showUIVerticalPosition',
                type: 'dropdown',
                label: 'settings.items.showUIVerticalPosition',
                options: [
                    { value: 'top', label: 'settings.positionOpts.top' },
                    { value: 'bottom', label: 'settings.positionOpts.bottom' },
                ],
                def: defaultSettings.showUIVerticalPosition || 'top'
            },
            {
                id: 'lowRes',
                type: 'checkbox',
                label: 'settings.items.lowRes',
                def: defaultSettings.lowRes || false,
            },
            {
                id: 'maxSlideCount', type: 'number', label: 'settings.items.maxSlideCount', min: 1, max: 100000, step: 1, def: defaultSettings.maxSlideCount
            },
            {
                id: 'inputDebounceTime', type: 'number', label: 'settings.items.inputDebounceTime', min: 0, max: 2000, step: 50, def: defaultSettings.inputDebounceTime
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
            },
            { type: 'header', label: 'settings.sections.externalConnection' },
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
    },
    {
        label: '???',
        secret: true,
        items: [
            {
                id: 'noteBaseSize',
                type: 'number',
                label: 'settings.items.noteBaseSize',
                min: 1, max: 100, step: 1, def: defaultSettings.noteBaseSize || 11
            },
            {
                id: 'middleDistance',
                type: 'number',
                label: 'settings.items.middleDistance',
                min: -1, max: 1, step: 0.01, def: defaultSettings.middleDistance || 0.25
            },
            { id: 'effectDecayTime', type: 'number', label: 'settings.items.effectDecayTime', step: 0.1, def: defaultSettings.effectDecayTime },
            { id: 'hanabiEffectDecayTime', type: 'number', label: 'settings.items.hanabiEffectDecayTime', step: 0.1, def: defaultSettings.hanabiEffectDecayTime },
        ]
    }
];

export const isEasterEggUnlocked = () => {
    try {
        return localStorage.getItem('wmc_easter_egg_unlocked') === 'true';
    } catch {
        return false;
    }
};

export const setEasterEggUnlocked = (unlocked = true) => {
    try {
        localStorage.setItem('wmc_easter_egg_unlocked', unlocked ? 'true' : 'false');
    } catch { }
};