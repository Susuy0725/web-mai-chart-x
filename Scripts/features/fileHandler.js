import { ensureJSZip, popupWindow, simpleToast, getSimaiDataString, parseMaidata } from '../helper.js';
import { t } from '../i18n.js';
import { projectCreate, projectUpdateName, projectTouch, idbGetProject, idbSetProject } from '../indexDB.js';

function getFileExt(fileOrName, fallbackExt) {
    const raw = typeof fileOrName === 'string' ? fileOrName.split('?')[0] : fileOrName?.name;
    const dotIdx = raw ? raw.lastIndexOf('.') : -1;
    return dotIdx > 0 && dotIdx < raw.length - 1 ? raw.slice(dotIdx + 1) : fallbackExt;
}

function triggerBlobDownload(blob, downloadName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function resolveBgmAsset(audioManager) {
    if (!audioManager || !audioManager.haveBGM()) return null;
    const bgm = audioManager.bgmFile;
    const ext = getFileExt(bgm, 'mp3');
    if (bgm instanceof Blob) {
        return { blob: bgm, ext };
    }
    if (typeof bgm === 'string') {
        const resp = await fetch(bgm);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return { blob: await resp.blob(), ext };
    }
    return null;
}

/**
 * 處理資料夾/多檔案或 Zip 解壓後的檔案清單
 * @param {FileList|Array|Object} files 
 * @param {Object} ctx 
 */
export async function handleFolderInput(files, ctx) {
    const {
        audioManager,
        maidataProcess,
        resize,
        setBackgroundVideo,
        setBackgroundImage,
        editorBackgroundVideo,
        editorBackgroundImage,
        setEndtime,
        getEndTime,
        applyMovieBrightness
    } = ctx;
    const settings = typeof ctx.getSettings === 'function' ? ctx.getSettings() : ctx.settings;
    const projSet = typeof ctx.projSet === 'function' ? ctx.projSet : () => Promise.resolve();

    const entries = [];
    if (files && typeof files.length === 'number' && typeof files.item === 'function') {
        for (let i = 0; i < files.length; i++) {
            const f = files.item(i);
            if (f) entries.push(f);
        }
    } else if (Array.isArray(files)) {
        for (let i = 0; i < files.length; i++) if (files[i]) entries.push(files[i]);
    } else if (files && typeof files === 'object') {
        for (const name in files) {
            if (!Object.prototype.hasOwnProperty.call(files, name)) continue;
            const zf = files[name];
            if (zf.dir) continue;
            if (typeof zf.async === 'function') {
                try {
                    const blob = await zf.async('blob');
                    const baseName = name.replace(/\\/g, '/').split('/').pop();
                    entries.push(new File([blob], baseName, { type: blob.type || '' }));
                } catch (e) {
                    console.warn('從 zip 讀取檔案失敗', name, e);
                }
            }
        }
    } else {
        console.warn('handleFolderInput：未知的 files 參數型別', files);
        return;
    }

    for (let i = 0; i < entries.length; i++) {
        const file = entries[i];
        const baseName = (file.name || '').replace(/.*[\\/]/, '');
        const lowerName = baseName.toLowerCase();
        const ext = (baseName.split('.').pop() || '').toLowerCase();

        const isVideo = ((file.type || '').startsWith('video/')) || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv', 'ogg'].includes(ext);
        const isImage = ((file.type || '').startsWith('image/')) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff'].includes(ext);

        if (lowerName.startsWith('track.')) {
            const url = URL.createObjectURL(file);
            await audioManager.setBackgroundMusic(url, file);
            setEndtime(getEndTime());
            projSet('resource_bgm', file).then(() => {
                console.log('已儲存音樂檔到 IndexedDB');
            }).catch((error) => {
                console.error('儲存音樂檔到 IndexedDB 失敗:', error);
            });
        }
        if (lowerName.startsWith('maidata.')) {
            await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        maidataProcess(e.target.result);
                        resize();
                    } catch (err) {
                        console.error('解析 maidata 失敗:', err);
                    }
                    resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsText(file);
            });
        }
        if (lowerName.startsWith('bg.')) {
            if (isVideo) {
                console.log('載入背景影片:', file.name);
                setBackgroundVideo(file);
                if (editorBackgroundVideo) {
                    editorBackgroundVideo.src = URL.createObjectURL(file);
                    editorBackgroundVideo.style.display = 'none';
                }
                projSet('background_video', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }
            if (isImage) {
                setBackgroundImage(file);
                if (editorBackgroundImage) {
                    editorBackgroundImage.src = URL.createObjectURL(file);
                    editorBackgroundImage.style.display = 'block';
                }
                projSet('background_image', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }
            console.warn('選擇的背景檔案不是圖片類型：', file.name);
        }
        if (lowerName.startsWith('pv.')) {
            if (isVideo) {
                console.log('載入背景影片:', file.name);
                setBackgroundVideo(file);
                if (editorBackgroundVideo) {
                    editorBackgroundVideo.src = URL.createObjectURL(file);
                    editorBackgroundVideo.style.display = 'none';
                }
                projSet('background_video', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }
            console.warn('選擇的背景影片檔案不是影片類型：', file.name);
        }
    }
    applyMovieBrightness(settings.moviebrightness);
}

/**
 * 檢查當前是否已有譜面內容或音樂
 * @param {Object} ctx
 * @returns {boolean}
 */
export function checkMaidataContext(ctx) {
    if (ctx?.audioManager?.haveBGM && ctx.audioManager.haveBGM()) return true;
    const maidata = typeof ctx?.getMaidata === 'function' ? ctx.getMaidata() : null;
    if (maidata) {
        for (let i = 1; i <= 7; i++) {
            if (maidata[`inote_${i}`] && maidata[`inote_${i}`].trim() !== "") {
                return true;
            }
        }
    }
    return false;
}

/**
 * 觸發匯入資料夾流程（支援覆蓋既有或建立新專案）
 * @param {Object} ctx
 * @param {Object} [options]
 * @param {Function} [options.onComplete]
 */
export function triggerImportFolder(ctx, { onComplete } = {}) {
    const {
        setCurrentProjectId,
        getCurrentProjectId,
        setDataEmpty,
        getEndTime,
        setEndtime,
        draw,
        getMaidata
    } = ctx;

    const executeImport = (mode) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.setAttribute('directory', '');
        input.multiple = true;
        input.onchange = async (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) {
                console.warn("未選擇任何檔案");
                return;
            }

            if (mode === 'new') {
                const newId = await projectCreate(t('popup.projectManager.untitled'));
                setCurrentProjectId(newId);
                localStorage.setItem('simai_lastProjectId', newId);
                console.log(`[Project] 已建立新專案: ${newId}`);
            }

            setDataEmpty();
            await handleFolderInput(files, ctx);
            setEndtime(getEndTime());
            draw();

            const maidata = getMaidata();
            const curId = getCurrentProjectId();
            let folderName = '';
            if (files[0]?.webkitRelativePath) {
                folderName = files[0].webkitRelativePath.split('/')[0] || '';
            }
            const targetTitle = (maidata?.title && maidata.title.trim()) || folderName.trim() || t('popup.projectManager.untitled');
            if (curId) {
                await projectUpdateName(curId, targetTitle).catch(() => { });
            }
            simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
            if (typeof onComplete === 'function') {
                onComplete();
            }
        };
        input.click();
    };

    if (checkMaidataContext(ctx)) {
        popupWindow({
            title: t('popup.loadConfirm.titleFolder'),
            content: t('popup.loadConfirm.content'),
            buttons: [
                {
                    text: t('popup.loadConfirm.overwrite'),
                    onClick: (pCtx) => {
                        pCtx.close();
                        executeImport('overwrite');
                    }
                },
                {
                    text: t('popup.loadConfirm.newProject'),
                    onClick: (pCtx) => {
                        pCtx.close();
                        executeImport('new');
                    }
                },
                { text: t('popup.cancel'), hideOnClick: true }
            ]
        });
    } else {
        executeImport('overwrite');
    }
}

