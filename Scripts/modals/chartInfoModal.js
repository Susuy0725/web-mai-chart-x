import { simpleToast, popupWindow, createLabeledInput1, ensureJsMediaTags } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟譜面資訊編輯彈窗
 * @param {Object} options
 * @param {Function} options.getMaidata
 * @param {Function} options.setMaidata
 * @param {Function} options.getBackgroundImage
 * @param {Function} options.setBackgroundImage
 * @param {Object} options.images
 * @param {HTMLElement} options.editorBackgroundImage
 * @param {Object} options.audioManager
 * @param {Function} options.getNowDifficulty
 * @param {Function} options.setNowDifficulty
 * @param {HTMLSelectElement} options.changeDifficulty
 * @param {Function} options.saveMaidata
 * @param {Function} [options.projSet]
 */
export function openChartInfoModal({
    getMaidata,
    setMaidata,
    getBackgroundImage,
    setBackgroundImage,
    images,
    editorBackgroundImage,
    audioManager,
    getNowDifficulty,
    setNowDifficulty,
    changeDifficulty,
    saveMaidata,
    projSet
}) {
    const maidata = getMaidata();
    const tempData = { ...(maidata || {}) };
    const inputRefs = {};

    /**
     * 核心邏輯：處理音訊 Metadata 並更新 tempData 與 UI
     * @param {File} file 音訊檔案
     */
    const processAudioMetadata = async (file) => {
        if (!file) {
            simpleToast({ content: t('toast.noAudioFile'), type: "error" });
            return;
        }

        const applyData = (title, artist) => {
            if (title) {
                tempData.title = title;
                if (inputRefs.title) inputRefs.title.value = title;
            }
            if (artist) {
                tempData.artist = artist;
                if (inputRefs.artist) inputRefs.artist.value = artist;
            }
        };

        // 1. 優先嘗試使用 jsmediatags 讀取 ID3 標籤
        let parsed = false;
        try {
            await ensureJsMediaTags();
            if (window.jsmediatags) {
                parsed = true;
                window.jsmediatags.read(file, {
                    onSuccess: (tag) => {
                        const { title, artist } = tag.tags;
                        applyData(title, artist);
                        simpleToast({ content: t('toast.tagReadSuccess', { title: title || t('popup.chartInfo.noTitle') }), type: "success" });
                    },
                    onError: (error) => {
                        console.warn("jsmediatags 讀取失敗，改用檔名解析:", error);
                        fallbackToFileName(file);
                    }
                });
            }
        } catch (err) {
            console.warn("載入 jsmediatags 失敗，改用檔名解析:", err);
        }
        if (!parsed) {
            fallbackToFileName(file);
        }

        // 2. 備案：從檔名解析 (格式預期為 "作者 - 標題")
        function fallbackToFileName(f) {
            const fileName = f.name.replace(/\.[^/.]+$/, ""); // 去除副檔名
            if (fileName.includes(" - ")) {
                const parts = fileName.split(" - ");
                applyData(parts.slice(1).join(" - ").trim(), parts[0].trim());
            } else {
                applyData(fileName, null);
            }
            simpleToast({ content: t('toast.fileNameParsed'), type: "info" });
        }
    };

    const createPopupContent = () => {
        const container = document.createElement('div');
        container.className = 'chart-info-container';
        const createButton = (text, eventHandler) => {
            const btn = document.createElement('button');
            btn.className = 'chart-info-btn';
            btn.textContent = text;
            if (eventHandler) {
                btn.addEventListener('click', eventHandler);
            }
            return btn;
        };

        // 左側：圖片更換
        const imgContainer = document.createElement('div');
        imgContainer.className = 'chart-info-img-container';
        const img = document.createElement('img');
        img.className = 'chart-info-img';
        const backgroundImage = getBackgroundImage();
        img.src = backgroundImage ? URL.createObjectURL(backgroundImage) : images['no_image'].src;

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'chart-info-img-wrapper';

        const overlay = document.createElement('div');
        overlay.className = 'chart-info-overlay';
        overlay.textContent = t('popup.chartInfo.clickToChangeImage');

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(overlay);
        imgWrapper.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const objectUrl = URL.createObjectURL(file);
                    img.src = objectUrl;
                    setBackgroundImage(file);
                    if (editorBackgroundImage) {
                        editorBackgroundImage.src = objectUrl;
                        editorBackgroundImage.style.display = 'block';
                    }
                    if (typeof projSet === 'function') projSet('background_image', file);
                }
            };
            fileInput.click();
        });
        imgContainer.appendChild(imgWrapper);
        imgContainer.appendChild(createButton(t('popup.chartInfo.readFromTrack'), () => {
            processAudioMetadata(audioManager.bgmFile);
        }));
        imgContainer.appendChild(createButton(t('popup.chartInfo.readOtherMetadata'), () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'audio/*';
            fileInput.onchange = (e) => processAudioMetadata(e.target.files[0]);
            fileInput.click();
        }));

        // 右側：輸入欄位
        const diffContainer = document.createElement('div');
        diffContainer.className = 'chart-info-diff-container';

        // 建立主要欄位並存入 inputRefs (使用 createLabeledInput1)
        const titleField = createLabeledInput1({ value: tempData.title, labelText: t('popup.chartInfo.titleLabel'), type: 'text', assign: "title", data: tempData, ref: inputRefs });
        const artistField = createLabeledInput1({ value: tempData.artist, labelText: t('popup.chartInfo.artistLabel'), type: 'text', assign: "artist", data: tempData, ref: inputRefs });
        const descField = createLabeledInput1({ value: tempData.des, labelText: t('popup.chartInfo.designerLabel'), type: 'text', assign: "des", data: tempData, ref: inputRefs });

        diffContainer.append(titleField.wrapper, artistField.wrapper, descField.wrapper);

        // 難度選擇與等級 (使用 createLabeledInput1 的 select)
        const nowDifficulty = getNowDifficulty();
        const dropdownField = createLabeledInput1({
            value: nowDifficulty || "5",
            labelText: t('popup.chartInfo.diffLabel'),
            type: 'select',
            assign: 'difficulty',
            data: tempData,
            ref: inputRefs,
            options: [
                { value: "7", label: "ORIGINAL" }, { value: "6", label: "RE:MASTER" },
                { value: "5", label: "MASTER" }, { value: "4", label: "EXPERT" },
                { value: "3", label: "ADVANCED" }, { value: "2", label: "BASIC" }, { value: "1", label: "EASY" }
            ]
        });

        dropdownField.input.addEventListener('change', (e) => {
            tempData.difficulty = e.target.value;
            updateDiffFields(e.target.value);
        });

        const infoText = document.createElement('div');
        const updateDiffFields = (diff) => {
            infoText.innerHTML = "";
            const lv = createLabeledInput1({ value: tempData[`lv_${diff}`], labelText: t('popup.chartInfo.levelLabel'), type: 'text', assign: `lv_${diff}`, data: tempData, ref: inputRefs });
            const des = createLabeledInput1({ value: tempData[`des_${diff}`], labelText: t('popup.chartInfo.designerDiffLabel'), type: 'text', assign: `des_${diff}`, data: tempData, ref: inputRefs });
            infoText.append(lv.wrapper, des.wrapper);
        };

        // 🌟 關鍵修正：這裡改塞整個 wrapper，灰色小字才會出來
        diffContainer.appendChild(dropdownField.wrapper);
        diffContainer.appendChild(infoText);

        // 初始觸發一次，帶入目前的 select 值
        updateDiffFields(dropdownField.input.value);

        // 自訂指令
        const excludedKeys = new Set(["title", "artist", "des", "first", "difficulty"]);
        const insVal = Object.keys(tempData)
            .filter(key => !excludedKeys.has(key) && !key.startsWith('lv_') && !key.startsWith('des_') && !key.startsWith('inote_'))
            .map(key => `&${key} = ${tempData[key]}`)
            .join("\n");
        const customIns = createLabeledInput1({ value: insVal, labelText: t('popup.chartInfo.customLabel'), type: 'textarea', assign: "custom", data: tempData, ref: inputRefs });
        diffContainer.appendChild(customIns.wrapper);

        container.appendChild(imgContainer);
        container.appendChild(diffContainer);
        return container;
    };

    popupWindow({
        title: t('popup.chartInfo.title'),
        customContent: createPopupContent(),
        buttons: [
            {
                text: t('popup.ok'),
                onClick: (closePopup) => {
                    let curMaidata = getMaidata();
                    if (!curMaidata) {
                        curMaidata = {};
                        setMaidata(curMaidata);
                    }
                    // 將 tempData 寫回 maidata
                    Object.assign(curMaidata, tempData);

                    // 處理自訂指令解析
                    if (typeof tempData.custom === 'string') {
                        tempData.custom.split(/\n/).forEach(line => {
                            const match = line.trim().match(/^&?([^=]+)=(.*)$/);
                            if (match) curMaidata[match[1].trim()] = match[2].trim();
                        });
                    }

                    if (tempData.difficulty) {
                        setNowDifficulty(tempData.difficulty);
                        if (typeof changeDifficulty !== 'undefined' && changeDifficulty) {
                            changeDifficulty.value = tempData.difficulty;
                        }
                    }
                    saveMaidata();
                    closePopup();
                },
                hideOnClick: true
            },
            { text: t('popup.cancel'), hideOnClick: true }
        ]
    });
}
