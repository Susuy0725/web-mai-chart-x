import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟關於 Web mai Chart X 說明彈窗
 */
export function openAboutModal() {
    const customContent = `
    <style>
      .about-modal-container {
        color: #d4d4d4;
        font-size: 13.5px;
        line-height: 1.6;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .about-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .about-app-title {
        font-size: 18px;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.5px;
      }
      .about-app-desc {
        color: #a0a0a0;
        font-size: 13px;
      }
      .about-links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .about-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 8px 14px;
        color: #ffffff;
        text-decoration: none;
        font-size: 13px;
        font-weight: 500;
        transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
      }
      .about-link-btn:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.35);
        color: #ffffff;
      }
      .about-link-btn:active {
        transform: scale(0.98);
      }
      .about-link-icon {
        width: 18px;
        height: 18px;
        display: block;
        object-fit: contain;
      }
      .about-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .about-section-title {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
      }
      .about-section-content {
        font-size: 12.5px;
        color: #999999;
        line-height: 1.5;
      }
    </style>
    <div class="about-modal-container">
      <div class="about-header">
        <div class="about-app-title">Web mai Chart X</div>
        <div class="about-app-desc">${t('popup.about.desc')}</div>
      </div>
      <div class="about-links">
        <a href="https://github.com/Susuy0725/web-mai-chart-x" target="_blank" rel="noopener noreferrer" class="about-link-btn" title="GitHub">
          <img src="assets/GitHub_Invertocat_White.svg" alt="GitHub" class="about-link-icon" />
          <span>GitHub</span>
        </a>
        <a href="https://discord.gg/vX7XcG7bMy" target="_blank" rel="noopener noreferrer" class="about-link-btn" title="Discord">
          <img src="assets/Discord-Symbol-White.svg" alt="Discord" class="about-link-icon" />
          <span>Discord</span>
        </a>
      </div>
      <div class="about-section">
        <div class="about-section-title">${t('popup.about.licenseTitle')}</div>
        <div class="about-section-content">${t('popup.about.licenseDesc')}</div>
      </div>
      <div class="about-section">
        <div class="about-section-title">${t('popup.about.thanksTitle')}</div>
        <div class="about-section-content">${t('popup.about.thanksDesc')}</div>
      </div>
    </div>`;

    popupWindow({
        title: t('popup.about.title'),
        customContent,
        width: 440,
        buttons: [
            { text: t('popup.close'), hideOnClick: true }
        ]
    });
}