/**
 * 觸發匯入壓縮檔流程（支援覆蓋既有或建立新專案）
 * @param {Object} ctx
 * @param {Object} [options]
 * @param {Function} [options.onComplete]
 */
export function triggerImportZip(ctx, { onComplete } = {}) {
    const {
        setCurrentProjectId,
        getCurrentProjectId,
        setDataEmpty,
        getEndTime,
        setEndtime,
        draw,
        resize,
        getMaidata
    } = ctx;

    const executeImport = (mode) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await ensureJSZip();
                const reader = new FileReader();
                reader.onload = async (re) => {
                    if (mode === 'new') {
                        const newId = await projectCreate(t('popup.projectManager.untitled'));
                        setCurrentProjectId(newId);
                        localStorage.setItem('simai_lastProjectId', newId);
                        console.log(`[Project] 已建立新專案: ${newId}`);
                    }
                    setDataEmpty();
                    window.JSZip.loadAsync(file).then(async (zip) => {
                        await handleFolderInput(zip.files, ctx);
                        setEndtime(getEndTime());
                        draw();
                        const maidata = getMaidata();
                        const curId = getCurrentProjectId();
                        const zipName = file.name ? file.name.replace(/\.(wmcx\.)?zip$/i, '').trim() : '';
                        const targetTitle = (maidata?.title && maidata.title.trim()) || zipName || t('popup.projectManager.untitled');
                        if (curId) {
                            await projectUpdateName(curId, targetTitle).catch(() => { });
                        }
                        simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
                        if (typeof onComplete === 'function') {
                            onComplete();
                        }
                    });
                    resize();
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    };

    if (checkMaidataContext(ctx)) {
        popupWindow({
            title: t('popup.loadConfirm.titleZip'),
            content: t('popup.loadConfirm.content'),
            buttons: [
                {
                    text: t('popup.loadConfirm.overwrite'),
                    onClick: (pCtx) => {
                        pCtx.close();
                        executeImport('overwrite');
                    }
                },
                {
                    text: t('popup.loadConfirm.newProject'),
                    onClick: (pCtx) => {
                        pCtx.close();
                        executeImport('new');
                    }
                },
                { text: t('popup.cancel'), hideOnClick: true }
            ]
        });
    } else {
        executeImport('overwrite');
    }
}

