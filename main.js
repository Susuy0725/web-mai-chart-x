import { openDB, idbGet, idbSet } from './indexDB.js';
import { imgNotExists, PathRecorder, scaleBase, innerCirleBase, noteRefPos, touchRefPos, getButton, debounce, audioManager, touchPaths, getHighlight, parseMaidata, popupWindow, loadAllImages } from './helper.js';
import { simaiDecode } from './decode.js';

let images, readyBeat, maidata, nowDifficulty;

window.popupWindow = popupWindow; // 暴露 popupWindow 讓其他模組也能使用

popupWindow({
    title: "正在準備環境...",
    content: "",
    buttons: [],
    unclosable: true,
    closeWhen: async (close, update, updButtons, setProgress) => {
        try {
            // 1. 音效 (0% ~ 40%)
            await audioManager.init((percent, key) => {
                const totalPercent = percent * 0.4;
                setProgress(totalPercent);
                update(`正在載入音效: ${key} (${Math.round(percent)}%)`);
            });

            // 2. 圖片 (40% ~ 90%)
            images = await loadAllImages((percent, key) => {
                const totalPercent = 40 + (percent * 0.5); // 從 40 開始，佔比 50
                setProgress(totalPercent);
                update(`正在載入素材: ${key} (${Math.round(percent)}%)`);
            });
            images = await loadAllImages();
            readyBeat = await idbGet('simai_ready_beat') === 'true';

            // 3. 從 IndexedDB 恢復使用者設定
            update("正在恢復上次的編輯狀態...");
            const [savedContent, savedMusicDelay, savedTimeControl, savedBgm, savedMaiData, savedDifficulty] = await Promise.all([
                idbGet('simai_editor_content'),
                idbGet('simai_musicDelay'),
                idbGet('simai_timeControl'),
                idbGet('simai_resource_bgm'),
                idbGet('simai_maidata'),
                idbGet('simai_now_difficulty')
            ]);

            // 4. 套用恢復的資料
            if (savedContent) {
                editorInput.value = savedContent;

                applyHighlight(savedContent);
                getres(savedContent);
            }
            if (savedMusicDelay) {
                musicDelay = parseFloat(savedMusicDelay);
                offsetInput.value = musicDelay;
                console.log("載入偏移值:", musicDelay);
                offsetInputDebounce();
            }
            if (savedTimeControl && !isNaN(savedTimeControl)) {
                realTime = savedTimeControl;
                slider.value = realTime;
                globalTime = realTime - musicDelay;

                console.log("載入時間控制值:", globalTime);
                update();
            }
            if (savedMaiData) {
                maidata = savedMaiData;
            }
            if (savedDifficulty) {
                nowDifficulty = savedDifficulty;
                changeDifficulty.value = nowDifficulty;
            }
            {
                let isVisible = await idbGet('simai_hide_editor') !== true; // 改名為 isVisible 較直覺
                setEditorCss(isVisible);
            }
            if (savedBgm) {
                update("正在還原背景音樂...");
                await audioManager.setBackgroundMusic(savedBgm);
                endTime = Math.max(endTime, audioManager.getBGMDuration() + 1);
            }

            setProgress(100);

            // 5. 初始化畫面
            update("完成！正在渲染畫面...");
            resize();
            close(); // 立即關閉載入提示

        } catch (e) {
            console.error("初始化失敗:", e);
            update(`初始化發生錯誤：\n${e.message}\n請嘗試重新整理。`);
            // 報錯時可以考慮顯示一個「強制關閉」按鈕，或者讓視窗可以被手動關閉
            updButtons([{
                text: "清除所有資料",
                onClick: async () => {
                    const confirmed = confirm("確定要清除 IndexedDB 中的所有資料嗎？此操作無法復原！");
                    if (!confirmed) return;
                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");
                    store.clear();
                    try {
                        await transaction.complete;
                        console.log("已清除 IndexedDB 中的所有資料");
                    } catch (e) {
                        console.error("清除 IndexedDB 資料失敗:", e);
                    }
                }
            }, {
                text: "清除譜面暫存",
                onClick: async () => {
                    const confirmed = confirm("確定要清除所有譜面資料嗎？音效與圖片快取將會保留。");
                    if (!confirmed) return;

                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");

                    // 1. 取得所有 Key
                    const getKeysRequest = store.getAllKeys();

                    getKeysRequest.onsuccess = () => {
                        const allKeys = getKeysRequest.result;
                        let deleteCount = 0;

                        // 2. 篩選並刪除符合條件的 Key
                        allKeys.forEach(key => {
                            if (typeof key === 'string' && key.startsWith('simai_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                        });

                        transaction.oncomplete = () => {
                            console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                            // location.reload(); 
                        };
                    };

                    transaction.onerror = (e) => {
                        console.error("清除特定資料失敗:", e);
                    };
                }
            },
            {
                text: "清除素材暫存",
                onClick: async () => {
                    const confirmed = confirm("確定要清除所有音效與圖片快取資料嗎？譜面資料將會保留。");
                    if (!confirmed) return;

                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");

                    // 1. 取得所有 Key
                    const getKeysRequest = store.getAllKeys();

                    getKeysRequest.onsuccess = () => {
                        const allKeys = getKeysRequest.result;
                        let deleteCount = 0;

                        // 2. 篩選並刪除符合條件的 Key
                        allKeys.forEach(key => {
                            if (typeof key === 'string' && key.startsWith('sfx_cache_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                            if (typeof key === 'string' && key.startsWith('img_cache_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                        });

                        transaction.oncomplete = () => {
                            console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                            // location.reload(); 
                        };
                    };

                    transaction.onerror = (e) => {
                        console.error("清除特定資料失敗:", e);
                    };
                }
            },
            {
                text: "關閉",
                onClick: () => {
                    popupWindow({
                        title: "警告",
                        content: "如果繼續使用可能會遇到不可預期的錯誤，建議先清除資料或重新整理頁面。\n<br>建議可以先清除暫存資料後再嘗試載入，看看是否是因為某筆資料損壞導致的問題。",
                        buttons: [{ text: "繼續", onClick: () => { close(); }, hideOnClick: true }, { text: "取消", hideOnClick: true }]
                    });
                }
            }]);
        }
    }
});

const canvas = document.getElementById('main');
const canvasContainer = document.getElementById('canvasContainer');
const slider = document.getElementById('timeControl');
const playButton = getButton("play/stop", "control");
const quickGenerateButton = getButton("quickGenerate", "utility");
const hideEditorButton = getButton("hideEditor", "utility");
const hideUtilityButton = getButton("hide/show", "utility");
const readyBeatCheckbox = getButton("readyBeat", "utility").children[0];
const offsetInput = getButton("offset", "utility").children[0];
const changeDifficulty = getButton("changeDifficulty", "utility").children[0];
const addMusicButton = getButton("addMusic", "utility");
const readMaidataButton = getButton("readMaidata", "utility");
const popup = getButton("popup", "utility");
const folderInput = getButton("readFolder", "utility");

let ctx = canvas.getContext('2d');
const scale = 0.98;
const noteBaseSize = 11;
const speed = 6.5;
const touchSpeed = 6.5;
const effectDecayTime = 0.4;
const distance = 0.25;
let globalTime = 0, realTime = 0;
let lastTimestamp = null;
let secondCtx = null;
let externalWindow = null;
let timeControlSliding = false; // 新增滑動狀態標記
let showSensor = false;

let clockBpm = 60;

// 1. 選取狀態儲存
let activePointers = new Map();

const editorContainer = document.querySelector('.editor-container');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
let notes = [], endTime = 1, musicDelay = 1e-4, chartBaseOffset = false;

getButton("manageResources", "utility").addEventListener('click', async () => {
    async function getSize() {
        // open a fresh readonly transaction each time so it won't be closed already
        const db = await openDB();
        const transaction = db.transaction("editorState", "readonly");
        const store = transaction.objectStore("editorState");

        let details = "IndexedDB 儲存狀態：\n\n";
        let totalSize = 0;

        // 取得所有 Key 並統計大小
        const keys = await new Promise(res => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
        });

        for (const key of keys) {
            const data = await idbGet(key);
            let size = 0;
            if (data instanceof Blob) size = data.size;
            else if (data instanceof ArrayBuffer) size = data.byteLength;
            else size = JSON.stringify(data).length * 2;

            totalSize += size;
            details += `• ${key}: ${formatSize(size)}\n`;
        }
        details += `\n總計使用量: ${formatSize(totalSize)}`;

        return details;
    }

    function formatSize(size) {
        if (size < 1024) return `${size} B`;
        for (const unit of ['KiB', 'MiB', 'GiB']) {
            size /= 1024;
            if (size < 1024) return `${size.toFixed(1)} ${unit}`;
        }
        //return (size / 1024).toFixed(1);
    }


    // 呼叫你的 simplePopupWindow
    popupWindow(
        {
            title: "資源管理",
            content: await getSize(),
            buttons: [
                {
                    text: "清除緩存",
                    onClick: (close, update) => {
                        popupWindow(
                            {
                                title: "清除緩存",
                                width: "max-content",
                                buttons: [
                                    {
                                        text: "清除所有資料",
                                        onClick: async () => {
                                            const confirmed = confirm("確定要清除 IndexedDB 中的所有資料嗎？此操作無法復原！");
                                            if (!confirmed) return;
                                            const db = await openDB();
                                            const transaction = db.transaction("editorState", "readwrite");
                                            const store = transaction.objectStore("editorState");
                                            store.clear();
                                            update(await getSize());
                                            try {
                                                await transaction.complete;
                                                console.log("已清除 IndexedDB 中的所有資料");
                                            } catch (e) {
                                                console.error("清除 IndexedDB 資料失敗:", e);
                                            }
                                        }
                                    },
                                    {
                                        text: "清除譜面暫存",
                                        onClick: async () => {
                                            const confirmed = confirm("確定要清除所有譜面資料嗎？音效與圖片快取將會保留。");
                                            if (!confirmed) return;

                                            const db = await openDB();
                                            const transaction = db.transaction("editorState", "readwrite");
                                            const store = transaction.objectStore("editorState");

                                            // 1. 取得所有 Key
                                            const getKeysRequest = store.getAllKeys();

                                            getKeysRequest.onsuccess = async () => {
                                                const allKeys = getKeysRequest.result;
                                                let deleteCount = 0;

                                                // 2. 篩選並刪除符合條件的 Key
                                                allKeys.forEach(key => {
                                                    if (typeof key === 'string' && key.startsWith('simai_')) {
                                                        store.delete(key);
                                                        deleteCount++;
                                                    }
                                                });
                                                update(await getSize());

                                                transaction.oncomplete = () => {
                                                    console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                                                    // 這裡可以選擇是否要 reload 頁面或是更新 UI
                                                    // location.reload(); 
                                                };
                                            };

                                            transaction.onerror = async (e) => {
                                                console.error("清除特定資料失敗:", e);
                                                update(await getSize());
                                            };
                                        }
                                    },
                                    {
                                        text: "清除素材暫存",
                                        onClick: async () => {
                                            const confirmed = confirm("確定要清除所有音效與圖片快取資料嗎？譜面資料將會保留。");
                                            if (!confirmed) return;

                                            const db = await openDB();
                                            const transaction = db.transaction("editorState", "readwrite");
                                            const store = transaction.objectStore("editorState");

                                            // 1. 取得所有 Key
                                            const getKeysRequest = store.getAllKeys();

                                            getKeysRequest.onsuccess = async () => {
                                                const allKeys = getKeysRequest.result;
                                                let deleteCount = 0;

                                                // 2. 篩選並刪除符合條件的 Key
                                                allKeys.forEach(key => {
                                                    if (typeof key === 'string' && key.startsWith('sfx_cache_')) {
                                                        store.delete(key);
                                                        deleteCount++;
                                                    }
                                                    if (typeof key === 'string' && key.startsWith('img_cache_')) {
                                                        store.delete(key);
                                                        deleteCount++;
                                                    }
                                                });

                                                update(await getSize());

                                                transaction.oncomplete = () => {
                                                    console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                                                    // 這裡可以選擇是否要 reload 頁面或是更新 UI
                                                    // location.reload(); 
                                                };
                                            };

                                            transaction.onerror = async (e) => {
                                                console.error("清除特定資料失敗:", e);
                                                update(await getSize());
                                            };
                                        }
                                    },
                                    {
                                        text: "關閉",
                                        hideOnClick: true
                                    }]
                            });
                    }
                },
                {
                    text: "關閉",
                    hideOnClick: true
                }
            ]
        });
});
const getres = ((simaiDataValue) => {
    const result = (() => {
        try {
            return simaiDecode(simaiDataValue, readyBeat);
        } catch (e) {
            console.error("解析失敗", e);
            return null;
        }
    })();

    if (result) {
        notes = result.notes;
        endTime = result.endTime + 1;
        slider.max = endTime - musicDelay;
        chartBaseOffset = result.baseOffset;
        clockBpm = result.bpm;
        draw();
    }
});

const offsetInputDebounce = debounce(() => {
    slider.max = endTime - musicDelay;
    slider.value = realTime;

    globalTime = realTime - musicDelay;

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime);
    }
    idbSet('simai_musicDelay', musicDelay).then(() => {
        console.log("已儲存偏移值到 IndexedDB:", musicDelay);
    }).catch((error) => {
        console.error("儲存偏移值到 IndexedDB 失敗:", error);
    });
    draw();
}, 500);

const inputDebounce = debounce(() => {
    const value = editorInput.value;

    // 解析 Note 邏輯
    getres(value);

    // 存入本地空間
    idbSet('simai_editor_content', value).then(() => {
        console.log("已儲存內容到 IndexedDB");
    }).catch((error) => {
        console.error("儲存內容到 IndexedDB 失敗:", error);
    });
}, 300);

const setEditorCss = (visible = null) => {
    // 同步捲動永遠執行
    highlightLayer.scrollTop = editorInput.scrollTop;
    highlightLayer.scrollLeft = editorInput.scrollLeft;

    if (visible === null) return;

    // visible 為 true 代表顯示編輯器
    canvasContainer.style.width = visible ? '50%' : '100%';
    const displayMode = visible ? 'block' : 'none';

    editorInput.style.display = displayMode;
    highlightLayer.style.display = displayMode;
    editorContainer.style.display = displayMode;
};

readyBeatCheckbox.checked = readyBeat;

readyBeatCheckbox.addEventListener('change', () => {
    readyBeat = readyBeatCheckbox.checked;
    idbSet('simai_ready_beat', readyBeatCheckbox.checked).then(() => {
        console.log("已儲存預備拍狀態到 IndexedDB:", readyBeatCheckbox.checked);
    }).catch((error) => {
        console.error("儲存預備拍狀態到 IndexedDB 失敗:", error);
    });
    inputDebounce();
});

editorInput.addEventListener('input', () => {
    const value = editorInput.value;

    // 同步捲動位置
    setEditorCss();

    // 立即更新顏色高亮 (視覺上達到打字立刻出現)
    applyHighlight(value);

    // 延遲處理重解析與存檔 (避免打字時解析幾萬行導致卡頓)
    inputDebounce();
});

offsetInput.addEventListener('input', () => {
    musicDelay = (() => {
        const val = parseFloat(offsetInput.value);
        if (isNaN(val)) {
            console.warn("偏移值無效，請輸入數字");
            return 0;
        }
        return val;
    })();
    offsetInputDebounce();
});

folderInput.addEventListener('click', (e) => {
    const input = folderInput.children[0];
    input.click();
    input.onchange = (event) => {
        const files = event.target.files;
        console.log("選擇的檔案列表：", files);
        if (files.length === 0) {
            console.warn("未選擇任何檔案");
            return;
        }
        for (var i = 0; i < files.length; i++) {
            let file = files.item(i);
            if (file.name.startsWith('track.')) {
                // 音樂檔
                const url = URL.createObjectURL(file);
                audioManager.setBackgroundMusic(url);
                endTime = Math.max(endTime, audioManager.getBGMDuration() + 1);
                idbSet('simai_resource_bgm', file).then(() => {
                    console.log("已儲存音樂檔到 IndexedDB");
                }).catch((error) => {
                    console.error("儲存音樂檔到 IndexedDB 失敗:", error);
                });
            }
            if (file.name.startsWith('maidata.')) {
                // 譜面檔
                const reader = new FileReader();
                reader.onload = (e) => {
                    editorInput.value = "";
                    applyHighlight("");
                    const content = parseMaidata(e.target.result);
                    maidata = content;
                    idbSet('simai_maidata', content).then(() => {
                        console.log("已儲存譜面內容到 IndexedDB");
                    }).catch((error) => {
                        console.error("儲存譜面內容到 IndexedDB 失敗:", error);
                    });
                    console.log(content);
                    if (content["first"]) {
                        console.log("成功讀取 first");
                        musicDelay = (() => {
                            const val = parseFloat(content["first"]);
                            if (isNaN(val)) {
                                console.warn("偏移值無效，請輸入數字");
                                return 0;
                            }
                            return val;
                        })();
                        offsetInputDebounce();
                    }
                    nowDifficulty = 5; // 預設讀取 inote_5，實際可依需求調整
                    idbSet("simai_now_difficulty", nowDifficulty).then(() => {
                        console.log("已儲存當前難度到 IndexedDB:", nowDifficulty);
                    }).catch((error) => {
                        console.error("儲存當前難度到 IndexedDB 失敗:", error);
                    });
                    changeDifficulty.value = nowDifficulty;
                    if (content["inote_5"]) {
                        console.log("成功讀取 inote_5，已載入編輯器");
                        console.log("inote_5 內容預覽：", content["inote_5"].slice(0, 100) + (content["inote_5"].length > 100 ? "..." : ""));
                        editorInput.value = content["inote_5"] || ""; // 預設讀取 inote_5，實際可依需求調整
                        idbSet('simai_editor_content', editorInput.value).then(() => {
                            console.log("已儲存編輯器內容到 IndexedDB");
                        }).catch((error) => {
                            console.error("儲存編輯器內容到 IndexedDB 失敗:", error);
                        });
                        applyHighlight(content["inote_5"]);
                    } else {
                        console.warn("maidata 中未找到 inote_5，編輯器將保持空白");
                    }
                    getres(editorInput.value);
                    resize();
                };
                reader.readAsText(file);
            }
        }
    };
});

readMaidataButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = parseMaidata(e.target.result);
                maidata = content;
                idbSet('simai_maidata', content).then(() => {
                    console.log("已儲存譜面內容到 IndexedDB");
                }).catch((error) => {
                    console.error("儲存譜面內容到 IndexedDB 失敗:", error);
                });
                console.log(content);
                if (content["first"]) {
                    console.log("成功讀取 first");
                    musicDelay = (() => {
                        const val = parseFloat(content["first"]);
                        if (isNaN(val)) {
                            console.warn("偏移值無效，請輸入數字");
                            return 0;
                        }
                        return val;
                    })();
                    offsetInputDebounce();
                }
                if (content["inote_5"]) {
                    console.log("成功讀取 inote_5，已載入編輯器");
                    console.log("inote_5 內容預覽：", content["inote_5"].slice(0, 100) + (content["inote_5"].length > 100 ? "..." : ""));
                    editorInput.value = content["inote_5"] || ""; // 預設讀取 inote_5，實際可依需求調整
                    idbSet('simai_editor_content', editorInput.value).then(() => {
                        console.log("已儲存編輯器內容到 IndexedDB");
                    }).catch((error) => {
                        console.error("儲存編輯器內容到 IndexedDB 失敗:", error);
                    });
                    applyHighlight(content["inote_5"]);
                    getres(content["inote_5"]);
                } else {
                    console.warn("maidata 中未找到 inote_5，編輯器將保持空白");
                }
                resize();
            };
            reader.readAsText(file);
        }
    };
    input.click();
});

