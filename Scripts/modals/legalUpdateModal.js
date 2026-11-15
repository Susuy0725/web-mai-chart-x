/**
 * legalUpdateModal.js
 *
 * 服務條款與隱私權政策更新確認彈窗
 * 當現行版本尚未被使用者同意時，以凍結操作方式強制提示確認。
 */

import { t } from '../i18n.js';
import { getOutdatedLegalDocs, appendAcceptLog, CURRENT_LEGAL_VERSIONS } from '../core/legalVersionManager.js';

/**
 * 依更新狀態產生待確認文件項目清單 HTML
 */
function renderDocItemsHtml(showTerms, showPrivacy) {
    const items = [];

    if (showTerms) {
        items.push(`
            <a href="./terms.html" class="wmc-legal-doc-item" id="wmc-legal-doc-terms" target="_blank" rel="noopener noreferrer">
                <span class="wmc-legal-doc-info">
                    <span class="wmc-legal-doc-name" data-role="doc-name">${t('popup.about.termsOfService')}</span>
                    <span class="wmc-legal-doc-version">${CURRENT_LEGAL_VERSIONS.terms}</span>
                </span>
            </a>
        `);
    }

    if (showPrivacy) {
        items.push(`
            <a href="./privacy.html" class="wmc-legal-doc-item" id="wmc-legal-doc-privacy" target="_blank" rel="noopener noreferrer">
                <span class="wmc-legal-doc-info">
                    <span class="wmc-legal-doc-name" data-role="doc-name">${t('popup.about.privacyPolicy')}</span>
                    <span class="wmc-legal-doc-version">${CURRENT_LEGAL_VERSIONS.privacy}</span>
                </span>
            </a>
        `);
    }

    return items.join('');
}

/**
 * 檢查並顯示條款與隱私權政策更新確認彈窗
 * @param {boolean|Object} [options] 若傳入 boolean 則視為 force；亦可傳入 { force }
 * @returns {boolean} 是否實際顯示了彈窗
 */
export function showLegalUpdateModal(options = {}) {
    const force = (typeof options === 'boolean') ? options : !!options?.force;

    if (document.getElementById('wmc-legal-update-overlay') || document.getElementById('wmc-welcome-overlay')) {
        return false;
    }

    const status = getOutdatedLegalDocs();
    if (!force && !status.hasUpdates) {
        return false;
    }

    // 強制預覽模式下若目前皆為最新，仍顯示兩份文件方便檢視
    const showTerms = status.hasUpdates ? status.termsUpdated : true;
    const showPrivacy = status.hasUpdates ? status.privacyUpdated : true;
    const isFirstConsent = !status.lastAccepted;

    const titleKey = isFirstConsent ? 'popup.legalUpdate.titleInitial' : 'popup.legalUpdate.titleUpdated';
    const descKey = isFirstConsent ? 'popup.legalUpdate.descInitial' : 'popup.legalUpdate.descUpdated';

    const overlay = document.createElement('div');
    overlay.id = 'wmc-legal-update-overlay';
    overlay.className = 'wmc-welcome-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t(titleKey));

    overlay.innerHTML = `
        <div class="wmc-welcome-dialog wmc-legal-update-dialog">
            <div class="wmc-welcome-step active">
                <div class="wmc-legal-update-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                </div>
                <div class="wmc-welcome-step-title" id="wmc-legal-update-title">${t(titleKey)}</div>
                <div class="wmc-welcome-step-desc wmc-legal-update-desc" id="wmc-legal-update-desc">${t(descKey)}</div>

                <div class="wmc-legal-doc-list" id="wmc-legal-doc-list">
                    ${renderDocItemsHtml(showTerms, showPrivacy)}
                </div>

                <label class="wmc-welcome-agreement-row wmc-legal-agree-row">
                    <input type="checkbox" id="wmc-legal-agree-check" class="wmc-welcome-checkbox" />
                    <span id="wmc-legal-agree-text">${t('popup.legalUpdate.agreeLabel')}</span>
                </label>

                <button type="button" class="wmc-welcome-btn-full" id="wmc-legal-confirm-btn" disabled>${t('popup.legalUpdate.confirmButton')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    const agreeCheck = overlay.querySelector('#wmc-legal-agree-check');
    const confirmBtn = overlay.querySelector('#wmc-legal-confirm-btn');

    if (agreeCheck && confirmBtn) {
        agreeCheck.addEventListener('change', () => {
            confirmBtn.disabled = !agreeCheck.checked;
        });

        confirmBtn.addEventListener('click', () => {
            if (!agreeCheck.checked) return;
            confirmBtn.disabled = true;
            appendAcceptLog();
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        });
    }

    // 攔截鍵盤與點擊事件，避免穿透至底層編輯器或誤觸關閉
    overlay.addEventListener('keydown', (e) => {
        e.stopPropagation();
    });
    overlay.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });

    return true;
}
