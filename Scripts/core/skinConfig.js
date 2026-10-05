/**
 * 遊戲皮膚資源配置與解析器 (Skin Path Resolver)
 * 支援 MajdataPlay 規範的 Default / Shared 多層級備選回退機制：
 * 1. 優先嘗試 Skin/Default/{type}/{fileName}
 * 2. 若 Default 不存在，嘗試 Skin/Shared/{type}/{fileName} (或 Skin/Shared/{fileName})
 * 3. 降級保底原有的 Skin/{fileName}
 */

export const defaultSkinMap = {
    "no_image": "no_image.png",
    "judge_text_break": "JudgeTextSkins/judge_text_cPerfect_break.png",
    "hold": "HoldSkins/hold.png",
    "hold_break": "HoldSkins/hold_break.png",
    "hold_break_mine": "HoldSkins/hold_break_mine.png",
    "hold_break_mine_on": "HoldSkins/hold_break_mine_on.png",
    "hold_break_on": "HoldSkins/hold_break_on.png",
    "hold_each": "HoldSkins/hold_each.png",
    "hold_each_on": "HoldSkins/hold_each_on.png",
    "hold_ex": "HoldSkins/hold_ex.png",
    "hold_mine": "HoldSkins/hold_mine.png",
    "hold_mine_on": "HoldSkins/hold_mine_on.png",
    "hold_off": "HoldSkins/hold_off.png",
    "hold_on": "HoldSkins/hold_on.png",
    "fast": "JudgeTextSkins/fast.png",
    "judge_text_break_0": "JudgeTextSkins/judge_text_break_0.png",
    "judge_text_break_1000": "JudgeTextSkins/judge_text_break_1000.png",
    "judge_text_break_1250": "JudgeTextSkins/judge_text_break_1250.png",
    "judge_text_break_1500": "JudgeTextSkins/judge_text_break_1500.png",
    "judge_text_break_2000": "JudgeTextSkins/judge_text_break_2000.png",
    "judge_text_break_2500": "JudgeTextSkins/judge_text_break_2500.png",
    "judge_text_break_2550": "JudgeTextSkins/judge_text_break_2550.png",
    "judge_text_break_2600": "JudgeTextSkins/judge_text_break_2600.png",
    "judge_text_break_2600_shine": "JudgeTextSkins/judge_text_break_2600_shine.png",
    "judge_text_cPerfect": "JudgeTextSkins/judge_text_cPerfect.png",
    "judge_text_cPerfect_break": "JudgeTextSkins/judge_text_cPerfect_break.png",
    "judge_text_good": "JudgeTextSkins/judge_text_good.png",
    "judge_text_great": "JudgeTextSkins/judge_text_great.png",
    "judge_text_miss": "JudgeTextSkins/judge_text_miss.png",
    "judge_text_normal": "JudgeTextSkins/judge_text_normal.png",
    "judge_text_perfect": "JudgeTextSkins/judge_text_perfect.png",
    "judge_text_perfect_break": "JudgeTextSkins/judge_text_perfect_break.png",
    "late": "JudgeTextSkins/late.png",
    "Break": "NoteGuideSkins/Break.png",
    "Each": "NoteGuideSkins/Each.png",
    "EachLine1": "NoteGuideSkins/EachLine1.png",
    "EachLine2": "NoteGuideSkins/EachLine2.png",
    "EachLine3": "NoteGuideSkins/EachLine3.png",
    "EachLine4": "NoteGuideSkins/EachLine4.png",
    "Hold_Break_End": "NoteGuideSkins/Hold_Break_End.png",
    "Hold_Each_End": "NoteGuideSkins/Hold_Each_End.png",
    "Hold_End": "NoteGuideSkins/Hold_End.png",
    "Hold_Mine_End": "NoteGuideSkins/Hold_Mine_End.png",
    "Mine": "NoteGuideSkins/Mine.png",
    "Normal": "NoteGuideSkins/Normal.png",
    "Slide": "NoteGuideSkins/Slide.png",
    "just_curv_l": "SlideOKSkins/just_curv_l.png",
    "just_curv_l_fast_gd": "SlideOKSkins/just_curv_l_fast_gd.png",
    "just_curv_l_fast_gr": "SlideOKSkins/just_curv_l_fast_gr.png",
    "just_curv_l_fast_p": "SlideOKSkins/just_curv_l_fast_p.png",
    "just_curv_l_late_gd": "SlideOKSkins/just_curv_l_late_gd.png",
    "just_curv_l_late_gr": "SlideOKSkins/just_curv_l_late_gr.png",
    "just_curv_l_late_p": "SlideOKSkins/just_curv_l_late_p.png",
    "just_curv_l_p": "SlideOKSkins/just_curv_l_p.png",
    "just_curv_r": "SlideOKSkins/just_curv_r.png",
    "just_curv_r_fast_gd": "SlideOKSkins/just_curv_r_fast_gd.png",
    "just_curv_r_fast_gr": "SlideOKSkins/just_curv_r_fast_gr.png",
    "just_curv_r_fast_p": "SlideOKSkins/just_curv_r_fast_p.png",
    "just_curv_r_late_gd": "SlideOKSkins/just_curv_r_late_gd.png",
    "just_curv_r_late_gr": "SlideOKSkins/just_curv_r_late_gr.png",
    "just_curv_r_late_p": "SlideOKSkins/just_curv_r_late_p.png",
    "just_curv_r_p": "SlideOKSkins/just_curv_r_p.png",
    "just_str_l": "SlideOKSkins/just_str_l.png",
    "just_str_l_fast_gd": "SlideOKSkins/just_str_l_fast_gd.png",
    "just_str_l_fast_gr": "SlideOKSkins/just_str_l_fast_gr.png",
    "just_str_l_fast_p": "SlideOKSkins/just_str_l_fast_p.png",
    "just_str_l_late_gd": "SlideOKSkins/just_str_l_late_gd.png",
    "just_str_l_late_gr": "SlideOKSkins/just_str_l_late_gr.png",
    "just_str_l_late_p": "SlideOKSkins/just_str_l_late_p.png",
    "just_str_l_p": "SlideOKSkins/just_str_l_p.png",
    "just_str_r": "SlideOKSkins/just_str_r.png",
    "just_str_r_fast_gd": "SlideOKSkins/just_str_r_fast_gd.png",
    "just_str_r_fast_gr": "SlideOKSkins/just_str_r_fast_gr.png",
    "just_str_r_fast_p": "SlideOKSkins/just_str_r_fast_p.png",
    "just_str_r_late_gd": "SlideOKSkins/just_str_r_late_gd.png",
    "just_str_r_late_gr": "SlideOKSkins/just_str_r_late_gr.png",
    "just_str_r_late_p": "SlideOKSkins/just_str_r_late_p.png",
    "just_str_r_p": "SlideOKSkins/just_str_r_p.png",
    "just_wifi_d": "SlideOKSkins/just_wifi_d.png",
    "just_wifi_d_fast_gd": "SlideOKSkins/just_wifi_d_fast_gd.png",
    "just_wifi_d_fast_gr": "SlideOKSkins/just_wifi_d_fast_gr.png",
    "just_wifi_d_fast_p": "SlideOKSkins/just_wifi_d_fast_p.png",
    "just_wifi_d_late_gd": "SlideOKSkins/just_wifi_d_late_gd.png",
    "just_wifi_d_late_gr": "SlideOKSkins/just_wifi_d_late_gr.png",
    "just_wifi_d_late_p": "SlideOKSkins/just_wifi_d_late_p.png",
    "just_wifi_d_p": "SlideOKSkins/just_wifi_d_p.png",
    "just_wifi_u": "SlideOKSkins/just_wifi_u.png",
    "just_wifi_u_fast_gd": "SlideOKSkins/just_wifi_u_fast_gd.png",
    "just_wifi_u_fast_gr": "SlideOKSkins/just_wifi_u_fast_gr.png",
    "just_wifi_u_fast_p": "SlideOKSkins/just_wifi_u_fast_p.png",
    "just_wifi_u_late_gd": "SlideOKSkins/just_wifi_u_late_gd.png",
    "just_wifi_u_late_gr": "SlideOKSkins/just_wifi_u_late_gr.png",
    "just_wifi_u_late_p": "SlideOKSkins/just_wifi_u_late_p.png",
    "just_wifi_u_p": "SlideOKSkins/just_wifi_u_p.png",
    "miss_curv_l": "SlideOKSkins/miss_curv_l.png",
    "miss_curv_r": "SlideOKSkins/miss_curv_r.png",
    "miss_str_l": "SlideOKSkins/miss_str_l.png",
    "miss_str_r": "SlideOKSkins/miss_str_r.png",
    "miss_wifi_d": "SlideOKSkins/miss_wifi_d.png",
    "miss_wifi_u": "SlideOKSkins/miss_wifi_u.png",
    "toofast_curv_l": "SlideOKSkins/toofast_curv_l.png",
    "toofast_curv_r": "SlideOKSkins/toofast_curv_r.png",
    "toofast_str_l": "SlideOKSkins/toofast_str_l.png",
    "toofast_str_r": "SlideOKSkins/toofast_str_r.png",
    "toofast_wifi_d": "SlideOKSkins/toofast_wifi_d.png",
    "toofast_wifi_u": "SlideOKSkins/toofast_wifi_u.png",
    "slide": "SlideSkins/slide.png",
    "slide_break": "SlideSkins/slide_break.png",
    "slide_break_mine": "SlideSkins/slide_break_mine.png",
    "slide_each": "SlideSkins/slide_each.png",
    "slide_mine": "SlideSkins/slide_mine.png",
    "star": "StarSkins/star.png",
    "star_break": "StarSkins/star_break.png",
    "star_break_double": "StarSkins/star_break_double.png",
    "star_break_double_mine": "StarSkins/star_break_double_mine.png",
    "star_break_mine": "StarSkins/star_break_mine.png",
    "star_double": "StarSkins/star_double.png",
    "star_double_mine": "StarSkins/star_double_mine.png",
    "star_each": "StarSkins/star_each.png",
    "star_each_double": "StarSkins/star_each_double.png",
    "star_ex": "StarSkins/star_ex.png",
    "star_ex_double": "StarSkins/star_ex_double.png",
    "star_mine": "StarSkins/star_mine.png",
    "tap": "TapSkins/tap.png",
    "tap_break": "TapSkins/tap_break.png",
    "tap_break_mine": "TapSkins/tap_break_mine.png",
    "tap_each": "TapSkins/tap_each.png",
    "tap_ex": "TapSkins/tap_ex.png",
    "tap_mine": "TapSkins/tap_mine.png",
    "touchhold_0": "TouchHoldSkins/touchhold_0.png",
    "touchhold_1": "TouchHoldSkins/touchhold_1.png",
    "touchhold_2": "TouchHoldSkins/touchhold_2.png",
    "touchhold_3": "TouchHoldSkins/touchhold_3.png",
    "touchhold_border": "TouchHoldSkins/touchhold_border.png",
    "touchhold_break_0": "TouchHoldSkins/touchhold_break_0.png",
    "touchhold_break_1": "TouchHoldSkins/touchhold_break_1.png",
    "touchhold_break_2": "TouchHoldSkins/touchhold_break_2.png",
    "touchhold_break_3": "TouchHoldSkins/touchhold_break_3.png",
    "touchhold_break_border": "TouchHoldSkins/touchhold_break_border.png",
    "touchhold_break_mine": "TouchHoldSkins/touchhold_break_mine.png",
    "touchhold_mine_0": "TouchHoldSkins/touchhold_mine_0.png",
    "touchhold_mine_1": "TouchHoldSkins/touchhold_mine_1.png",
    "touchhold_mine_2": "TouchHoldSkins/touchhold_mine_2.png",
    "touchhold_mine_3": "TouchHoldSkins/touchhold_mine_3.png",
    "touchhold_off": "TouchHoldSkins/touchhold_off.png",
    "touch": "TouchSkins/touch.png",
    "touch_border_2": "TouchSkins/touch_border_2.png",
    "touch_border_2_each": "TouchSkins/touch_border_2_each.png",
    "touch_border_3": "TouchSkins/touch_border_3.png",
    "touch_border_3_each": "TouchSkins/touch_border_3_each.png",
    "touch_break": "TouchSkins/touch_break.png",
    "touch_break_border_2": "TouchSkins/touch_break_border_2.png",
    "touch_break_border_3": "TouchSkins/touch_break_border_3.png",
    "touch_break_mine": "TouchSkins/touch_break_mine.png",
    "touch_break_mine_border_2": "TouchSkins/touch_break_mine_border_2.png",
    "touch_break_mine_border_3": "TouchSkins/touch_break_mine_border_3.png",
    "touch_break_point": "TouchSkins/touch_break_point.png",
    "touch_break_point_mine": "TouchSkins/touch_break_point_mine.png",
    "touch_each": "TouchSkins/touch_each.png",
    "touch_just": "TouchSkins/touch_just.png",
    "touch_mine": "TouchSkins/touch_mine.png",
    "touch_mine_border_2": "TouchSkins/touch_mine_border_2.png",
    "touch_mine_border_3": "TouchSkins/touch_mine_border_3.png",
    "touch_point": "TouchSkins/touch_point.png",
    "touch_point_each": "TouchSkins/touch_point_each.png",
    "touch_point_mine": "TouchSkins/touch_point_mine.png",
    "wifi_0": "WifiSkins/wifi_0.png",
    "wifi_1": "WifiSkins/wifi_1.png",
    "wifi_10": "WifiSkins/wifi_10.png",
    "wifi_2": "WifiSkins/wifi_2.png",
    "wifi_3": "WifiSkins/wifi_3.png",
    "wifi_4": "WifiSkins/wifi_4.png",
    "wifi_5": "WifiSkins/wifi_5.png",
    "wifi_6": "WifiSkins/wifi_6.png",
    "wifi_7": "WifiSkins/wifi_7.png",
    "wifi_8": "WifiSkins/wifi_8.png",
    "wifi_9": "WifiSkins/wifi_9.png",
    "wifi_break_0": "WifiSkins/wifi_break_0.png",
    "wifi_break_1": "WifiSkins/wifi_break_1.png",
    "wifi_break_10": "WifiSkins/wifi_break_10.png",
    "wifi_break_2": "WifiSkins/wifi_break_2.png",
    "wifi_break_3": "WifiSkins/wifi_break_3.png",
    "wifi_break_4": "WifiSkins/wifi_break_4.png",
    "wifi_break_5": "WifiSkins/wifi_break_5.png",
    "wifi_break_6": "WifiSkins/wifi_break_6.png",
    "wifi_break_7": "WifiSkins/wifi_break_7.png",
    "wifi_break_8": "WifiSkins/wifi_break_8.png",
    "wifi_break_9": "WifiSkins/wifi_break_9.png",
    "wifi_each_0": "WifiSkins/wifi_each_0.png",
    "wifi_each_1": "WifiSkins/wifi_each_1.png",
    "wifi_each_10": "WifiSkins/wifi_each_10.png",
    "wifi_each_2": "WifiSkins/wifi_each_2.png",
    "wifi_each_3": "WifiSkins/wifi_each_3.png",
    "wifi_each_4": "WifiSkins/wifi_each_4.png",
    "wifi_each_5": "WifiSkins/wifi_each_5.png",
    "wifi_each_6": "WifiSkins/wifi_each_6.png",
    "wifi_each_7": "WifiSkins/wifi_each_7.png",
    "wifi_each_8": "WifiSkins/wifi_each_8.png",
    "wifi_each_9": "WifiSkins/wifi_each_9.png",
    "wifi_mine_0": "WifiSkins/wifi_mine_0.png",
    "wifi_mine_1": "WifiSkins/wifi_mine_1.png",
    "wifi_mine_10": "WifiSkins/wifi_mine_10.png",
    "wifi_mine_2": "WifiSkins/wifi_mine_2.png",
    "wifi_mine_3": "WifiSkins/wifi_mine_3.png",
    "wifi_mine_4": "WifiSkins/wifi_mine_4.png",
    "wifi_mine_5": "WifiSkins/wifi_mine_5.png",
    "wifi_mine_6": "WifiSkins/wifi_mine_6.png",
    "wifi_mine_7": "WifiSkins/wifi_mine_7.png",
    "wifi_mine_8": "WifiSkins/wifi_mine_8.png",
    "wifi_mine_9": "WifiSkins/wifi_mine_9.png",
    "NormalArc": "NoteGuideSkins/Normal.png",
    "BreakArc": "NoteGuideSkins/Break.png",
    "EachArc": "NoteGuideSkins/Each.png",
    "SlideArc": "NoteGuideSkins/Slide.png",
    "MineArc": "NoteGuideSkins/Mine.png",
    "touch_border_2_mine": "TouchSkins/touch_mine_border_2.png",
    "touch_border_3_mine": "TouchSkins/touch_mine_border_3.png",
    "touch_point_break": "TouchSkins/touch_break_point.png",
    "touchhold_0_mine": "TouchHoldSkins/touchhold_mine_0.png",
    "touchhold_1_mine": "TouchHoldSkins/touchhold_mine_1.png",
    "touchhold_2_mine": "TouchHoldSkins/touchhold_mine_2.png",
    "touchhold_3_mine": "TouchHoldSkins/touchhold_mine_3.png",
    "touchhold_border_mine": "TouchHoldSkins/touchhold_break_mine.png"
};