hideEditorButton.addEventListener('click', () => {
    // 檢查目前是否為隱藏狀態
    const currentlyHidden = editorContainer.style.display === 'none';

    // 如果目前隱藏 -> 點擊後要「顯示」(true)
    // 如果目前顯示 -> 點擊後要「隱藏」(false)
    const nextStateVisible = currentlyHidden;

    // 儲存的是 "是否隱藏" 的狀態
    idbSet('simai_hide_editor', !nextStateVisible).then(() => {
        console.log("已儲存編輯器顯示狀態到 IndexedDB:", !nextStateVisible);
    }).catch((error) => {
        console.error("儲存編輯器顯示狀態到 IndexedDB 失敗:", error);
    });

    setEditorCss(nextStateVisible);
    resize();
    console.log(`編輯器已${nextStateVisible ? '顯示' : '隱藏'}`);
});

const difficultyInputDebounce = debounce(() => {
    const difficulty = changeDifficulty.value;
    idbSet('simai_now_difficulty', difficulty).then(() => {
        console.log("已儲存難度到 IndexedDB:", difficulty);
    }).catch((error) => {
        console.error("儲存難度到 IndexedDB 失敗:", error);
    });
}, 500);

changeDifficulty.addEventListener('change', (e) => {
    console.log("難度變更為:", e.target.value);
    const nowEditorContent = editorInput.value;
    maidata['inote_' + nowDifficulty] = nowEditorContent;
    nowDifficulty = e.target.value;
    editorInput.value = maidata['inote_' + nowDifficulty] ?? "";
    console.log(maidata, 'inote_' + nowDifficulty);
    applyHighlight(editorInput.value);
    inputDebounce();
    difficultyInputDebounce();
});

