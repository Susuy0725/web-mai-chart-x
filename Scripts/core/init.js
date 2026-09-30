import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';
import { openDB } from '../indexDB.js';

/**
 * 執行編輯器初始化載入流程彈窗
 * @param {Object} ctx
 */
export function runInitModal(ctx) {
    popupWindow({
        title: t('popup.init.title'),
        content: "",
        buttons: [],
        unclosable: true,
        onOpen: async (popupCtx) => {
            const step = (p, msg) => (popupCtx.setProgress(p), popupCtx.setContent(msg));
            try {
                // 1. 載入並解碼靜態素材 (音效與圖片)
                const loadedImages = await loadAssets(ctx, step);

                // 2. 確定並建立當前專案
                await setupCurrentProject(ctx, step);

                // 3. 讀取並自動補齊全域設定
                const settings = await loadAndRestoreSettings(ctx, step);

                // 4. 載入專案譜面資料與設定編輯器 UI
                await setupEditorUIAndData(ctx, settings, step);

                // 5. 初始化三大渲染核心
                initRenderers(ctx, settings, loadedImages);

                // 6. 首繪、調整視窗尺寸與啟動就緒
                await finalizeInit(ctx, settings, popupCtx, step);
            } catch (e) {
                handleInitError(e, popupCtx);
            }
        }
    });
}

// ==========================================
// 私有輔助函數 (各階段職責拆分)
// ==========================================

/**
 * 1. 載入靜態素材 (音效 + 圖片)
 */
async function loadAssets(ctx, step) {
    let sfxPct = 0;
    let imgPct = 0;

    const updateCombinedStep = (msg) => {
        const combinedPct = Math.min(78, Math.round((sfxPct * 0.38) + (imgPct * 0.40)));
        step(combinedPct, msg);
    };

    const [_, loadedImages] = await Promise.all([
        ctx.audioManager.init((pct, key) => {
            sfxPct = pct;
            updateCombinedStep(t('popup.init.loadingSfx', { key, percent: Math.round(pct) }));
        }),
        ctx.loadAllImages((pct, key) => {
            imgPct = pct;
            updateCombinedStep(t('popup.init.loadingAssets', { key, percent: Math.round(pct) }));
        })
    ]);

    ctx.setImages(loadedImages);
    return loadedImages;
}

/**
 * 2. 專案系統初始化與舊版遷移
 */
async function setupCurrentProject(ctx, step) {
    step(78, t('popup.init.initProjects'));

    const migratedId = await ctx.migrateFromLegacy();
    if (migratedId) {
        ctx.setCurrentProjectId(migratedId);
        localStorage.setItem('simai_lastProjectId', migratedId);
        console.log(`[Project] 遷移完成，使用專案: ${migratedId}`);
        return;
    }

    const lastId = localStorage.getItem('simai_lastProjectId');
    const list = await ctx.projectList();
    if (lastId && list.some(p => p.id === lastId)) {
        ctx.setCurrentProjectId(lastId);
    } else if (list.length > 0) {
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        ctx.setCurrentProjectId(list[0].id);
    } else {
        const newId = await ctx.projectCreate(t('popup.projectManager.untitled'));
        ctx.setCurrentProjectId(newId);
    }
    localStorage.setItem('simai_lastProjectId', ctx.getCurrentProjectId());
}

/**
 * 3. 載入並補齊全域設定
 */
async function loadAndRestoreSettings(ctx, step) {
    step(80, t('popup.init.restoringSettings'));

    const savedSettings = await ctx.idbGet('simai_settings');
    let settings;

    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        let isMissingSettings = false;

        for (const key in ctx.defaultSettings) {
            if (!(key in settings)) {
                settings[key] = ctx.defaultSettings[key];
                console.warn(`設定項 "${key}" 在已儲存的設定中缺失，已自動補齊預設值。`);
                isMissingSettings = true;
            }
        }

        if (isMissingSettings) {
            await ctx.idbSet('simai_settings', JSON.stringify(settings));
        }

        if (ctx.playbackSpeedInput) {
            ctx.playbackSpeedInput.value = settings.playbackSpeed;
        }
    } else {
        settings = { ...ctx.defaultSettings };
        await ctx.idbSet('simai_settings', JSON.stringify(settings));
    }

    ctx.setSettings(settings);
    ctx.applyAudioSettings(settings);
    window.settings = settings;

    return settings;
}

/**
 * 4. 載入專案資料與同步 UI 狀態
 */
async function setupEditorUIAndData(ctx, settings, step) {
    step(84, t('popup.init.restoringState'));
    await ctx.loadProjectData(step);

    if (settings.autoConnectMajdataView) {
        ctx.majdataWs.connect(settings.majdataWsUrl || 'ws://127.0.0.1:8083/majdata');
    }

    ctx.applySplitRatio(settings.splitRatio ?? 0.5);

    if (settings.canvasSnapped) {
        ctx.snapHideCanvas();
    }

    ctx.setSwitchBoxDisplayModeUI(settings.displayMode ?? 'simai');

    if (ctx.visualToolModeSelect) {
        ctx.visualToolModeSelect.value = settings.visualToolMode ?? 'edit';
    }

    ctx.setGridDivisionUI(settings.gridDivision ?? 4);
    ctx.updateGridDivisionVisibility();
}

/**
 * 5. 初始化各渲染器實例 (主畫布、視覺軌道編輯器、迷你預覽)
 */