/**
 * 初始化所有檔案操作按鈕監聽器
 */
export function initFileHandlers(ctx) {
    const {
        folderInput,
        readMaidataButton,
        readZipButton,
        addMusicButton,
        addVideoButton,
        importFromVideoButton,
        downloadButton,
        audioManager,
        getMaidata,
        maidataProcess,
        setDataEmpty,
        draw,
        resize,
        setEndtime,
        getEndTime,
        getCurrentProjectId,
        setCurrentProjectId,
        getBackgroundImage,
        setBackgroundImage,
        editorBackgroundImage,
        getBackgroundVideo,
        setBackgroundVideo,
        editorBackgroundVideo,
        settings,
        applyMovieBrightness
    } = ctx;
    const projSet = typeof ctx.projSet === 'function' ? ctx.projSet : () => Promise.resolve();

    if (folderInput) {
        folderInput.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerImportFolder(ctx);
        });
    }

    if (readMaidataButton) {
        readMaidataButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        setDataEmpty();
                        maidataProcess(re.target.result);
                        resize();
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        });
    }

    if (readZipButton) {
        readZipButton.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerImportZip(ctx);
        });
    }

    if (addMusicButton) {
        addMusicButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mp3,.wav,.ogg';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    await audioManager.setBackgroundMusic(url, file);
                    setEndtime(getEndTime());
                    projSet('resource_bgm', file);
                }
            };
            input.click();
        });
    }

    if (addVideoButton) {
        addVideoButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    setBackgroundVideo(file);
                    if (editorBackgroundVideo) {
                        editorBackgroundVideo.src = URL.createObjectURL(file);
                        editorBackgroundVideo.style.display = 'none';
                    }
                    projSet('background_video', file).then(() => {
                        simpleToast({ content: '已儲存背景影片', type: 'success' });
                    }).catch((error) => {
                        console.error('儲存背景影片失敗:', error);
                    });
                    applyMovieBrightness(settings.moviebrightness);
                }
            };
            input.click();
        });
    }

    if (importFromVideoButton) {
        importFromVideoButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    setBackgroundVideo(file);
                    if (editorBackgroundVideo) {
                        editorBackgroundVideo.src = URL.createObjectURL(file);
                        editorBackgroundVideo.style.display = 'none';
                    }
                    await projSet('background_video', file);

                    const url = URL.createObjectURL(file);
                    await audioManager.setBackgroundMusic(url, file);
                    setEndtime(getEndTime());
                    await projSet('resource_bgm', file);
                    applyMovieBrightness(settings.moviebrightness);

                    simpleToast({ content: t('toast.videoImportSuccess'), type: 'success' });
                }
            };
            input.click();
        });
    }

    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            const getBaseName = (file) => {
                if (!file || !file.name) return null;
                return file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            };

            const maidata = getMaidata();
            const defaultName = (maidata && maidata.title)
                || getBaseName(audioManager.bgmFile)
                || 'simai_package';

            const container = document.createElement('div');

            const customNameRow = document.createElement('label');
            customNameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;font-size:12.5px;color:var(--popup-text-sub, #ccc);cursor:pointer;user-select:none;';
            const customNameText = document.createElement('span');
            customNameText.textContent = t('popup.download.customFileName');
            const customNameCheckbox = document.createElement('input');
            customNameCheckbox.type = 'checkbox';
            customNameCheckbox.name = 'customFileName';
            customNameCheckbox.className = 'popup-setting-checkbox';
            customNameCheckbox.checked = false;
            customNameRow.append(customNameText, customNameCheckbox);
            container.appendChild(customNameRow);

            const nameFieldWrap = document.createElement('div');
            nameFieldWrap.className = 'download-custom-name-field';
            nameFieldWrap.style.display = 'none';

            const textEl = document.createElement('label');
            textEl.textContent = t('popup.download.fileName');
            textEl.style.cssText = "display:block;margin-bottom:5px;font-size:12px;color: lightgray;";
            nameFieldWrap.appendChild(textEl);
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'popup-setting-input';
            nameInput.placeholder = t('popup.download.placeholder');
            nameInput.value = defaultName;
            nameInput.style.cssText = "width:100%;max-width:100%;height:34px;margin-bottom:12px;";
            nameFieldWrap.appendChild(nameInput);
            container.appendChild(nameFieldWrap);

            customNameCheckbox.addEventListener('change', () => {
                const enabled = customNameCheckbox.checked;
                nameFieldWrap.style.display = enabled ? 'block' : 'none';
                if (enabled) {
                    setTimeout(() => nameInput.select(), 0);
                }
            });

            const getFinalName = () => {
                if (!customNameCheckbox.checked) {
                    return defaultName;
                }
                const val = nameInput.value.trim();
                return val || getBaseName(audioManager.bgmFile) || 'simai_package';
            };

            const sanitize = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

            const resolveSingleFileName = (defaultBase, ext) => {
                const base = customNameCheckbox.checked ? sanitize(getFinalName()) : defaultBase;
                return `${base}.${ext}`;
            };

            const DOWNLOAD_ICON_PATHS = {
                maidata: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
                music: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
                image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
                video: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
            };

            const createInlineDownloadBtn = (iconKey, label, disabled, onClick) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'popup-btn popup-btn-secondary';
                btn.disabled = Boolean(disabled);
                btn.style.cssText = 'width:100%;justify-content:center;padding:8px 12px;font-size:13px;';

                const svgNS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNS, 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('width', '16');
                svg.setAttribute('height', '16');
                svg.setAttribute('fill', 'currentColor');
                svg.setAttribute('aria-hidden', 'true');
                svg.style.flexShrink = '0';
                const path = document.createElementNS(svgNS, 'path');
                path.setAttribute('d', DOWNLOAD_ICON_PATHS[iconKey]);
                svg.appendChild(path);

                const textSpan = document.createElement('span');
                textSpan.textContent = label;

                btn.append(svg, textSpan);
                btn.addEventListener('click', onClick);
                return btn;
            };

            const actionsList = document.createElement('div');
            actionsList.className = 'download-inline-actions';
            actionsList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:2px;';

            actionsList.appendChild(createInlineDownloadBtn(
                'maidata',
                t('popup.download.downloadMaidata'),
                false,
                () => {
                    const curMaidata = getMaidata();
                    const content = typeof getSimaiDataString === 'function' ? getSimaiDataString(curMaidata) : "";
                    const blob = new Blob([content], { type: 'text/plain' });
                    triggerBlobDownload(blob, resolveSingleFileName('maidata', 'txt'));
                }
            ));

            actionsList.appendChild(createInlineDownloadBtn(
                'music',
                t('popup.download.downloadMusic'),
                !audioManager?.haveBGM?.(),
                async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    try {
                        const asset = await resolveBgmAsset(audioManager);
                        if (!asset) return;
                        triggerBlobDownload(asset.blob, resolveSingleFileName('track', asset.ext));
                    } catch (err) {
                        console.error('BGM 下載失敗', err);
                    } finally {
                        btn.disabled = !audioManager?.haveBGM?.();
                    }
                }
            ));

            const hasBgImage = Boolean(getBackgroundImage?.());
            actionsList.appendChild(createInlineDownloadBtn(
                'image',
                t('popup.download.downloadImage'),
                !hasBgImage,
                () => {
                    const backgroundImage = getBackgroundImage?.();
                    if (!(backgroundImage instanceof Blob)) return;
                    triggerBlobDownload(backgroundImage, resolveSingleFileName('bg', getFileExt(backgroundImage, 'png')));
                }
            ));

            const hasBgVideo = Boolean(getBackgroundVideo?.());
            actionsList.appendChild(createInlineDownloadBtn(
                'video',
                t('popup.download.downloadVideo'),
                !hasBgVideo,
                () => {
                    const backgroundVideo = getBackgroundVideo?.();
                    if (!(backgroundVideo instanceof Blob)) return;
                    triggerBlobDownload(backgroundVideo, resolveSingleFileName('pv', getFileExt(backgroundVideo, 'mp4')));
                }
            ));

            container.appendChild(actionsList);

            popupWindow({
                title: t('popup.download.title'),
                customContent: container,
                buttons: [
                    {
                        text: t('popup.download.packZip'),
                        onClick: async (pCtx) => {
                            pCtx.setProgress(5);
                            await ensureJSZip();
                            pCtx.setProgress(10);
                            const zip = new window.JSZip();
                            const fileName = sanitize(getFinalName());
                            const curMaidata = getMaidata();

                            zip.file("maidata.txt", typeof getSimaiDataString === 'function' ? getSimaiDataString(curMaidata) : "");

                            const backgroundImage = getBackgroundImage();
                            if (backgroundImage) {
                                zip.file(`bg.${getFileExt(backgroundImage, 'png')}`, backgroundImage);
                            }

                            try {
                                const bgmAsset = await resolveBgmAsset(audioManager);
                                if (bgmAsset) {
                                    zip.file(`track.${bgmAsset.ext}`, bgmAsset.blob);
                                }
                            } catch (e) { console.error("BGM 下載失敗", e); }

                            const backgroundVideo = getBackgroundVideo();
                            if (backgroundVideo) {
                                zip.file(`pv.${getFileExt(backgroundVideo, 'mp4')}`, backgroundVideo);
                            }

                            pCtx.setProgress(40);
                            const content = await zip.generateAsync({ type: "blob" }, (m) => pCtx.setProgress(40 + m.percent * 0.6));

                            triggerBlobDownload(content, `${fileName}.zip`);
                            pCtx.close();
                        }
                    }
                ]
            });
        });
    }
}