hideUtilityButton.addEventListener('click', () => {
    const utilityBtns = document.getElementById('topUtilityBtns');
    const isHidden = hideUtilityButton.dataset.hidden === 'true';
    if (isHidden) {
        utilityBtns.style.overflowX = 'auto';
        hideUtilityButton.classList.remove('expanded');
        editorContainer.classList.remove('expanded');
    } else {
        utilityBtns.style.overflowX = 'hidden';
        utilityBtns.scrollLeft = 0; // 隱藏時強制捲回最左，避免下次展開時看到中間或右邊的按鈕
        hideUtilityButton.classList.add('expanded');
        editorContainer.classList.add('expanded');
    }
    hideUtilityButton.innerText = isHidden ? '▲' : '▼';
    hideUtilityButton.dataset.hidden = isHidden ? 'false' : 'true';
    utilityBtns.style.padding = isHidden ? '5px' : '0px 5px';
    utilityBtns.style.height = isHidden ? '30px' : 'var(--utility-hidden-height)';
    editorContainer.style.top = isHidden ? '40px' : 'var(--utility-hidden-height)';
});

quickGenerateButton.addEventListener('click', () => {
    popupWindow({
        title: "快速生成",
        content: `
BPM: <input type="number" id="quickBpm" value="60" style="width: 80px;"><br>
Beat: <input type="number" id="quickBeat" value="4" style="width: 80px;"><br>`,
        buttons: [
            {
                text: "生成",
                onClick: (closePopup, updateContent, updButtons, contentElem) => {
                    const bpm = contentElem.querySelector('#quickBpm').value;
                    const beat = contentElem.querySelector('#quickBeat').value;
                    if (isNaN(parseFloat(bpm)) || isNaN(parseFloat(beat))) {
                        popupWindow({ title: "請確保所有輸入都是有效的數字" });
                        return;
                    }
                    const generated = `(${parseFloat(bpm)}){${parseFloat(beat)}}`;
                    editorInput.value += generated;
                    applyHighlight(editorInput.value);
                    inputDebounce();
                    closePopup();
                }
            }
        ]
    });
});

