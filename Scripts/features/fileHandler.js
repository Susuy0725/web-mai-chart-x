import { ensureJSZip, popupWindow, simpleToast, getSimaiDataString } from '../helper.js';
import { t } from '../i18n.js';
import { projectCreate, projectUpdateName } from '../indexDB.js';

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
            const reader = new FileReader();
            reader.onload = (e) => {
                maidataProcess(e.target.result);
                resize();
            };
            reader.readAsText(file);
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
                    editorBackgroundVideo.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
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

    let _pendingFolderFiles = null;

    const checkMaidataContext = () => {
        if (audioManager.haveBGM()) return true;
        const maidata = getMaidata();
        if (maidata) {
            for (let i = 1; i <= 7; i++) {
                if (maidata[`inote_${i}`] && maidata[`inote_${i}`].trim() !== "") {
                    return true;
                }
            }
        }
        return false;
    };

    if (folderInput) {
        folderInput.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = folderInput.children[0];
            if (checkMaidataContext()) {
                _pendingFolderFiles = null;
                popupWindow({
                    title: t('popup.loadConfirm.titleFolder'),
                    content: t('popup.loadConfirm.content'),
                    buttons: [
                        {
                            text: t('popup.loadConfirm.overwrite'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                _pendingFolderFiles = 'overwrite';
                                input.value = '';
                                input.click();
                            }
                        },
                        {
                            text: t('popup.loadConfirm.newProject'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                _pendingFolderFiles = 'new';
                                input.value = '';
                                input.click();
                            }
                        },
                        { text: t('popup.cancel'), hideOnClick: true }
                    ]
                });
            } else {
                _pendingFolderFiles = 'overwrite';
                input.value = '';
                input.click();
            }
        });

        if (folderInput.children[0]) {
            folderInput.children[0].addEventListener('click', (e) => e.stopPropagation());
            folderInput.children[0].onchange = async (event) => {
                const files = event.target.files;
                if (!files || files.length === 0) {
                    console.warn("未選擇任何檔案");
                    return;
                }

                const mode = _pendingFolderFiles || 'overwrite';
                _pendingFolderFiles = null;

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
                if (maidata?.title && curId) {
                    projectUpdateName(curId, maidata.title).catch(() => { });
                }
                simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
            };
        }
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
        readZipButton.addEventListener('click', () => {
            const triggerZipInput = (mode) => {
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
                                if (maidata?.title && curId) {
                                    projectUpdateName(curId, maidata.title).catch(() => { });
                                }
                                simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
                            });
                            resize();
                        };
                        reader.readAsArrayBuffer(file);
                    }
                };
                input.click();
            };

            if (checkMaidataContext()) {
                popupWindow({
                    title: t('popup.loadConfirm.titleZip'),
                    content: t('popup.loadConfirm.content'),
                    buttons: [
                        {
                            text: t('popup.loadConfirm.overwrite'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                triggerZipInput('overwrite');
                            }
                        },
                        {
                            text: t('popup.loadConfirm.newProject'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                triggerZipInput('new');
                            }
                        },
                        { text: t('popup.cancel'), hideOnClick: true }
                    ]
                });
            } else {
                triggerZipInput('overwrite');
            }
        });
    }

    if (addMusicButton) {
        addMusicButton.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
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
            const textEl = document.createElement('label');
            textEl.textContent = t('popup.download.fileName');
            textEl.style.cssText = "display:block;margin-bottom:5px;font-size:12px;color: lightgray;";
            container.appendChild(textEl);
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.placeholder = t('popup.download.placeholder');
            nameInput.value = defaultName;
            nameInput.style.cssText = "width:calc(100% - 20px);padding:8px;font-size:12px;margin-bottom:10px;background:#151515;color:white;border:1px solid #444;border-radius:4px;";

            setTimeout(() => nameInput.select(), 100);
            container.appendChild(nameInput);

            const getFinalName = () => {
                const val = nameInput.value.trim();
                return val || getBaseName(audioManager.bgmFile) || 'simai_package';
            };

            const sanitize = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

            popupWindow({
                title: t('popup.download.title'),
                customContent: container,
                buttons: [
                    {
                        text: t('popup.download.downloadMaidata'),
                        onClick: () => {
                            const curMaidata = getMaidata();
                            const content = typeof getSimaiDataString === 'function' ? getSimaiDataString(curMaidata) : "";
                            const blob = new Blob([content], { type: 'text/plain' });
                            const fileName = sanitize(getFinalName());

                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${fileName}.txt`;
                            a.click();
                        }
                    },
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
                                const bgExt = backgroundImage.name?.split('.').pop() || 'png';
                                zip.file(`bg.${bgExt}`, backgroundImage);
                            }

                            if (audioManager.haveBGM()) {
                                const bgm = audioManager.bgmFile;
                                const bgmExt = bgm.name?.split('.').pop() || 'mp3';
                                if (bgm instanceof Blob) {
                                    zip.file(`track.${bgmExt}`, bgm);
                                } else if (typeof bgm === 'string') {
                                    try {
                                        const resp = await fetch(bgm);
                                        zip.file(`track.${bgmExt}`, await resp.blob());
                                    } catch (e) { console.error("BGM 下載失敗", e); }
                                }
                            }

                            const backgroundVideo = getBackgroundVideo();
                            if (backgroundVideo) {
                                const videoExt = backgroundVideo.name?.split('.').pop() || 'mp4';
                                zip.file(`pv.${videoExt}`, backgroundVideo);
                            }

                            pCtx.setProgress(40);
                            const content = await zip.generateAsync({ type: "blob" }, (m) => pCtx.setProgress(40 + m.percent * 0.6));

                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(content);
                            a.download = `${fileName}.zip`;
                            a.click();
                            pCtx.close();
                        }
                    },
                    { text: t('popup.cancel'), hideOnClick: true }
                ]
            });
        });
    }
}