/**
 * 將當前專案打包為 .wmcx.zip Blob（與現有下載按鈕的 packZip 打包邏輯完全一致）
 * 回傳 Blob，不觸發瀏覽器下載
 * 供 Google Drive 上傳流程調用
 *
 * @param {Object} ctx - 上下文物件，包含 getMaidata, audioManager, getBackgroundImage, getBackgroundVideo
 * @param {Function} [onProgress] - JSZip generateAsync 進度回呼 ({ percent: number }) => void
 * @returns {Promise<Blob>}
 */
export async function buildProjectZip(ctx, onProgress) {
    const {
        getMaidata,
        audioManager,
        getBackgroundImage,
        getBackgroundVideo,
    } = ctx;

    await ensureJSZip();
    const zip = new window.JSZip();
    const curMaidata = typeof getMaidata === 'function' ? getMaidata() : ctx.maidata;

    zip.file("maidata.txt", typeof getSimaiDataString === 'function' ? getSimaiDataString(curMaidata) : "");

    const backgroundImage = typeof getBackgroundImage === 'function' ? getBackgroundImage() : ctx.backgroundImage;
    if (backgroundImage) {
        zip.file(`bg.${getFileExt(backgroundImage, 'png')}`, backgroundImage);
    }

    try {
        const bgmAsset = await resolveBgmAsset(audioManager);
        if (bgmAsset) {
            zip.file(`track.${bgmAsset.ext}`, bgmAsset.blob);
        }
    } catch (e) {
        console.error("[buildProjectZip] 音樂檔案讀取失敗:", e);
    }

    const backgroundVideo = typeof getBackgroundVideo === 'function' ? getBackgroundVideo() : ctx.backgroundVideo;
    if (backgroundVideo) {
        zip.file(`pv.${getFileExt(backgroundVideo, 'mp4')}`, backgroundVideo);
    }

    return await zip.generateAsync({ type: "blob" }, onProgress);
}