export const skinAliases = {
    'NormalArc': 'Normal',
    'Normal': 'NormalArc',
    'BreakArc': 'Break',
    'Break': 'BreakArc',
    'EachArc': 'Each',
    'Each': 'EachArc',
    'SlideArc': 'Slide',
    'Slide': 'SlideArc',
    'MineArc': 'Mine',
    'Mine': 'MineArc',
    'judge_text_normal': 'judge_text_cPerfect',
    'judge_text_cPerfect': 'judge_text_normal',
    'judge_text_break': 'judge_text_cPerfect_break',
    'judge_text_cPerfect_break': 'judge_text_break',
    'touch_border_2_mine': 'touch_mine_border_2',
    'touch_mine_border_2': 'touch_border_2_mine',
    'touch_border_3_mine': 'touch_mine_border_3',
    'touch_mine_border_3': 'touch_border_3_mine',
    'touch_point_break': 'touch_break_point',
    'touch_break_point': 'touch_point_break',
    'touchhold_0_mine': 'touchhold_mine_0',
    'touchhold_mine_0': 'touchhold_0_mine',
    'touchhold_1_mine': 'touchhold_mine_1',
    'touchhold_mine_1': 'touchhold_1_mine',
    'touchhold_2_mine': 'touchhold_mine_2',
    'touchhold_mine_2': 'touchhold_2_mine',
    'touchhold_3_mine': 'touchhold_mine_3',
    'touchhold_mine_3': 'touchhold_3_mine',
    'touchhold_border_mine': 'touchhold_break_mine',
    'touchhold_break_mine': 'touchhold_border_mine'
};

