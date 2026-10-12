/**
 * welcomeModal.js
 * 
 * 初次啟動導覽彈窗 (凍結操作式、Material Design 暗色風格)
 * 涵蓋服務條款確認、舊站資料遷移 (限 tri-dent.cc 網域)、備份包匯入以及歡迎使用流程。
 */

import { t, getCurrentLang, getLangSetting, setLang, getAvailableLanguages, detectDefaultLanguage } from '../i18n.js';
import { openImportSelectionModal } from './maintenanceModal.js';

const STORAGE_KEY = 'wmcx_first_run_completed';

/**
 * 各支援語言的「你好」清單
 */
const GREETINGS = [
    { code: 'zh-TW', name: '繁體中文', text: '你好' },
    { code: 'en', name: 'English', text: 'Hello' },
    { code: 'ja', name: '日本語', text: 'こんにちは' },
    { code: 'zh-CN', name: '简体中文', text: '你好' },
    { code: 'ko', name: '한국어', text: '안녕하세요' }
];

/**
 * 產生語言下拉選單的 option HTML
 */
function renderLanguageOptions() {
    const currentLang = getLangSetting();
    const detected = detectDefaultLanguage();
    const autoLabel = `${t('settings.items.langAuto', {}, detected) || '自動 (Auto)'} 🖥️`;
    const available = getAvailableLanguages();

    let html = `<option value="auto" ${currentLang === 'auto' ? 'selected' : ''}>${autoLabel}</option>`;
    for (const item of available) {
        const isSelected = currentLang === item.code ? 'selected' : '';
        html += `<option value="${item.code}" ${isSelected}>${item.name}</option>`;
    }
    return html;
}

/**
 * 檢查當前網域是否屬於 tri-dent.cc
 * @returns {boolean}
 */
export function isTriDentDomain() {
    try {
        const hostname = window.location.hostname.toLowerCase();
        return hostname.endsWith('tri-dent.cc') || hostname.includes('tri-dent.cc');
    } catch {
        return false;
    }
}

/**
 * 檢查是否需要顯示初次啟動導覽彈窗
 * 僅在初次啟動（資料庫中原本無專案）或網址帶有 first_time=1 時觸發
 * @param {Object} [param0]
 * @param {boolean} [param0.isDatabaseEmpty] 資料庫是否為全新純淨狀態
 * @returns {boolean}
 */
export function shouldShowWelcomeModal({ isDatabaseEmpty = false } = {}) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('first_time') === '1') {
            return true;
        }

        const isCompleted = localStorage.getItem(STORAGE_KEY) === 'true';
        if (isCompleted) {
            return false;
        }

        // 若資料庫內已有專案（既有使用者），自動標記完成且不跳出彈窗
        if (!isDatabaseEmpty) {
            localStorage.setItem(STORAGE_KEY, 'true');
            return false;
        }

        // 資料庫中沒有東西（初次啟動或剛清除完所有資料）
        return true;
    } catch {
        return false;
    }
}

/**
 * 開啟初次啟動導覽彈窗
 * @param {boolean|Object} [options] 若傳入 boolean 則視為 force；亦可傳入 { force, isDatabaseEmpty }
 */