editorInput.addEventListener('scroll', () => {
    highlightLayer.scrollTop = editorInput.scrollTop;
    highlightLayer.scrollLeft = editorInput.scrollLeft;
});
const pairs = { '(': ')', '{': '}', '[': ']' };
const closingChars = new Set(Object.values(pairs));

// 括號補齊／跳過（beforeinput 在手機和桌機的文字輸入都可靠）
editorInput.addEventListener('beforeinput', (e) => {
    const char = e.data;
    if (!char || char.length !== 1) return;

    const { selectionStart: start, selectionEnd: end, value } = editorInput;

    if (pairs[char]) { // 開括號：自動補齊並包住選取
        e.preventDefault();
        editorInput.setRangeText(char + value.slice(start, end) + pairs[char], start, end, 'end');
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
        editorInput.dispatchEvent(new Event('input'));
    } else if (closingChars.has(char) && start === end && value[start] === char) { // 閉括號：跳過
        e.preventDefault();
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
    }
});

// Backspace 成對刪除（keydown 在桌機鍵盤更可靠）
editorInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;
    const { selectionStart: start, selectionEnd: end, value } = editorInput;
    if (start === end && start > 0 && pairs[value[start - 1]] === value[start]) {
        e.preventDefault();
        editorInput.setRangeText('', start - 1, start + 1, 'end');
        editorInput.selectionStart = editorInput.selectionEnd = start - 1;
        editorInput.dispatchEvent(new Event('input'));
    }
});

addMusicButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            audioManager.setBackgroundMusic(url);
            idbSet('simai_resource_bgm', file);
        }
    };
    input.click();
});

function applyHighlight(text) {
    highlightLayer.innerHTML = getHighlight(text);
}

const wSlideRatio = [
    111, 68, -3, 0,
    160, 90, -3.5, -0.004,
    204, 110, -4.6, -0.0035,
    253, 136, -5.5, -0.004,
    298, 154, -6.5, -0.003,
    353, 179, -6.2, -0.003,
    410, 205, -5.75, -0.003,
    464, 226, -5.45, -0.003,
    519, 251, -5.4, -0.004,
    571, 271, -5.2, -0.003,
    653, 313, -3.9, -0.003,
];

const slideInputDebounce = debounce(() => {
    timeControlSliding = false;
    idbSet('simai_timeControl', realTime).then(() => {
        console.log("已儲存時間控制值到 IndexedDB:", realTime);
    }).catch((error) => {
        console.error("儲存時間控制值到 IndexedDB 失敗:", error);
    });
}, 100);

slider.addEventListener('input', () => {
    timeControlSliding = true;
    const value = parseFloat(slider.value);
    globalTime = value - musicDelay;
    realTime = value;

    activePointers.clear();
    audioManager.stopAllLongSounds();

    if (playButton.dataset.playing === 'true') {
        // 2. 播放中拖動：音樂即時同步跳轉 (Seek)
        // 注意：Web Audio API 重建 Source Node 很快，但極速拖動可能會有噴麥音
        audioManager.playBGM(realTime);
    } else {
        // 3. 暫停中拖動：只需停止 BGM 並更新畫布預覽
        audioManager.stopBGM();
        draw();
    }
    slideInputDebounce();
});

let bgmUpdateTimer = null;

playButton.addEventListener('click', () => {
    bgmUpdateTimer = null; // 重置 BGM 更新計時器
    if (playButton.dataset.playing === 'true') {
        playButton.dataset.playing = 'false';
        lastTimestamp = null;
        // --- 停止音效與 BGM ---
        audioManager.stopAllLongSounds();
        audioManager.stopBGM();

        notes.forEach(n => n.riserActive = false); // 強制重置標記
    } else {
        playButton.dataset.playing = 'true';
        lastTimestamp = performance.now();
        // --- 從當前的 realTime 同步啟動 BGM ---
        audioManager.playBGM(realTime);

        requestAnimationFrame(update);
    }
});

/*
function getShapeAt(x, y) {
    let found = null;
    for (let i = touchPaths.length - 1; i >= 0; i--) {
        if (ctx.isPointInPath(touchPaths[i].path, x, y)) {
            found = touchPaths[i].id;
            break;
        }
    }
    return found;
}
 
// 4. 事件監聽
const handlePointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    // console.log(`Pointer Event: ${e.type} - ID: ${e.pointerId} at (${e.clientX - rect.left - canvas.width / 2}, ${e.clientY - rect.top - canvas.height / 2})`);
    const id = getShapeAt(e.clientX - rect.left, e.clientY - rect.top);
 
    if (id) {
        activePointers.set(e.pointerId, id);
    } else {
        activePointers.delete(e.pointerId); // 移出有效區域時刪除
    }
    draw();
};
 
const removePointer = (e) => {
    activePointers.delete(e.pointerId); // 放開或離開時刪除
    draw();
};
 
// 支援按下與移動時高亮
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('pointermove', handlePointer);
 
// 支援放開、移出、中斷時取消高亮
canvas.addEventListener('pointerup', removePointer);
canvas.addEventListener('pointerleave', removePointer);
canvas.addEventListener('pointercancel', removePointer); // 處理觸控被系統中斷的情況
*/

function update(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;
    if (playButton.dataset.playing === 'true') {
        realTime += dt;
        globalTime = realTime - musicDelay;
        if (bgmUpdateTimer === null || bgmUpdateTimer >= 4) {
            audioManager.playBGM(realTime);
            bgmUpdateTimer = 0;
        }
        bgmUpdateTimer = (bgmUpdateTimer || 0) + dt;
        slider.value = realTime;
        draw();
        if (globalTime >= endTime) {
            playButton.dataset.playing = 'false';
            globalTime = endTime;
            slider.value = realTime; // 保持 slider 值與 realTime 一致
        } else {
            requestAnimationFrame(update);
        }
    }
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth * dpr;
    const h = canvasContainer.clientHeight * dpr;
    const p = Math.min(w, h) / scaleBase * scale;
    canvas.width = w;
    canvas.height = h;
    if (!secondCtx) ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    draw();
}

function scaleCanvasContainer() {

}

popup.addEventListener('click', openSecondWindow);

function openSecondWindow() {
    if (externalWindow && !externalWindow.closed) {
        externalWindow.focus();
        return;
    }
    externalWindow = window.open("", "SecondaryCanvas", "width=800,height=800");
    // 注入基礎樣式與 Canvas
    const style = externalWindow.document.createElement('style');
    style.textContent = `
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
            }
            #canvasContainer {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
            }
            #canvasContainer img {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                object-fit: contain;
                scale: 0.899;
            }
            #secondary {
                position: absolute;
                top: 0;
                left: 0;
            }
        `;
    externalWindow.document.head.appendChild(style);
    externalWindow.document.body.innerHTML = `
            <div id="canvasContainer">
                <img src="./Skin/outline.png" alt="">
                <canvas id="secondary"></canvas>
            </div>
        `;
    const extCanvas = externalWindow.document.getElementById('secondary');
    // 這裡需要處理縮放邏輯，建議參考你原有的 resize 函式
    extCanvas.width = 800;
    extCanvas.height = 800;
    secondCtx = extCanvas.getContext('2d');

    externalWindow.addEventListener('beforeunload', () => {
        console.log("警告：外部視窗即將關閉");
        // 你可以在這裡重置主視窗的某些狀態
        secondCtx = null;
        ctx = canvas.getContext('2d'); // 切回主 Canvas 的上下文
    });

    const syncResize = () => {
        const dpr = externalWindow.devicePixelRatio || 1;
        const size = Math.min(externalWindow.innerWidth, externalWindow.innerHeight);
        extCanvas.width = externalWindow.innerWidth * dpr;
        extCanvas.height = externalWindow.innerHeight * dpr;

        // 重新套用你的座標系統 (這點最重要！)
        const p = size / scaleBase * scale * dpr;
        secondCtx.setTransform(p, 0, 0, p, extCanvas.width / 2, extCanvas.height / 2);
        draw();
    };

    syncResize();

    externalWindow.addEventListener('resize', syncResize);
    ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2); // 清除主 Canvas

    ctx = secondCtx; // 切換到第二個 Canvas 的上下文

    draw(); // 重新繪製到第二個 Canvas
}