export function inferSkinType(key) {
    const lk = key.toLowerCase();
    if (lk.startsWith('tap')) return 'TapSkins';
    if (lk.startsWith('touchhold')) return 'TouchHoldSkins';
    if (lk.startsWith('touch')) return 'TouchSkins';
    if (lk.startsWith('hold_') && lk.includes('_end')) return 'NoteGuideSkins';
    if (lk.startsWith('hold')) return 'HoldSkins';
    if (lk.startsWith('star')) return 'StarSkins';
    if (lk.startsWith('wifi_')) return 'WifiSkins';
    if (lk.startsWith('just_') || lk.startsWith('miss_') || lk.startsWith('toofast_')) return 'SlideOKSkins';
    if (lk.startsWith('judge_text') || lk === 'fast' || lk === 'late') return 'JudgeTextSkins';
    if (lk.endsWith('arc') || lk.startsWith('eachline')) return 'NoteGuideSkins';
    if (lk.startsWith('slide')) return 'SlideSkins';
    return null;
}

export const sharedAssetKeys = new Set([
    'no_image',
    'ColorBall',
    'HexEffect',
    'StarEffect',
    'outline',
    'TouchEffparts_01',
    'TouchEffparts_02'
]);

/**
 * 取得指定 key 的所有可能皮膚候選路徑 (依優先序排列)
 * 1. Skin/Default/{type}/{fileName}
 * 2. Skin/Shared/{type}/{fileName} 或 Skin/Shared/{fileName}
 * 3. Skin/{fileName} (根目錄 fallback)
 * @param {string} key 
 * @param {string} baseURL 
 * @returns {string[]}
 */
