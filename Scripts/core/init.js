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
            try {
                const step = (p, msg) => (popupCtx.setProgress(p), popupCtx.setContent(msg));
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

                // === 專案系統初始化 ===
                step(78, t('popup.init.initProjects'));
                const migratedId = await ctx.migrateFromLegacy();
                if (migratedId) {
                    ctx.setCurrentProjectId(migratedId);
                    localStorage.setItem('simai_lastProjectId', migratedId);
                    console.log(`[Project] 遷移完成，使用專案: ${migratedId}`);
                } else {
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

                // === 載入全域設定 ===
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

                // === 載入當前專案資料 ===
                step(84, t('popup.init.restoringState'));
                await ctx.loadProjectData(step);

                window.settings = settings;
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

                const renderer = new ctx.SimaiRenderer(ctx.canvas, settings);
                renderer.setImages(loadedImages);
                ctx.setRenderer(renderer);

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
                const v1 = ctx.timebaseButton.querySelector('input[name="tb1"]').value;
                const v2 = ctx.timebaseButton.querySelector('input[name="tb2"]').value;
                visualEditorRenderer.setTimebase(v1, v2);
                ctx.setVisualEditorRenderer(visualEditorRenderer);

                const previewRender = new ctx.SimaiPreviewRenderer(ctx.previewCanvas, settings);
                previewRender.setZoom(settings.visualZoom);
                previewRender.setTimebase(v1, v2);
                ctx.setPreviewRender(previewRender);

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
            } catch (e) {
                console.error("初始化失敗:", e);
                popupCtx.setContent(t('popup.init.errorContent', { message: e.message }));
                popupCtx.setButtons([
                    {
                        text: t('popup.init.clearAll'),
                        onClick: async () => {
                            const confirmed = confirm(t('popup.init.confirmClearAll'));
                            if (!confirmed) return;
                            const db = await openDB();
                            const transaction = db.transaction("editorState", "readwrite");
                            const store = transaction.objectStore("editorState");
                            store.clear();
                            try {
                                await transaction.complete;
                                console.log("已清除 IndexedDB 中的所有資料");
                            } catch (err) {
                                console.error("清除 IndexedDB 資料失敗:", err);
                            }
                        }
                    },
                    {
                        text: t('popup.init.clearChartCache'),
                        onClick: async () => {
                            const confirmed = confirm(t('popup.init.confirmClearChart'));
                            if (!confirmed) return;
                            const db = await openDB();
                            const transaction = db.transaction("editorState", "readwrite");
                            const store = transaction.objectStore("editorState");
                            const getKeysRequest = store.getAllKeys();
                            getKeysRequest.onsuccess = () => {
                                const allKeys = getKeysRequest.result;
                                let deleteCount = 0;
                                allKeys.forEach(key => {
                                    if (typeof key === 'string' && (key.startsWith('simai_') || key.startsWith('proj_') || key === '__project_list__')) {
                                        store.delete(key);
                                        deleteCount++;
                                    }
                                });
                                transaction.oncomplete = () => {
                                    console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                                };
                            };
                            transaction.onerror = (err) => {
                                console.error("清除特定資料失敗:", err);
                            };
                        }
                    },
                    {
                        text: t('popup.init.clearAssetCache'),
                        onClick: async () => {
                            const confirmed = confirm(t('popup.init.confirmClearAsset'));
                            if (!confirmed) return;
                            const db = await openDB();
                            const transaction = db.transaction("editorState", "readwrite");
                            const store = transaction.objectStore("editorState");
                            const getKeysRequest = store.getAllKeys();
                            getKeysRequest.onsuccess = () => {
                                const allKeys = getKeysRequest.result;
                                let deleteCount = 0;
                                allKeys.forEach(key => {
                                    if (typeof key === 'string' && (key.startsWith('sfx_cache_') || key.startsWith('img_cache_'))) {
                                        store.delete(key);
                                        deleteCount++;
                                    }
                                });
                                transaction.oncomplete = () => {
                                    console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                                };
                            };
                            transaction.onerror = (err) => {
                                console.error("清除特定資料失敗:", err);
                            };
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
        }
    });
}