/**
 * 直接依據專案 ID 從 IndexedDB 讀取素材資料並打包為 .wmcx.zip Blob
 * 完全無需開啟或切換專案，不打擾主畫面渲染與音訊播放
 *
 * @param {string} projectId - 專案 ID
 * @param {Function} [onProgress] - JSZip generateAsync 進度回呼 ({ percent: number }) => void
 * @returns {Promise<Blob>}
 */
export async function buildProjectZipById(projectId, onProgress) {
    if (!projectId) {
        throw new Error('未指定專案 ID，無法進行打包');
    }

    await ensureJSZip();
    const zip = new window.JSZip();

    const [
        maidata,
        bgm,
        backgroundImage,
        backgroundVideo
    ] = await Promise.all([
        idbGetProject(projectId, 'maidata'),
        idbGetProject(projectId, 'resource_bgm'),
        idbGetProject(projectId, 'background_image'),
        idbGetProject(projectId, 'background_video')
    ]);

    zip.file("maidata.txt", typeof getSimaiDataString === 'function' ? getSimaiDataString(maidata) : "");

    if (backgroundImage instanceof Blob) {
        const bgExt = backgroundImage.name?.split('.').pop() || 'png';
        zip.file(`bg.${bgExt}`, backgroundImage);
    }

    if (bgm instanceof Blob) {
        const bgmExt = bgm.name?.split('.').pop() || 'mp3';
        zip.file(`track.${bgmExt}`, bgm);
    } else if (typeof bgm === 'string') {
        try {
            const resp = await fetch(bgm);
            const blob = await resp.blob();
            zip.file('track.mp3', blob);
        } catch (e) {
            console.warn('[buildProjectZipById] BGM fetch 失敗:', e);
        }
    }

    if (backgroundVideo instanceof Blob) {
        const videoExt = backgroundVideo.name?.split('.').pop() || 'mp4';
        zip.file(`pv.${videoExt}`, backgroundVideo);
    }

    return await zip.generateAsync({ type: "blob" }, onProgress);
}

