/**
 * welcomeModal.js
 * 
 * 初次啟動導覽彈窗 (凍結操作式、Material Design 暗色風格)
 * 涵蓋服務條款確認、舊站資料遷移 (限 tri-dent.cc 網域)、備份包匯入以及歡迎使用流程。
 */

import { t } from '../i18n.js';
import { openImportSelectionModal } from './maintenanceModal.js';

const STORAGE_KEY = 'wmcx_first_run_completed';

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
            <!-- 步驟一：服務條款與隱私政策 -->
            <div class="wmc-welcome-step" id="wmc-welcome-step-1">
                <img src="./favicon.png" alt="Web mai Chart X Logo" class="wmc-welcome-logo" draggable="false" />
                <div class="wmc-welcome-brand">Web mai Chart X</div>
                <div class="wmc-welcome-subdesc">${t('popup.welcome.step1Desc')}</div>
                <label class="wmc-welcome-agreement-row">
                    <input type="checkbox" id="wmc-welcome-agree-check" class="wmc-welcome-checkbox" />
                    <span>${t('popup.welcome.agreeText')} <a href="./terms.html" id="wmc-welcome-terms-link" target="_blank" rel="noopener noreferrer">${t('popup.about.termsOfService')}</a> ${t('popup.welcome.andText')} <a href="./privacy.html" id="wmc-welcome-privacy-link" target="_blank" rel="noopener noreferrer">${t('popup.about.privacyPolicy')}</a></span>
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

    // 步驟四事件
    const finishBtn = overlay.querySelector('#wmc-welcome-finish');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            try {
                localStorage.setItem(STORAGE_KEY, 'true');
            } catch (err) {
                console.error('[welcomeModal] 寫入 localStorage 失敗:', err);
            }

            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
            }, 300);
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
