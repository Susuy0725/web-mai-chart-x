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
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;font-size:13px;width:100%;min-width:250px;';

    const createInput = (label, placeholder = '') => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        row.innerHTML = `<label style="font-weight:500;color:#ddd;">${label}</label>`;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.style.cssText = 'background:#222;color:#fff;border:1px solid #555;padding:6px;border-radius:4px;';
        row.appendChild(input);
        return { row, input };
    };

    const createSelect = (label, options) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        row.innerHTML = `<label style="font-weight:500;color:#ddd;">${label}</label>`;
        const select = document.createElement('select');
        select.style.cssText = 'background:#222;color:#fff;border:1px solid #555;padding:6px;border-radius:4px;cursor:pointer;';

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            select.appendChild(el);
        });

        row.appendChild(select);
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
    searchBtn.style.cssText = 'padding:10px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500;margin-top:8px;transition:background 0.2s;';
    searchBtn.onmouseover = () => searchBtn.style.background = '#0052a3';
    searchBtn.onmouseout = () => searchBtn.style.background = '#0066cc';

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
            if (rawType.includes('DX') || chart.is_dx || chart.songs?.is_dx) {
                chartType = 'DX';
            } else if (rawType.includes('STD') || rawType.includes('STANDARD') || chart.is_std || chart.songs?.is_std) {
                chartType = 'STD';
            } else {
                chartType = rawType;
            }

            const groupKey = `${songTitle}___${chartType}`;
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

        const resultContainer = document.createElement('div');
        resultContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto;padding-right:4px;';

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
            const sortedCharts = [...group.charts].sort((a, b) => {
                const orderA = diffOrder[(a.difficulty || '').toUpperCase()] ?? 99;
                const orderB = diffOrder[(b.difficulty || '').toUpperCase()] ?? 99;
                return orderA - orderB;
            });

            const diffListContainer = document.createElement('div');
            diffListContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0;';

            const subTitle = document.createElement('div');
            subTitle.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:4px;';
            subTitle.textContent = `${group.song.artist || ''}${group.song.version ? ' · ' + group.song.version : ''}`;
            diffListContainer.appendChild(subTitle);

            sortedCharts.forEach((chart) => {
                const diffKey = (chart.difficulty || '').toUpperCase();
                const colors = diffColors[diffKey] || { bg: '#555', text: '#fff' };

                const btn = document.createElement('button');
                btn.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#26262a;border:1px solid #3d3d45;border-radius:6px;cursor:pointer;color:#fff;transition:all 0.15s;`;

                const left = document.createElement('div');
                left.style.cssText = 'display:flex;align-items:center;gap:10px;';

                const badge = document.createElement('span');
                badge.textContent = chart.difficulty;
                badge.style.cssText = `padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;background:${colors.bg};color:${colors.text};`;

                const des = document.createElement('span');
                des.textContent = chart.notes_designer ? `${chart.notes_designer}` : '';
                des.style.cssText = 'font-size:12px;color:#888;';

                left.append(badge, des);

                const right = document.createElement('span');
                right.textContent = chart.level ? `Lv.${chart.level}` : '';
                right.style.cssText = 'font-size:14px;font-weight:700;color:#ffcc00;';

                btn.append(left, right);

                btn.onmouseenter = () => { btn.style.background = '#303038'; btn.style.borderColor = colors.bg; };
                btn.onmouseleave = () => { btn.style.background = '#26262a'; btn.style.borderColor = '#3d3d45'; };

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

        songGroups.forEach((group) => {
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:#26262a;border:1px solid #3d3d45;border-radius:6px;padding:10px 12px;cursor:pointer;transition:border-color 0.15s, background 0.15s;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-weight:600;font-size:14px;color:#fff;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

            const titleText = document.createElement('span');
            titleText.textContent = group.title;
            titleEl.appendChild(titleText);

            if (group.chartType) {
                const typeTag = document.createElement('span');
                typeTag.textContent = group.chartType;
                const isDx = group.chartType === 'DX';
                typeTag.style.cssText = `font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:${isDx ? '#ff4081' : '#00bcd4'};color:#fff;`;
                titleEl.appendChild(typeTag);
            }

            const metaEl = document.createElement('div');
            metaEl.style.cssText = 'font-size:11px;color:#888;white-space:nowrap;';
            const metaParts = [];
            if (group.song.version) metaParts.push(group.song.version);
            if (group.song.artist) metaParts.push(group.song.artist);
            metaEl.textContent = metaParts.join(' · ');

            header.append(titleEl, metaEl);

            const sortedCharts = [...group.charts].sort((a, b) => {
                const orderA = diffOrder[(a.difficulty || '').toUpperCase()] ?? 99;
                const orderB = diffOrder[(b.difficulty || '').toUpperCase()] ?? 99;
                return orderA - orderB;
            });

            const badgesRow = document.createElement('div');
            badgesRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';

            sortedCharts.forEach((chart) => {
                const diffKey = (chart.difficulty || '').toUpperCase();
                const colors = diffColors[diffKey] || { bg: '#555', text: '#fff' };

                const badge = document.createElement('span');
                badge.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;background:${colors.bg};color:${colors.text};cursor:pointer;user-select:none;transition:opacity 0.15s, transform 0.1s;`;
                badge.innerHTML = `<span>${chart.difficulty}</span>${chart.level ? `<span style="font-weight:700;opacity:0.9;">${chart.level}</span>` : ''}`;

                badge.onmouseenter = () => { badge.style.opacity = '0.85'; badge.style.transform = 'scale(1.05)'; };
                badge.onmouseleave = () => { badge.style.opacity = '1'; badge.style.transform = 'scale(1)'; };

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

            card.onmouseenter = () => { card.style.borderColor = '#0066cc'; card.style.background = '#303036'; };
            card.onmouseleave = () => { card.style.borderColor = '#3d3d45'; card.style.background = '#26262a'; };

            resultContainer.appendChild(card);
        });

        resultPopupCtx = popupWindow({
            title: t('popup.fetchMainote.searchResults', { count: result.length }),
            customContent: resultContainer,
            buttons: [{ text: t('popup.close'), hideOnClick: true }]
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