/**
 * 直接將 .wmcx.zip Blob 在背景解壓並存入 IndexedDB
 * 完全不打擾主畫面、不清空當前編輯器、不切換專案
 *
 * @param {Blob} zipBlob - 下載的 .wmcx.zip Blob
 * @param {string} [defaultName='未命名專案'] - 專案預設名稱
 * @param {string|null} [targetProjectId=null] - 若指定則直接覆寫既有專案，否則建立新專案
 * @returns {Promise<{ projectId: string, projectName: string }>}
 */
export async function saveProjectZipToIDB(zipBlob, defaultName = '未命名專案', targetProjectId = null) {
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(zipBlob);

    let projectName = defaultName.replace(/\.wmcx\.zip$/i, '').trim() || '未命名專案';
    let finalProjectId = targetProjectId;

    if (!finalProjectId) {
        finalProjectId = await projectCreate(projectName);
    } else {
        await projectTouch(finalProjectId).catch(() => { });
    }

    let parsedMaidata = null;
    let bgmBlob = null;
    let bgImageBlob = null;
    let bgVideoBlob = null;

    for (const relativePath in zip.files) {
        if (!Object.prototype.hasOwnProperty.call(zip.files, relativePath)) continue;
        const entry = zip.files[relativePath];
        if (entry.dir) continue;

        const baseName = relativePath.replace(/\\/g, '/').split('/').pop();
        const lowerName = baseName.toLowerCase();
        const ext = (baseName.split('.').pop() || '').toLowerCase();

        const isVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv', 'ogg'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);

        if (lowerName.startsWith('maidata.')) {
            try {
                const text = await entry.async('string');
                parsedMaidata = parseMaidata(text);
                if (parsedMaidata?.title && parsedMaidata.title.trim()) {
                    projectName = parsedMaidata.title.trim();
                    await projectUpdateName(finalProjectId, projectName).catch(() => { });
                }
            } catch (e) {
                console.warn('[saveProjectZipToIDB] 解析 maidata.txt 失敗:', e);
            }
        } else if (lowerName.startsWith('track.')) {
            try {
                bgmBlob = await entry.async('blob');
            } catch (e) {
                console.warn('[saveProjectZipToIDB] 讀取音訊檔失敗:', e);
            }
        } else if (lowerName.startsWith('bg.')) {
            if (isImage) {
                try {
                    bgImageBlob = await entry.async('blob');
                } catch (_) { }
            } else if (isVideo) {
                try {
                    bgVideoBlob = await entry.async('blob');
                } catch (_) { }
            }
        } else if (lowerName.startsWith('pv.')) {
            if (isVideo) {
                try {
                    bgVideoBlob = await entry.async('blob');
                } catch (_) { }
            }
        }
    }

    const savePromises = [];
    if (parsedMaidata) {
        savePromises.push(idbSetProject(finalProjectId, 'maidata', parsedMaidata));
        savePromises.push(idbSetProject(finalProjectId, 'now_difficulty', 5));
    }
    if (bgmBlob) {
        savePromises.push(idbSetProject(finalProjectId, 'resource_bgm', bgmBlob));
    }
    if (bgImageBlob) {
        savePromises.push(idbSetProject(finalProjectId, 'background_image', bgImageBlob));
    }
    if (bgVideoBlob) {
        savePromises.push(idbSetProject(finalProjectId, 'background_video', bgVideoBlob));
    }

    await Promise.all(savePromises);

    return { projectId: finalProjectId, projectName };
}