function initRenderers(ctx, settings, loadedImages) {
    // 主遊戲畫面渲染器
    const renderer = new ctx.SimaiRenderer(ctx.canvas, settings);
    renderer.setImages(loadedImages);
    ctx.setRenderer(renderer);

    // 視覺軌道編輯器渲染器
    const visualEditorRenderer = new ctx.SimaiVisualEditor(ctx.visualEditor, settings);
    visualEditorRenderer.setEditMode(settings.visualToolMode ?? 'edit');
    visualEditorRenderer.setImages(loadedImages);
    visualEditorRenderer.setContext(ctx.visualCtx || ctx.visualEditor.getContext('2d'));
    visualEditorRenderer.setZoom(settings.visualZoom);
    visualEditorRenderer.setNoteEditCallbacks(
        ctx.visualPlaceNote,
        ctx.visualDeleteNote,
        ctx.visualChangeNote,
        ctx.visualPlaceHoldNote
    );
    visualEditorRenderer.setTimeQuantizer(ctx.quantizeTime);

    // 安全讀取拍號輸入值
    const v1 = ctx.timebaseButton?.querySelector('input[name="tb1"]')?.value ?? 4;
    const v2 = ctx.timebaseButton?.querySelector('input[name="tb2"]')?.value ?? 4;
    visualEditorRenderer.setTimebase(v1, v2);
    ctx.setVisualEditorRenderer(visualEditorRenderer);

    // 軌道迷你縮圖預覽渲染器
    const previewRender = new ctx.SimaiPreviewRenderer(ctx.previewCanvas, settings);
    previewRender.setZoom(settings.visualZoom);
    previewRender.setTimebase(v1, v2);
    ctx.setPreviewRender(previewRender);
}

/**
 * 6. 首繪、調整介面尺寸與啟動就緒
 */
async function finalizeInit(ctx, settings, popupCtx, step) {
    ctx.setPlaybackSpeed(settings.playbackSpeed);

    if (ctx.canvasOutline) {
        ctx.canvasOutline.style.display = settings.hideOutline ? 'none' : '';
    }

    ctx.applyMovieBrightness(settings.moviebrightness);
    ctx.draw();
    ctx.updateSlider(ctx.getRealTime());
    ctx.setEditorCss(!await ctx.projGet('hide_editor'));

    step(100, t('popup.init.rendering'));
    ctx.resize();
    popupCtx.close();
    ctx.setIsInitComplete(true);
    ctx.updateDiscordRPC(ctx.getMaidata(), ctx.getNowDifficulty());
    if (typeof ctx.onInitFinished === 'function') {
        try {
            ctx.onInitFinished();
        } catch (e) {
            console.error('[init] onInitFinished 執行失敗:', e);
        }
    }
}

/**
 * 7. 初始化例外救援處理
 */
function handleInitError(e, popupCtx) {
    console.error("初始化失敗:", e);
    popupCtx.setContent(t('popup.init.errorContent', { message: e.message }));
    popupCtx.setButtons([
        {
            text: t('popup.init.clearAll'),
            onClick: async () => {
                if (!confirm(t('popup.init.confirmClearAll'))) return;
                try {
                    await clearIndexedDBStore();
                    console.log("已清除 IndexedDB 中的所有資料");
                } catch (err) {
                    console.error("清除 IndexedDB 資料失敗:", err);
                }
            }
        },
        {
            text: t('popup.init.clearChartCache'),
            onClick: async () => {
                if (!confirm(t('popup.init.confirmClearChart'))) return;
                try {
                    const count = await clearIndexedDBStore((key) =>
                        typeof key === 'string' && (key.startsWith('simai_') || key.startsWith('proj_') || key === '__project_list__')
                    );
                    console.log(`[IDB] 已成功清理 ${count} 項譜面資料`);
                } catch (err) {
                    console.error("清除特定資料失敗:", err);
                }
            }
        },
        {
            text: t('popup.init.clearAssetCache'),
            onClick: async () => {
                if (!confirm(t('popup.init.confirmClearAsset'))) return;
                try {
                    const count = await clearIndexedDBStore((key) =>
                        typeof key === 'string' && (key.startsWith('sfx_cache_') || key.startsWith('img_cache_'))
                    );
                    console.log(`[IDB] 已成功清理 ${count} 項素材快取資料`);
                } catch (err) {
                    console.error("清除特定資料失敗:", err);
                }
            }
        },
        {
            text: t('popup.close'),
            onClick: () => {
                popupWindow({
                    title: t('popup.init.warnTitle'),
                    content: t('popup.init.warnContent'),
                    buttons: [
                        { text: t('popup.init.continue'), onClick: () => { popupCtx.close(); }, hideOnClick: true },
                        { text: t('popup.cancel'), hideOnClick: true }
                    ]
                });
            }
        }
    ]);
}

/**
 * 輔助函數：清理 IndexedDB editorState 中的特定資料或全部資料
 * @param {Function} [filterFn] - 過濾鍵值的函式，未傳入則 clear 全部
 * @returns {Promise<number>} 刪除的筆數
 */
async function clearIndexedDBStore(filterFn) {
    const db = await openDB();
    const transaction = db.transaction("editorState", "readwrite");
    const store = transaction.objectStore("editorState");

    let deleteCount = 0;

    if (!filterFn) {
        store.clear();
    } else {
        const keys = await new Promise((resolve, reject) => {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        for (const key of keys) {
            if (filterFn(key)) {
                store.delete(key);
                deleteCount++;
            }
        }
    }

    await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (err) => reject(err);
    });

    return deleteCount;
}