window.addEventListener('resize', resize);

resize();

let playClock = [false, false, false, false];
function draw() {
    // 1. 清除畫布
    ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
    //drawBackground(ctx);

    if (showSensor) for (let key of activePointers.keys()) {
        if (typeof key === 'string' && key.startsWith('sim_')) {
            activePointers.delete(key);
        }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
    ctx.lineWidth = 0.5;
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
    ctx.lineWidth = 0.7;
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
    ctx.stroke();
    ctx.restore();

    // 2. 準備繪製桶子 (定義視覺疊加順序：由下而上)
    const buckets = {
        slide: [],
        tapnhold: [],
        touch: []
    };

    const playing = playButton.dataset.playing === 'true';

    // 3. 核心迴圈：一邊處理音效邏輯，一邊將音符分類到桶子
    if (playing && readyBeat) {
        for (let i = 0; i < 4; i++) {
            const clockT = (i / 4) * (240 / clockBpm) - globalTime;
            if (clockT > 0) {
                playClock[i] = false;
            } else {
                if (!playClock[i]) {
                    audioManager.queueSoundSingle('clock', clockT);
                }
                playClock[i] = true;
            }
        }
    }
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteT = (note.time - globalTime);
        const t = 1 - timeFunction(noteT * (speed * 0.8833 + 0.8167));
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

        // --- 效能過濾：如果太早或太晚，就不處理繪製 ---
        const isVisible = t >= -1 && -noteT <= skipT + effectDecayTime;

        if (playing && !timeControlSliding) {
            if (showSensor) {
                const hitWindow = 0.03; // 瞬間音符亮起的持續時間 (秒)
                const isInsideAction = (noteT <= 0 && -noteT < hitWindow); // 剛擊中
                const isHolding = (note.holdDuration > 0 && noteT <= 0 && -noteT < note.holdDuration); // 長按中

                if (isInsideAction || isHolding) {
                    let sensorId = "";
                    if (note.type === "touch") {
                        sensorId = note.touchPos === "C" ? "C1" : `${note.touchPos}${note.pos}`;
                    } else {
                        // Tap, Hold, Star 預設對應外圈 A 區
                        sensorId = "A" + note.pos;
                    }
                    // 使用 "sim_" 前綴避免與真實 PointerID (數字) 衝突
                    activePointers.set(`sim_${note.pos}_${note.time}`, sensorId);
                }
            }

            // A. 處理 Riser (Touch Hold 長音)
            const noteId = `riser_${note.pos}_${note.time}`;
            const isInsideHold = note.type === "touch" && note.holdDuration > 0 && noteT <= 0 && -noteT < note.holdDuration;

            if (isInsideHold) {
                if (!note.riserActive) {
                    const soundOffset = -noteT;
                    audioManager.startLongSound(noteId, 'touchHold_riser', soundOffset);
                    note.riserActive = true;
                }
            } else if (note.riserActive) {
                audioManager.stopLongSound(noteId);
                note.riserActive = false;
            }

            // B. 處理開始打擊音效 (Tap / Slide Start / Hold Start)
            if (noteT <= 0 && !note.startEffectPlayed) {
                // 排除連鎖滑軌的非首個箭頭音效
                if (!(note.type === "slide" && !note.firstSlide)) {
                    audioManager.queueSound(note, note.time + (note.slideDelay ?? 0));
                }
                note.startEffectPlayed = true;
            }

            // C. 處理結束音效 (Hold End / Slide End / Hanabi)
            if (-noteT > skipT && !note.endEffectPlayed) {
                if (note.isBreak || note.isHanabi || (note.holdDuration !== undefined && note.type !== "tap")) {
                    audioManager.queueSound(note, note.time + skipT);
                }
                note.endEffectPlayed = true;
            }
        }

        // --- 倒帶或 Slider 拖動時的狀態重置 ---
        if (noteT > 0) {
            note.startEffectPlayed = false;
            note.endEffectPlayed = false;
            if (note.riserActive) {
                audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                note.riserActive = false;
            }
        }

        // --- 將可見音符丟進對應桶子 ---
        if (isVisible) {
            if (note.type === 'slide') buckets.slide.push(note);
            else if (note.type === 'hold') buckets.tapnhold.push(note);
            else if (note.type === 'tap') buckets.tapnhold.push(note);
            else if (note.type === 'touch') buckets.touch.push(note);
        }
    }

    // 4. 依照「圖層順序」渲染
    // 先畫底層 Slide -> Hold -> Tap -> Touch (最上層)
    if (showSensor) drawSensors();
    buckets.slide.forEach(n => drawSlide(n, ctx));
    buckets.tapnhold.forEach(n => n.type === "hold" ? drawHold(n, ctx) : (n.isStar ? drawStar(n, ctx) : drawTap(n, ctx)));
    buckets.touch.forEach(n => drawTouch(n, ctx));

    // 5. 統一更新 Web Audio API 播放佇列
    audioManager.update(globalTime);
}
function drawSensors() {
    const currentlyLitIds = new Set(activePointers.values());
    ctx.save();
    touchPaths.forEach(shape => {
        const isSelected = currentlyLitIds.has(shape.id);
        ctx.fillStyle = isSelected ? '#FFD700' : '#00008080'; // 選中改為金色 : 原本深藍
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSelected ? 1.2 : 0.8; // 選中時邊框加粗

        ctx.fill(shape.path);
        ctx.stroke(shape.path);
    });
    ctx.restore();
}
function simpleEndEffect(t) {
    const decayAlpha = 1 - Math.max(0, - t / effectDecayTime);
    const radius = 0.8 * noteBaseSize * (1 - decayAlpha);

    ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
    ctx.lineWidth = 0.5 * noteBaseSize * decayAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
}
function drawTap(s) {
    const { time: noteTime, pos, isBreak, isDouble } = s;
    const noteT = (noteTime - globalTime);
    const progress = noteT * (speed * 0.8833 + 0.8167);
    const t = 1 - timeFunction(progress);

    if (t < -0.8 || -noteT > effectDecayTime) return;

    const img = images[isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap")];
    if (imgNotExists(img)) return;

    const posInfo = noteRefPos[pos - 1];
    ctx.save();

    if (t >= 1) {
        ctx.translate(posInfo.x, posInfo.y);
        simpleEndEffect(noteT);
    }
    else {
        const displayT = Math.max(distance, t);
        const currentScale = t < distance ? (t + 0.9) / (0.9 + distance) : 1;
        const size = noteBaseSize * currentScale;

        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        /*ctx.font = `3px Arial`;
        ctx.fillText(t, 10, 10);*/
        ctx.rotate(posInfo.rot);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
}
function drawStar(s) {
    const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
    const noteT = (noteTime - globalTime);
    const progress = noteT * (speed * 0.8833 + 0.8167);
    const t = 1 - timeFunction(progress);

    if (t < -0.8 || -noteT > effectDecayTime) return;

    const img = images[isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
        : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"))
    ];
    if (imgNotExists(img)) return;

    const posInfo = noteRefPos[pos - 1];
    ctx.save();

    if (t >= 1) {
        ctx.translate(posInfo.x, posInfo.y);
        simpleEndEffect(noteT);
    }
    else {
        const displayT = Math.max(distance, t);
        const currentScale = t < distance ? (t + 0.9) / (0.9 + distance) : 1;
        const size = noteBaseSize * currentScale;

        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
}
function drawHold(s) {
    const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
    const noteT = (noteTime - globalTime);
    const progress = noteT * (speed * 0.8833 + 0.8167);
    const t = 1 - timeFunction(progress);

    if (t < -0.8 || -noteT > effectDecayTime + holdDuration) return;

    const img = images[isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")];
    if (imgNotExists(img)) return;
    const sizeOffset = t < distance ? 0 :
        Math.min((holdDuration + noteT) * 0.9 * (speed * 0.8833 + 0.8167),
            Math.min((1 - distance) * 2.45,
                Math.min((t - distance) * 2.45,
                    holdDuration * 0.9 * (speed * 0.8833 + 0.8167))));

    const posInfo = noteRefPos[pos - 1];
    ctx.save();
    if (-noteT >= holdDuration) {
        ctx.translate(posInfo.x, posInfo.y);
        simpleEndEffect(holdDuration + noteT);
    }
    else {
        const displayT = Math.min(1, Math.max(distance, t));
        const currentScale = t < distance ? (t + 0.9) / (0.9 + distance) : 1;
        const size = noteBaseSize * currentScale;

        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275); // head
        ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset)); // body
        ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275); // tail
    }
    ctx.restore();
}
function timeFunction(x) {
    return 0.02160482279616 * x * x * x - 0.07553691072 * x * x + 0.43509924 * x + 0.000250029;
}
function drawTouch(s) {
    const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
    if (holdDuration) {
        const imgs = [];
        for (let i = 0; i < 4; i++) {
            const img = images["touchhold_" + i];
            if (imgNotExists(img)) return;
            imgs.push(img);
        }
        const touchPoint = images[isDouble ? "touch_point_each" : "touch_point"];
        const touchBorder = images.touchhold_border;
        if (imgNotExists(touchPoint) || imgNotExists(touchBorder)) return;
        const noteT = (noteTime - globalTime);
        const progress = noteT * (touchSpeed * 0.8833 + 0.8167);
        const t = 1 - timeFunction(progress);

        if (t < -0.8 || -noteT > effectDecayTime + holdDuration) return;

        const size = noteBaseSize * (t < distance ? (t + 0.9) / (0.9 + distance) : 1);
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];
        ctx.save();
        if (-noteT >= holdDuration) {
            ctx.translate(posInfo.x, posInfo.y);
            simpleEndEffect(holdDuration + noteT);
        }
        else {
            const currentScale = 0.8;
            const size = noteBaseSize * 0.7;
            const holdP = Math.max(0, Math.min(1, -noteT / holdDuration));

            let a = touchTimeFunction(11 * (1 - Math.min(1, t)) / 1.5) * 1.6;

            ctx.translate(posInfo.x, posInfo.y);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, size * 1.3, -Math.PI * 0.5, Math.PI * holdP * 2 - Math.PI * 0.5);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(touchBorder, -size * 1.3, -size * 1.3, size * 2.6, size * 2.6);
            ctx.restore();
            ctx.save();
            ctx.translate(posInfo.x, posInfo.y);
            ctx.rotate(Math.PI * -0.75);
            ctx.globalAlpha = Math.max(0, 1 - (1 - Math.min(1, t)) * 0.55);
            for (let i = 0; i < 4; i++) {
                ctx.drawImage(imgs[i], -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                ctx.rotate(Math.PI / 2);
            }
            ctx.globalAlpha = 1;
            ctx.drawImage(touchPoint, -size * 0.2, -size * 0.2, size * 0.4, size * 0.4);
        }
        ctx.restore();
        return;
    }
    const img = images[isDouble ? "touch_each" : "touch"];
    const touchPoint = images[isDouble ? "touch_point_each" : "touch_point"];
    if (imgNotExists(img) || imgNotExists(touchPoint)) return;
    const noteT = (noteTime - globalTime);
    const progress = noteT * (touchSpeed * 0.8833 + 0.8167);
    const t = 1 - timeFunction(progress);

    if (t < -0.8 || -noteT > effectDecayTime) return;

    const size = noteBaseSize * (t < distance ? (t + 0.9) / (0.9 + distance) : 1);
    const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];
    ctx.save();
    if (t >= 1) {
        ctx.translate(posInfo.x, posInfo.y);
        simpleEndEffect(noteT);
    }
    else {
        const currentScale = 0.8;
        const size = noteBaseSize * 0.7;

        let a = touchTimeFunction(11 * (1 - t) / 1.5) * 1.6;

        ctx.translate(posInfo.x, posInfo.y);
        /*ctx.font = `3px Arial`;
        ctx.fillText(1 - (1 - t) / 1.4, 10, 10);*/
        //ctx.rotate(posInfo.rot);
        ctx.globalAlpha = Math.max(0, 1 - (1 - t) * 0.55);
        for (let i = 0; i < 4; i++) {
            ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
            ctx.rotate(Math.PI / 2);
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(touchPoint, -size * 0.2, -size * 0.2, size * 0.4, size * 0.4);
    }
    ctx.restore();
}
function touchTimeFunction(x) {
    return 0.000753454 * x * x * x - 0.0298793 * x * x + 0.375038 * x + 0.104685;
}
function drawSlide(s) {
    const imgs = (() => {
        // 預先判斷 prefix
        const prefix = s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_");
        const standardKey = s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide");

        if (s.slideType === "w") {
            const tempImgs = [];
            for (let i = 0; i < 11; i++) {
                const target = images[prefix + i];
                if (imgNotExists(target)) return []; // 只要缺一張就視為失敗
                tempImgs.push(target);
            }
            return tempImgs;
        }

        // 普通滑軌
        const target = images[standardKey];
        return imgNotExists(target) ? [] : [target];
    })();
    if (!imgs || imgs.length === 0) return;
    const starImg = images[s.isBreak ? "star_break" : (s.isDouble ? "star_each" : "star")];
    const { time: noteTime, pos, slideEnd, isBreak, isDouble, slideDelay, slideDuration, path } = s;

    const noteT = noteTime - globalTime;
    const progress = noteT * (touchSpeed * 0.8833 + 0.8167);
    const t = 1 - timeFunction(progress);

    if (t < distance || -noteT > slideDelay + slideDuration) return;

    const p = path || generatePath(pos, slideEnd);
    if (p.totalLength < 1e-4) return;
    ctx.save();

    const isTaped = -noteT > 0;
    ctx.globalAlpha = isTaped ? 1 : 0.6 * ((t - distance) / (1 - distance));
    let slideProgress = 0;
    if (-noteT > slideDelay) {
        slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
    }
    /*ctx.beginPath();
    //drawPathOnCanvas(ctx, p);
    ctx.closePath();
    ctx.strokeStyle = '#0000ff';
    ctx.lineWidth = 1;
    ctx.stroke();*/

    drawPathWithArrows(ctx, p, slideProgress, imgs, s.slideType === "w");
    const sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);
    if (noteT <= 0 && slideProgress < 1) {
        if (s.hideHead && sz < 1) {
            ctx.restore();
            return;
        }
        const { x, y, rot } = p.getPointAt(slideProgress);

        ctx.globalAlpha = slideDelay < 1e-4 ? 1 : sz;
        ctx.translate(x, y);
        ctx.rotate(rot + Math.PI * 0.5);
        ctx.drawImage(starImg, -noteBaseSize * 0.5 * sz, -noteBaseSize * 0.5 * sz, noteBaseSize * sz, noteBaseSize * sz);
    }

    ctx.restore();
}