export function getSkinCandidateUrls(key, baseURL) {
    // 若該素材屬於純共用素材 (Shared)，優先從 Shared 載入以避免不必要的 Default 404 紀錄
    if (sharedAssetKeys.has(key)) {
        return [
            `${baseURL}Shared/${key}.png`,
            `${baseURL}Default/${key}.png`,
            `${baseURL}${key}.png`
        ];
    }

    const urls = [];
    const rel = defaultSkinMap[key] || defaultSkinMap[key.toLowerCase()];

    if (rel) {
        // rel 形如 "TapSkins/tap.png"
        urls.push(`${baseURL}Default/${rel}`);
        urls.push(`${baseURL}Shared/${rel}`);
        urls.push(`${baseURL}Shared/${key}.png`);
        urls.push(`${baseURL}${key}.png`);
    } else {
        const type = inferSkinType(key);
        if (type) {
            urls.push(`${baseURL}Default/${type}/${key}.png`);
            urls.push(`${baseURL}Shared/${type}/${key}.png`);
        }
        urls.push(`${baseURL}Default/${key}.png`);
        urls.push(`${baseURL}Shared/${key}.png`);
        urls.push(`${baseURL}${key}.png`);
    }

    // 若有別名且目前候選可能失敗，追加別名的候選路徑作為後備
    const alias = skinAliases[key];
    if (alias && alias !== key) {
        const aliasRel = defaultSkinMap[alias] || defaultSkinMap[alias.toLowerCase()];
        if (aliasRel) {
            urls.push(`${baseURL}Default/${aliasRel}`);
            urls.push(`${baseURL}Shared/${aliasRel}`);
            urls.push(`${baseURL}Shared/${alias}.png`);
            urls.push(`${baseURL}${alias}.png`);
        } else {
            const aliasType = inferSkinType(alias);
            if (aliasType) {
                urls.push(`${baseURL}Default/${aliasType}/${alias}.png`);
                urls.push(`${baseURL}Shared/${aliasType}/${alias}.png`);
            }
            urls.push(`${baseURL}Default/${alias}.png`);
            urls.push(`${baseURL}Shared/${alias}.png`);
            urls.push(`${baseURL}${alias}.png`);
        }
    }

    // 針對 judge_text_break 與 no_image 特殊回退保護
    if (key === 'judge_text_break') {
        urls.push(`${baseURL}Default/JudgeTextSkins/judge_text_cPerfect_break.png`);
        urls.push(`${baseURL}Default/JudgeTextSkins/judge_text_perfect_break.png`);
        urls.push(`${baseURL}Shared/JudgeTextSkins/judge_text_cPerfect_break.png`);
        urls.push(`${baseURL}Shared/JudgeTextSkins/judge_text_perfect_break.png`);
    } else if (key === 'no_image') {
        urls.push(`${baseURL}Shared/no_image.png`);
        urls.push(`${baseURL}no_image.png`);
    }

    return Array.from(new Set(urls));
}