export function showWelcomeModal(options = {}) {
    const force = (typeof options === 'boolean') ? options : !!options?.force;
    const isDatabaseEmpty = (typeof options === 'object') ? !!options?.isDatabaseEmpty : false;

    if (!force && !shouldShowWelcomeModal({ isDatabaseEmpty })) {
        return;
    }

    // 若已存在則避免重複建立
    if (document.getElementById('wmc-welcome-overlay')) {
        return;
    }

    const showMigrateStep = isTriDentDomain();
    const stepSequence = showMigrateStep ? [1, 2, 3, 4] : [1, 3, 4];
    let currentStepIndex = 0;

    // 建立 DOM 結構
    const overlay = document.createElement('div');
    overlay.id = 'wmc-welcome-overlay';
    overlay.className = 'wmc-welcome-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('popup.welcome.welcomeTitle') || 'Welcome');

    overlay.innerHTML = `
        <div class="wmc-welcome-dialog" id="wmc-welcome-dialog">
            <!-- 語言選擇器 (左上角) -->
            <div class="wmc-welcome-lang-selector" id="wmc-welcome-lang-selector" title="Language / 語言">
                <svg class="wmc-welcome-lang-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <select class="wmc-welcome-lang-select" id="wmc-welcome-lang-select" aria-label="Language">
                    ${renderLanguageOptions()}
                </select>
                <svg class="wmc-welcome-lang-chevron" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                    <path d="M7 10l5 5 5-5z"/>
                </svg>
            </div>

            <!-- 步驟一：服務條款與隱私政策 -->
            <div class="wmc-welcome-step" id="wmc-welcome-step-1">
                <div class="wmc-welcome-logo-wrapper">
                    <img src="./favicon.png" alt="Web mai Chart X Logo" class="wmc-welcome-logo" draggable="false" />
                    <div class="wmc-welcome-greeting-badge" id="wmc-welcome-greeting-badge" title="Greetings!">
                        <div class="wmc-welcome-greeting-roller" id="wmc-welcome-greeting-roller">
                            <span class="wmc-welcome-greeting-text current" id="wmc-welcome-greeting-text">你好</span>
                        </div>
                    </div>
                </div>
                <div class="wmc-welcome-brand">Web mai Chart X</div>
                <div class="wmc-welcome-subdesc">${t('popup.welcome.step1Desc')}</div>
                <label class="wmc-welcome-agreement-row">
                    <input type="checkbox" id="wmc-welcome-agree-check" class="wmc-welcome-checkbox" />
                    <span>
                        <span id="wmc-welcome-txt-agree">${t('popup.welcome.agreeText')}</span>
                        <a href="./terms.html" id="wmc-welcome-terms-link" target="_blank" rel="noopener noreferrer">${t('popup.about.termsOfService')}</a>
                        <span id="wmc-welcome-txt-and">${t('popup.welcome.andText')}</span>
                        <a href="./privacy.html" id="wmc-welcome-privacy-link" target="_blank" rel="noopener noreferrer">${t('popup.about.privacyPolicy')}</a>
                    </span>
                </label>
                <button type="button" class="wmc-welcome-btn-full" id="wmc-welcome-next-1" disabled>${t('popup.welcome.nextStep')}</button>
            </div>

            <!-- 步驟二：自舊站遷移資料 (僅在 tri-dent.cc 網域顯示) -->
            ${showMigrateStep ? `
            <div class="wmc-welcome-step" id="wmc-welcome-step-2">
                <div class="wmc-welcome-domain-tag">susuy0725.github.io/web-mai-chart-x/</div>
                <div class="wmc-welcome-arrow-down" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor">
                        <path d="M11 3v10H6.5l5.5 8 5.5-8H13V3h-2z" />
                    </svg>
                </div>
                <div class="wmc-welcome-domain-tag target">chart.tri-dent.cc</div>
                <div class="wmc-welcome-step-title">${t('popup.welcome.migrateTitle')}</div>
                <div class="wmc-welcome-step-desc">${t('popup.welcome.migrateDesc')}</div>
                <div class="wmc-welcome-btn-row">
                    <button type="button" class="wmc-welcome-btn-half primary" id="wmc-welcome-open-migrate">${t('popup.welcome.openMigrateTool')}</button>
                    <button type="button" class="wmc-welcome-btn-half secondary" id="wmc-welcome-skip-migrate">${t('popup.welcome.skip')}</button>
                </div>
            </div>` : ''}

            <!-- 步驟三：匯入備份包 -->
            <div class="wmc-welcome-step" id="wmc-welcome-step-3">
                <div class="wmc-welcome-graphic-row" aria-hidden="true">
                    <div class="wmc-welcome-icon-box">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                            <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10zm-6-8h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2z" />
                        </svg>
                    </div>
                    <div class="wmc-welcome-arrow-right">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                            <path d="M3 11h10V6.5l8 5.5-8 5.5V13H3v-2z" />
                        </svg>
                    </div>
                    <div class="wmc-welcome-icon-box">
                        <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
                            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V9h16v9zm0-11H4V6h16v1z" />
                        </svg>
                    </div>
                </div>
                <div class="wmc-welcome-step-title">${t('popup.welcome.importTitle')}</div>
                <div class="wmc-welcome-step-desc">${t('popup.welcome.importDesc')}</div>
                <div class="wmc-welcome-btn-row">
                    <button type="button" class="wmc-welcome-btn-half primary" id="wmc-welcome-import-backup">${t('popup.welcome.importBackup')}</button>
                    <button type="button" class="wmc-welcome-btn-half secondary" id="wmc-welcome-skip-import">${t('popup.welcome.skip')}</button>
                </div>
            </div>

            <!-- 步驟四：歡迎使用 -->
            <div class="wmc-welcome-step" id="wmc-welcome-step-4">
                <div class="wmc-welcome-final-title">${t('popup.welcome.welcomeTitle')}</div>
                <div class="wmc-welcome-final-brand">Web mai Chart X</div>
                <button type="button" class="wmc-welcome-btn-confirm" id="wmc-welcome-finish">${t('popup.welcome.confirm')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 觸發顯示動畫
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    /**
     * 切換步驟展示
     * @param {number} stepNum 步驟編號 (1 ~ 4)
     */
    function showStepByNumber(stepNum) {
        overlay.querySelectorAll('.wmc-welcome-step').forEach(stepEl => {
            stepEl.classList.remove('active');
        });
        const targetStep = overlay.querySelector(`#wmc-welcome-step-${stepNum}`);
        if (targetStep) {
            targetStep.classList.add('active');
        }
    }

    /**
     * 前往序列中的下一個步驟
     */
    function goToNextStep() {
        if (currentStepIndex < stepSequence.length - 1) {
            currentStepIndex++;
            showStepByNumber(stepSequence[currentStepIndex]);
        }
    }

    // 初始化第一個步驟
    showStepByNumber(stepSequence[currentStepIndex]);

    // -------------------------------------------------------------
    // 事件綁定
    // -------------------------------------------------------------

    // 步驟一事件
    const agreeCheckbox = overlay.querySelector('#wmc-welcome-agree-check');
    const next1Btn = overlay.querySelector('#wmc-welcome-next-1');
    const termsLink = overlay.querySelector('#wmc-welcome-terms-link');
    const privacyLink = overlay.querySelector('#wmc-welcome-privacy-link');

    if (agreeCheckbox && next1Btn) {
        agreeCheckbox.addEventListener('change', () => {
            next1Btn.disabled = !agreeCheckbox.checked;
        });
        next1Btn.addEventListener('click', () => {
            if (agreeCheckbox.checked) {
                goToNextStep();
            }
        });
    }

    const handleExternalLink = (el, url) => {
        if (el) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(url, '_blank', 'noopener,noreferrer');
            });
        }
    };
    handleExternalLink(termsLink, './terms.html');
    handleExternalLink(privacyLink, './privacy.html');

    // 步驟二事件 (若存在)
    if (showMigrateStep) {
        const openMigrateBtn = overlay.querySelector('#wmc-welcome-open-migrate');
        const skipMigrateBtn = overlay.querySelector('#wmc-welcome-skip-migrate');

        if (openMigrateBtn) {
            openMigrateBtn.addEventListener('click', () => {
                window.open('https://susuy0725.github.io/web-mai-chart-migrate/', '_blank', 'noopener,noreferrer');
            });
        }
        if (skipMigrateBtn) {
            skipMigrateBtn.addEventListener('click', () => {
                goToNextStep();
            });
        }
    }

    // 步驟三事件
    const importBackupBtn = overlay.querySelector('#wmc-welcome-import-backup');
    const skipImportBtn = overlay.querySelector('#wmc-welcome-skip-import');

    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.zip,application/zip';
            fileInput.style.display = 'none';

            fileInput.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    // 暫時隱藏導覽彈窗，避免遮擋匯入確認彈窗與還原進度條
                    overlay.style.display = 'none';

                    try {
                        await openImportSelectionModal(file, {
                            onComplete: () => {
                                // 匯入還原完成後恢復顯示導覽彈窗，並前進至第四步（歡迎使用）
                                overlay.style.display = '';
                                goToNextStep();
                            },
                            onCancel: () => {
                                // 若使用者取消或匯入中止，恢復顯示並維持在第三步
                                overlay.style.display = '';
                            }
                        });
                    } catch (err) {
                        console.error('[welcomeModal] 匯入備份包失敗:', err);
                        overlay.style.display = '';
                    }
                }
            };

            document.body.appendChild(fileInput);
            fileInput.click();
            setTimeout(() => {
                fileInput.remove();
            }, 1000);
        });
    }

    if (skipImportBtn) {
        skipImportBtn.addEventListener('click', () => {
            goToNextStep();
        });
    }

    // -------------------------------------------------------------
    // 各支援語言問候語輪播與互動 (Push-up 垂直擠入替換與寬度平滑過渡)
    // -------------------------------------------------------------
    let greetingIndex = 0;
    const initialEffectiveLang = getCurrentLang();
    const initIdx = GREETINGS.findIndex(g => g.code === initialEffectiveLang);
    if (initIdx !== -1) {
        greetingIndex = initIdx;
    }

    const greetingBadge = overlay.querySelector('#wmc-welcome-greeting-badge');
    const rollerEl = overlay.querySelector('#wmc-welcome-greeting-roller');

    function syncRollerWidth(targetText) {
        if (!rollerEl) return 0;
        const measurer = document.createElement('span');
        measurer.className = 'wmc-welcome-greeting-text';
        measurer.style.position = 'absolute';
        measurer.style.visibility = 'hidden';
        measurer.style.width = 'auto';
        measurer.textContent = targetText;
        rollerEl.appendChild(measurer);
        const measuredWidth = Math.ceil(measurer.getBoundingClientRect().width) + 2;
        measurer.remove();
        rollerEl.style.width = `${measuredWidth}px`;
        return measuredWidth;
    }

    if (rollerEl) {
        rollerEl.innerHTML = '';
        const initialText = GREETINGS[greetingIndex].text;
        const initItem = document.createElement('span');
        initItem.className = 'wmc-welcome-greeting-text current';
        initItem.textContent = initialText;
        rollerEl.appendChild(initItem);
        syncRollerWidth(initialText);
    }

    function rollToGreeting(newText) {
        if (!rollerEl) return;
        const currentItem = rollerEl.querySelector('.wmc-welcome-greeting-text.current');
        if (currentItem && currentItem.textContent === newText) {
            return;
        }

        // 清理所有過期或非 current 的舊節點
        rollerEl.querySelectorAll('.wmc-welcome-greeting-text:not(.current)').forEach(el => el.remove());

        // 1. 建立從下方擠上來的新文字節點
        const nextItem = document.createElement('span');
        nextItem.className = 'wmc-welcome-greeting-text enter-bottom';
        nextItem.textContent = newText;
        rollerEl.appendChild(nextItem);

        // 2. 測量新文字寬度並平滑變更 roller 寬度
        syncRollerWidth(newText);

        // 3. 雙 requestAnimationFrame 確保樣式重繪就緒，觸發垂直擠出與擠入動畫
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (currentItem) {
                    currentItem.className = 'wmc-welcome-greeting-text exit-up';
                }
                nextItem.className = 'wmc-welcome-greeting-text current';

                // 4. 動畫完成後清理舊元素
                setTimeout(() => {
                    if (currentItem && currentItem.parentNode === rollerEl) {
                        currentItem.remove();
                    }
                }, 380);
            });
        });
    }

    let greetingTimer = setInterval(() => {
        greetingIndex = (greetingIndex + 1) % GREETINGS.length;
        rollToGreeting(GREETINGS[greetingIndex].text);
    }, 2400);

    const restartGreetingTimer = () => {
        if (greetingTimer) clearInterval(greetingTimer);
        greetingTimer = setInterval(() => {
            greetingIndex = (greetingIndex + 1) % GREETINGS.length;
            rollToGreeting(GREETINGS[greetingIndex].text);
        }, 2400);
    };

    if (greetingBadge) {
        greetingBadge.addEventListener('click', () => {
            greetingIndex = (greetingIndex + 1) % GREETINGS.length;
            rollToGreeting(GREETINGS[greetingIndex].text);
            restartGreetingTimer();
        });
    }

    // -------------------------------------------------------------
    // 左上角語言切換與文字動態刷新
    // -------------------------------------------------------------
    function refreshModalTexts() {
        overlay.setAttribute('aria-label', t('popup.welcome.welcomeTitle') || 'Welcome');

        // Step 1
        const subdesc = overlay.querySelector('.wmc-welcome-subdesc');
        if (subdesc) subdesc.textContent = t('popup.welcome.step1Desc');

        const txtAgree = overlay.querySelector('#wmc-welcome-txt-agree');
        if (txtAgree) txtAgree.textContent = t('popup.welcome.agreeText');
        const termsLink = overlay.querySelector('#wmc-welcome-terms-link');
        if (termsLink) termsLink.textContent = t('popup.about.termsOfService');
        const txtAnd = overlay.querySelector('#wmc-welcome-txt-and');
        if (txtAnd) txtAnd.textContent = t('popup.welcome.andText');
        const privacyLink = overlay.querySelector('#wmc-welcome-privacy-link');
        if (privacyLink) privacyLink.textContent = t('popup.about.privacyPolicy');
        const next1Btn = overlay.querySelector('#wmc-welcome-next-1');
        if (next1Btn) next1Btn.textContent = t('popup.welcome.nextStep');

        // Step 2 (若存在)
        const step2Title = overlay.querySelector('#wmc-welcome-step-2 .wmc-welcome-step-title');
        if (step2Title) step2Title.textContent = t('popup.welcome.migrateTitle');
        const step2Desc = overlay.querySelector('#wmc-welcome-step-2 .wmc-welcome-step-desc');
        if (step2Desc) step2Desc.textContent = t('popup.welcome.migrateDesc');
        const openMigrate = overlay.querySelector('#wmc-welcome-open-migrate');
        if (openMigrate) openMigrate.textContent = t('popup.welcome.openMigrateTool');
        const skipMigrate = overlay.querySelector('#wmc-welcome-skip-migrate');
        if (skipMigrate) skipMigrate.textContent = t('popup.welcome.skip');

        // Step 3
        const step3Title = overlay.querySelector('#wmc-welcome-step-3 .wmc-welcome-step-title');
        if (step3Title) step3Title.textContent = t('popup.welcome.importTitle');
        const step3Desc = overlay.querySelector('#wmc-welcome-step-3 .wmc-welcome-step-desc');
        if (step3Desc) step3Desc.textContent = t('popup.welcome.importDesc');
        const importBackup = overlay.querySelector('#wmc-welcome-import-backup');
        if (importBackup) importBackup.textContent = t('popup.welcome.importBackup');
        const skipImport = overlay.querySelector('#wmc-welcome-skip-import');
        if (skipImport) skipImport.textContent = t('popup.welcome.skip');

        // Step 4
        const finalTitle = overlay.querySelector('#wmc-welcome-step-4 .wmc-welcome-final-title');
        if (finalTitle) finalTitle.textContent = t('popup.welcome.welcomeTitle');
        const finishBtn = overlay.querySelector('#wmc-welcome-finish');
        if (finishBtn) finishBtn.textContent = t('popup.welcome.confirm');
    }

    const langSelect = overlay.querySelector('#wmc-welcome-lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', async (e) => {
            const chosen = e.target.value;
            await setLang(chosen);
            refreshModalTexts();

            // 若切換至特定語言，立即擠上來該語言的問候語
            const effectiveLang = getCurrentLang();
            const matchedIdx = GREETINGS.findIndex(g => g.code === effectiveLang);
            if (matchedIdx !== -1) {
                greetingIndex = matchedIdx;
                rollToGreeting(GREETINGS[greetingIndex].text);
                restartGreetingTimer();
            }

            // 更新選項標籤（如 Auto 的偵測名稱）
            langSelect.innerHTML = renderLanguageOptions();
        });
    }

    const cleanup = () => {
        if (greetingTimer) {
            clearInterval(greetingTimer);
            greetingTimer = null;
        }
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    };

    // 步驟四事件
    const finishBtn = overlay.querySelector('#wmc-welcome-finish');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            try {
                localStorage.setItem(STORAGE_KEY, 'true');
            } catch (err) {
                console.error('[welcomeModal] 寫入 localStorage 失敗:', err);
            }

            cleanup();
        });
    }

    // -------------------------------------------------------------
    // 凍結操作防護：攔截所有鍵盤與點擊事件冒泡至底層編輯器
    // -------------------------------------------------------------
    overlay.addEventListener('keydown', (e) => {
        // 防止 Esc 或快捷鍵關閉與穿透
        e.stopPropagation();
    });
    overlay.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });
}