function drawPathWithArrows(ctx, recorder, starProgress, imgs, typew, s = { spacing: 4.36 }) {
    if (recorder.totalLength === 0 || !imgs || imgs.length === 0) return;
    // 將參數 t 改名為 starProgress 以避免與內部循環的比例變數 t 衝突
    const arrowCount = typew ? 12 : Math.floor(recorder.totalLength / s.spacing);

    if (typew) s.spacing = 7;
    ctx.save(); // 保護環境

    // 從末端開始往前畫，直到遇到滑星目前的位置 (starProgress)
    for (let i = arrowCount - 1; i > Math.floor(starProgress * arrowCount); i--) {
        //if (i > 2 && typew) continue;
        // WiFi 軌跡通常根據索引選擇對應的扇形段圖片
        const imgIndex = Math.min(i - 1, imgs.length - 1);
        const img = typew ? imgs[imgIndex] : imgs[0];

        if (!img) continue;

        const dist = i * s.spacing + (typew ? wSlideRatio[imgIndex * 4 + 2] : 0);
        const percent = dist / recorder.totalLength; // 這是路徑上的比例

        // 取得該點的座標與切線旋轉角度
        const { x, y, rot } = recorder.getPointAt(percent);

        ctx.save();
        ctx.translate(x, y);

        // 旋轉：rot 是切線方向，+Math.PI 是因為箭頭圖片通常朝向與路徑相反
        ctx.rotate(rot + (typew ? (Math.PI * -0.3745) : Math.PI));

        // 繪製箭頭 (這裡的 0.9 是你的縮放倍率)
        const dw = typew ? wSlideRatio[imgIndex * 4] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 7 * 0.9;
        const dh = typew ? wSlideRatio[imgIndex * 4 + 1] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 9.4 * 0.9;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
    }

    ctx.restore();
}
function drawPathOnCanvas(ctx, recorder) {
    if (recorder.segments.length === 0) return;

    const start = recorder.segments[0].type === 'line'
        ? recorder.segments[0].start
        : { x: recorder.segments[0].cx + recorder.segments[0].r * Math.cos(recorder.segments[0].startAngle), y: recorder.segments[0].cy + recorder.segments[0].r * Math.sin(recorder.segments[0].startAngle) };

    ctx.moveTo(start.x, start.y);
    for (const seg of recorder.segments) {
        if (seg.type === 'line') {
            ctx.lineTo(seg.end.x, seg.end.y);
        } else if (seg.type === 'arc') {
            ctx.arc(seg.cx, seg.cy, seg.r, seg.startAngle, seg.endAngle, seg.diff < 0);
        }
    }
}
function generatePath(startPos, endPos) {
    console.warn("path missing, using straight line as fallback");
    const recorder = new PathRecorder();
    const startInfo = noteRefPos[startPos - 1];
    const endInfo = noteRefPos[endPos - 1];

    recorder.moveTo(startInfo.x, startInfo.y);
    recorder.lineTo(endInfo.x, endInfo.y);

    return recorder;
}