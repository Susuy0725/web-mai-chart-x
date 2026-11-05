import { ensureSupabase, popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { projectCreate, projectUpdateName } from '../indexDB.js';

const SUPABASE_CONFIG = {
    url: "https://tntzyagdhlrdeswyrsjw.supabase.co",
    key: "sb_publishable_eoR0itFK2HCrDAMd-6Jbxg_OYCkGWTJ"
};

/**
 * 查詢 Supabase 譜面資料庫
 */
export async function getLevelCharts(client, {
    level = "",
    version = "",
    difficulty = "",
    category = "",
    songTitle = "",
} = {}) {
    try {
        let query = client
            .from('charts')
            .select('*, songs!inner(*)');

        if (level) query = query.eq('level', level);
        if (difficulty) query = query.eq('difficulty', difficulty);
        if (version) query = query.eq('songs.version', version);
        if (category) query = query.eq('songs.genre', category);

        if (songTitle) {
            const words = songTitle.trim().split(/\s+/);
            words.forEach(word => {
                query = query.ilike('songs.title', `%${word}%`);
            });
        }

        const { data, error } = await query.order('level', { ascending: false });

        console.log('Supabase 查詢結果:', data, '錯誤訊息:', error);

        if (error) throw error;

        simpleToast({ content: t('toast.chartsFound', { count: data.length }), type: 'success', timeout: 1500 });
        return data;
    } catch (err) {
        console.error('查詢失敗:', err);
        simpleToast({ content: t('toast.chartQueryError', { message: err.message }), type: 'error', timeout: 2000 });
    }
}

/**
 * 開啟 Mainote 譜面搜尋與下載彈窗
 */
export async function openMainoteFetcher({
    audioManager,
    getMaidata,
    setMaidata,
    setNowDifficulty,
    changeDifficulty,
    editorInput,
    getCurrentProjectId,
    setCurrentProjectId,
    setDataEmpty,
    getres,
    applyHighlight,
    saveMaidata,
    resetHistory,
    projSet,
}) {
    let mainctx = null;
    await ensureSupabase();

    const createClient = globalThis.supabase?.createClient;
    if (typeof createClient !== 'function') {
        console.warn('Supabase client not found on globalThis.');
        simpleToast({ content: t('toast.supabaseWarning'), type: 'warning', timeout: 4000 });
        return;
    }

    const client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

    const container = document.createElement('div');
    container.className = 'popup-form-container';

    const createInput = (label, placeholder = '') => {
        const row = document.createElement('div');
        row.className = 'popup-field';
        const lbl = document.createElement('label');
        lbl.className = 'popup-field-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.className = 'popup-input';
        row.append(lbl, input);
        return { row, input };
    };

    const createSelect = (label, options) => {
        const row = document.createElement('div');
        row.className = 'popup-field';
        const lbl = document.createElement('label');
        lbl.className = 'popup-field-label';
        lbl.textContent = label;
        const select = document.createElement('select');
        select.className = 'popup-select';

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            select.appendChild(el);
        });

        row.append(lbl, select);
        return { row, select };
    };

    const levelOptions = [{ value: '', text: t('popup.fetchMainote.allLevels') }];
    for (let i = 1; i <= 6; i++) levelOptions.push({ value: i.toString(), text: `Level ${i}` });
    for (let i = 7; i <= 14; i++) {
        levelOptions.push({ value: i.toString(), text: `Level ${i}` });
        levelOptions.push({ value: i.toString() + '+', text: `Level ${i}+` });
    }
    levelOptions.push({ value: '15', text: `Level 15` });

    const difficultyOptions = [
        { value: '', text: t('popup.fetchMainote.allDifficulties') },
        { value: 'Re:MASTER', text: 'Re:MASTER' },
        { value: 'MASTER', text: 'MASTER' },
        { value: 'EXPERT', text: 'EXPERT' },
        { value: 'ADVANCED', text: 'ADVANCED' },
        { value: 'BASIC', text: 'BASIC' },
        { value: 'EASY', text: 'EASY' },
    ];

    const versionOptions = [
        { value: '', text: t('popup.fetchMainote.allVersions') },
        { value: 'maimai', text: 'maimai' },
        { value: 'maimai PLUS', text: 'maimai PLUS' },
        { value: 'GreeN', text: 'GreeN' },
        { value: 'GreeN PLUS', text: 'GreeN PLUS' },
        { value: 'ORANGE', text: 'ORANGE' },
        { value: 'ORANGE PLUS', text: 'ORANGE PLUS' },
        { value: 'PiNK', text: 'PiNK' },
        { value: 'PiNK PLUS', text: 'PiNK PLUS' },
        { value: 'MURASAKi', text: 'MURASAKi' },
        { value: 'MURASAKi PLUS', text: 'MURASAKi PLUS' },
        { value: 'MiLK', text: 'MiLK' },
        { value: 'MiLK PLUS', text: 'MiLK PLUS' },
        { value: 'FiNALE', text: 'FiNALE' },
        { value: 'でらっくす', text: 'でらっくす (DX)' },
        { value: 'でらっくす PLUS', text: 'でらっくす PLUS' },
        { value: 'Splash', text: 'Splash' },
        { value: 'Splash PLUS', text: 'Splash PLUS' },
        { value: 'UNiVERSE', text: 'UNiVERSE' },
        { value: 'UNiVERSE PLUS', text: 'UNiVERSE PLUS' },
        { value: 'FESTiVAL', text: 'FESTiVAL' },
        { value: 'FESTiVAL PLUS', text: 'FESTiVAL PLUS' },
        { value: 'BUDDiES', text: 'BUDDiES' },
        { value: 'BUDDiES PLUS', text: 'BUDDiES PLUS' },
        { value: 'PRiSM', text: 'PRiSM' },
        { value: 'PRiSM PLUS', text: 'PRiSM PLUS' },
        { value: 'CiRCLE', text: 'CiRCLE' },
        { value: 'CiRCLE PLUS', text: 'CiRCLE PLUS' },
    ];

    const categoryOptions = [
        { value: '', text: t('popup.fetchMainote.allCategories') },
        { value: 'POPS＆アニメ', text: 'POPS & ANIME' },
        { value: 'niconico＆ボーカロイド', text: 'niconico & VOCALOID' },
        { value: '東方Project', text: '東方Project' },
        { value: 'ゲーム＆バラエティ', text: 'GAME & VARIETY' },
        { value: 'maimai', text: 'maimai' },
        { value: 'オンゲキ＆CHUNITHM', text: 'Ongeki & CHUNITHM' }
    ];

    const { row: songRow, input: songInput } = createInput(t('popup.fetchMainote.songTitle'), t('popup.fetchMainote.songTitlePlaceholder'));
    const { row: levelRow, select: levelSelect } = createSelect(t('popup.fetchMainote.level'), levelOptions);
    const { row: difficultyRow, select: difficultySelect } = createSelect(t('popup.fetchMainote.difficulty'), difficultyOptions);
    const { row: versionRow, select: versionSelect } = createSelect(t('popup.fetchMainote.version'), versionOptions);
    const { row: categoryRow, select: categorySelect } = createSelect(t('popup.fetchMainote.category'), categoryOptions);

    container.append(songRow, levelRow, difficultyRow, versionRow, categoryRow);

    const searchBtn = document.createElement('button');
    searchBtn.textContent = t('popup.fetchMainote.btnSearch');
    searchBtn.className = 'popup-btn popup-btn-primary';
    searchBtn.style.marginTop = '8px';

    searchBtn.addEventListener('click', async () => {
        searchBtn.disabled = true;
        searchBtn.textContent = t('popup.fetchMainote.searching');

        const result = await getLevelCharts(client, {
            level: levelSelect.value,
            songTitle: songInput.value,
            version: versionSelect.value,
            category: categorySelect.value,
            difficulty: difficultySelect.value
        });

        if (!result || result.length === 0) {
            simpleToast({ content: t('toast.chartsNotFound'), type: 'warning', timeout: 1800 });
            searchBtn.disabled = false;
            searchBtn.textContent = t('popup.fetchMainote.btnSearch');
            return;
        }

        const diffOrder = { 'EASY': 0, 'BASIC': 1, 'ADVANCED': 2, 'EXPERT': 3, 'MASTER': 4, 'RE:MASTER': 5, 'REMASTER': 5, 'UTAGE': 6 };
        const diffColors = {
            'EASY': { bg: '#00c2ff', text: '#fff' },
            'BASIC': { bg: '#22b14c', text: '#fff' },
            'ADVANCED': { bg: '#ff9800', text: '#fff' },
            'EXPERT': { bg: '#f44336', text: '#fff' },
            'MASTER': { bg: '#9c27b0', text: '#fff' },
            'RE:MASTER': { bg: '#e040fb', text: '#fff' },
            'REMASTER': { bg: '#e040fb', text: '#fff' },
            'UTAGE': { bg: '#ff5722', text: '#fff' }
        };

        const songGroupsMap = new Map();

        result.forEach((chart) => {
            const songTitle = chart.songs?.title || t('popup.fetchMainote.unknownSong');
            const rawType = (chart.type || chart.chart_type || chart.songs?.type || chart.songs?.chart_type || '').toUpperCase();
            let chartType = '';
            if (rawType.includes('DX') || rawType.includes('DELUXE') || chart.is_dx || chart.songs?.is_dx) {
                chartType = 'DX';
            } else if (rawType.includes('STD') || rawType.includes('STANDARD') || chart.is_std || chart.songs?.is_std) {
                chartType = 'STD';
            } else {
                chartType = rawType;
            }

            const songId = chart.songs?.id || chart.song_id;
            const groupKey = songId || `${songTitle}___${chart.songs?.artist || ''}___${chartType}`;
            if (!songGroupsMap.has(groupKey)) {
                songGroupsMap.set(groupKey, {
                    title: songTitle,
                    chartType: chartType,
                    song: chart.songs || {},
                    charts: []
                });
            }
            songGroupsMap.get(groupKey).charts.push(chart);
        });

        const songGroups = Array.from(songGroupsMap.values());

        let resultPopupCtx = null;

        const selectAndLoadChart = (targetChart) => {
            const songTitle = targetChart.songs?.title || targetChart.title || t('popup.fetchMainote.unknownSong');
            const maidataNow = typeof getMaidata === 'function' ? getMaidata() : {};
            const maidataHaveContext = (() => {
                if (audioManager.haveBGM && audioManager.haveBGM()) return true;
                for (let i = 1; i <= 7; i++) {
                    if (maidataNow && maidataNow[`inote_${i}`] && maidataNow[`inote_${i}`].trim() !== "") return true;
                }
                return false;
            })();

            const loadChart = async (mode) => {
                if (mode === 'new') {
                    const newId = await projectCreate(t('popup.projectManager.untitled'));
                    if (typeof setCurrentProjectId === 'function') {
                        setCurrentProjectId(newId);
                    }
                    localStorage.setItem('simai_lastProjectId', newId);
                    console.log(`[Project] 已建立新專案: ${newId}`);
                }

                if (typeof setDataEmpty === 'function') setDataEmpty();

                const diffKey = (targetChart.difficulty || 'MASTER').toUpperCase();
                const diffMap = { 'EASY': 1, 'BASIC': 2, 'ADVANCED': 3, 'EXPERT': 4, 'MASTER': 5, 'RE:MASTER': 6, 'REMASTER': 6, 'UTAGE': 7 };
                const targetDiff = diffMap[diffKey] || 5;

                const newMaidata = {
                    title: songTitle,
                    [`inote_${targetDiff}`]: targetChart.chart_data || ''
                };
                if (typeof setMaidata === 'function') setMaidata(newMaidata);

                if (typeof setNowDifficulty === 'function') setNowDifficulty(targetDiff);
                if (changeDifficulty) changeDifficulty.value = targetDiff;
                if (typeof projSet === 'function') projSet('now_difficulty', targetDiff).catch(() => { });

                if (editorInput) {
                    editorInput.value = newMaidata[`inote_${targetDiff}`] || '';
                    if (typeof getres === 'function') getres(editorInput.value);
                    if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
                }

                if (typeof resetHistory === 'function') resetHistory();
                if (typeof saveMaidata === 'function') saveMaidata();

                const curPid = typeof getCurrentProjectId === 'function' ? getCurrentProjectId() : null;
                const displayName = newMaidata.title || songTitle;
                if (displayName && curPid) {
                    projectUpdateName(curPid, displayName).catch(() => { });
                }

                simpleToast({ content: t('toast.chartLoaded', { title: songTitle }), type: 'success', timeout: 1500 });
                if (resultPopupCtx) resultPopupCtx.close();
                if (mainctx) mainctx.close();
            };

            if (maidataHaveContext) {
                popupWindow({
                    title: t('popup.fetchMainote.loadChartTitle'),
                    content: t('popup.fetchMainote.loadChartConfirm'),
                    buttons: [
                        {
                            text: t('popup.fetchMainote.overwriteProject'),
                            onClick: (ctx) => { ctx.close(); loadChart('overwrite'); }
                        },
                        {
                            text: t('popup.fetchMainote.openNewProject'),
                            onClick: (ctx) => { ctx.close(); loadChart('new'); }
                        },
                        {
                            text: t('popup.fetchMainote.cancel'),
                            hideOnClick: true
                        }
                    ]
                });
            } else {
                loadChart('overwrite');
            }
        };

        const openDifficultySelectPopup = (group) => {
            const chartMapByDiff = new Map();
            group.charts.forEach(c => {
                const dKey = (c.difficulty || '').toUpperCase();
                if (!chartMapByDiff.has(dKey) || (!chartMapByDiff.get(dKey).chart_data && c.chart_data)) {
                    chartMapByDiff.set(dKey, c);
                }
            });
            const sortedCharts = Array.from(chartMapByDiff.values()).sort((a, b) => {
                const orderA = diffOrder[(a.difficulty || '').toUpperCase()] ?? 99;
                const orderB = diffOrder[(b.difficulty || '').toUpperCase()] ?? 99;
                return orderA - orderB;
            });

            const diffListContainer = document.createElement('div');
            diffListContainer.className = 'popup-diff-list';

            const subTitle = document.createElement('div');
            subTitle.style.cssText = 'font-size:12px;color:var(--popup-text-muted, #8e8e93);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            const metaArr = [];
            if (group.song.artist) metaArr.push(group.song.artist);
            if (group.song.version) metaArr.push(group.song.version);
            subTitle.textContent = metaArr.join(' · ');
            if (subTitle.textContent) subTitle.title = subTitle.textContent;
            diffListContainer.appendChild(subTitle);

            sortedCharts.forEach((chart) => {
                const diffKey = (chart.difficulty || '').toUpperCase();
                const colors = diffColors[diffKey] || { bg: '#555', text: '#fff' };

                const btn = document.createElement('button');
                btn.className = 'popup-diff-btn';

                const left = document.createElement('div');
                left.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;';

                const badge = document.createElement('span');
                badge.textContent = chart.difficulty;
                badge.style.cssText = `padding:3px 9px;border-radius:5px;font-size:12px;font-weight:700;background:${colors.bg};color:${colors.text};flex-shrink:0;`;

                const des = document.createElement('span');
                des.textContent = chart.notes_designer ? `${chart.notes_designer}` : '';
                des.style.cssText = 'font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                if (chart.notes_designer) des.title = chart.notes_designer;

                left.append(badge, des);

                const right = document.createElement('span');
                right.textContent = chart.level ? `Lv.${chart.level}` : '';
                right.style.cssText = 'font-size:14px;font-weight:700;color:#ffcc00;flex-shrink:0;margin-left:8px;';

                btn.append(left, right);

                btn.onclick = () => {
                    diffPopupCtx.close();
                    selectAndLoadChart(chart);
                };

                diffListContainer.appendChild(btn);
            });

            const diffPopupCtx = popupWindow({
                title: `${group.title} ${group.chartType ? `[${group.chartType}]` : ''}`,
                customContent: diffListContainer,
                buttons: [{ text: t('popup.close'), hideOnClick: true }]
            });
        };

        const createSongCard = (group) => {
            const card = document.createElement('div');
            card.className = 'popup-song-card';

            const header = document.createElement('div');
            header.className = 'popup-card-header';

            const titleRow = document.createElement('div');
            titleRow.className = 'popup-card-title-row';

            const titleText = document.createElement('div');
            titleText.className = 'popup-card-title';
            titleText.textContent = group.title;
            titleRow.appendChild(titleText);

            if (group.chartType) {
                const typeTag = document.createElement('span');
                typeTag.className = 'popup-card-type-badge';
                const isDx = group.chartType === 'DX' || group.chartType === 'DELUXE';
                typeTag.textContent = isDx ? 'DX' : group.chartType;
                typeTag.style.background = isDx ? '#00AAE7' : '#444';
                titleRow.appendChild(typeTag);
            }

            const metaParts = [];
            if (group.song.version) metaParts.push(group.song.version);
            if (group.song.artist) metaParts.push(group.song.artist);
            const metaStr = metaParts.join(' · ');

            if (metaStr) {
                const metaEl = document.createElement('div');
                metaEl.className = 'popup-card-meta';
                metaEl.textContent = metaStr;
                metaEl.title = metaStr;
                header.append(titleRow, metaEl);
            } else {
                header.appendChild(titleRow);
            }

            const chartMapByDiff = new Map();
            group.charts.forEach(c => {
                const dKey = (c.difficulty || '').toUpperCase();
                if (!chartMapByDiff.has(dKey) || (!chartMapByDiff.get(dKey).chart_data && c.chart_data)) {
                    chartMapByDiff.set(dKey, c);
                }
            });
            const sortedCharts = Array.from(chartMapByDiff.values()).sort((a, b) => {
                const orderA = diffOrder[(a.difficulty || '').toUpperCase()] ?? 99;
                const orderB = diffOrder[(b.difficulty || '').toUpperCase()] ?? 99;
                return orderA - orderB;
            });

            const badgesRow = document.createElement('div');
            badgesRow.className = 'popup-card-badges-row';

            sortedCharts.forEach((chart) => {
                const diffKey = (chart.difficulty || '').toUpperCase();
                const colors = diffColors[diffKey] || { bg: '#555', text: '#fff' };

                const badge = document.createElement('span');
                badge.className = 'popup-card-badge';
                badge.style.background = colors.bg;
                badge.style.color = colors.text;
                badge.title = t('popup.fetchMainote.clickToLoad', { diff: chart.difficulty }) || `載入 ${chart.difficulty} 譜面`;
                badge.innerHTML = `<span>${chart.difficulty}</span>${chart.level ? `<span style="font-weight:700;margin-left:3px;opacity:0.95;">${chart.level}</span>` : ''}`;

                badge.onclick = (e) => {
                    e.stopPropagation();
                    selectAndLoadChart(chart);
                };

                badgesRow.appendChild(badge);
            });

            card.appendChild(header);
            card.appendChild(badgesRow);

            card.onclick = () => {
                if (group.charts.length === 1) {
                    selectAndLoadChart(group.charts[0]);
                } else {
                    openDifficultySelectPopup(group);
                }
            };

            return card;
        };

        // --- 搜尋結果包裝容器與過濾系統 ---
        const wrapper = document.createElement('div');
        wrapper.className = 'popup-search-wrapper';

        const filterRow = document.createElement('div');
        filterRow.className = 'popup-search-filter-row';

        const filterInputWrap = document.createElement('div');
        filterInputWrap.className = 'popup-search-filter-input-wrap';

        const filterIcon = document.createElement('span');
        filterIcon.className = 'material-symbols-outlined popup-search-filter-icon';
        filterIcon.textContent = 'search';

        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'popup-search-filter-input';
        filterInput.placeholder = t('popup.fetchMainote.filterPlaceholder') || '在結果中快速篩選歌名或藝術家...';

        filterInputWrap.append(filterIcon, filterInput);

        const countLabel = document.createElement('div');
        countLabel.className = 'popup-search-count-label';

        filterRow.append(filterInputWrap, countLabel);

        const resultsList = document.createElement('div');
        resultsList.className = 'popup-search-results';

        wrapper.append(filterRow, resultsList);

        // 分批渲染邏輯 (Batch / Infinite Scroll)
        const BATCH_SIZE = 40;
        let currentFiltered = songGroups;
        let renderedCount = 0;
        let loadMoreBtn = null;

        const renderBatch = () => {
            const nextBatch = currentFiltered.slice(renderedCount, renderedCount + BATCH_SIZE);
            if (nextBatch.length === 0) {
                if (renderedCount === 0) {
                    resultsList.innerHTML = `<div style="text-align:center;padding:30px 10px;color:var(--popup-text-muted);font-size:13px;">${t('popup.fetchMainote.noResultsMatch') || '沒有符合篩選條件的歌曲'}</div>`;
                }
                if (loadMoreBtn && loadMoreBtn.parentNode) {
                    loadMoreBtn.remove();
                    loadMoreBtn = null;
                }
                updateCountUI();
                return;
            }

            if (renderedCount === 0) {
                resultsList.innerHTML = '';
            }

            if (loadMoreBtn && loadMoreBtn.parentNode) {
                loadMoreBtn.remove();
                loadMoreBtn = null;
            }

            const fragment = document.createDocumentFragment();
            nextBatch.forEach(group => {
                fragment.appendChild(createSongCard(group));
            });
            resultsList.appendChild(fragment);
            renderedCount += nextBatch.length;

            updateCountUI();

            // 若還有後續項目，提供備用「載入更多」按鈕
            if (renderedCount < currentFiltered.length) {
                loadMoreBtn = document.createElement('div');
                loadMoreBtn.className = 'popup-search-load-more';
                loadMoreBtn.textContent = t('popup.fetchMainote.loadMore') || '載入更多...';
                loadMoreBtn.onclick = () => renderBatch();
                resultsList.appendChild(loadMoreBtn);
            }
        };

        const updateCountUI = () => {
            const shown = Math.min(renderedCount, currentFiltered.length);
            const total = currentFiltered.length;
            countLabel.textContent = t('popup.fetchMainote.showingCount', { shown, total }) || `顯示 ${shown} / ${total} 首歌曲`;
        };

        // 滾動觸發加載下一批
        resultsList.addEventListener('scroll', () => {
            if (renderedCount >= currentFiltered.length) return;
            if (resultsList.scrollTop + resultsList.clientHeight >= resultsList.scrollHeight - 140) {
                renderBatch();
            }
        });

        // 即時篩選
        let filterDebounceTimer = null;
        filterInput.addEventListener('input', () => {
            if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(() => {
                const query = filterInput.value.trim().toLowerCase();
                if (!query) {
                    currentFiltered = songGroups;
                } else {
                    const terms = query.split(/\s+/);
                    currentFiltered = songGroups.filter(g => {
                        const targetText = `${g.title} ${g.song.artist || ''} ${g.song.version || ''} ${g.chartType || ''}`.toLowerCase();
                        return terms.every(term => targetText.includes(term));
                    });
                }
                renderedCount = 0;
                resultsList.scrollTop = 0;
                renderBatch();
            }, 120);
        });

        // 初始渲染第一批
        renderBatch();

        resultPopupCtx = popupWindow({
            title: t('popup.fetchMainote.searchResults', { count: result.length }),
            customContent: wrapper,
            buttons: [{ text: t('popup.close'), hideOnClick: true }],
            width: '92%',
            maxWidth: 720,
        });
        searchBtn.disabled = false;
        searchBtn.textContent = t('popup.fetchMainote.btnSearch');
    });

    container.appendChild(searchBtn);

    mainctx = popupWindow({
        title: t('popup.fetchMainote.title'),
        customContent: container,
        buttons: [{ text: t('popup.close'), hideOnClick: true }]
    });
}
