import { popupWindow } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟關於 Web mai Chart X 說明彈窗
 */
export function openAboutModal() {
    const customContent = `
    <div class="about-modal-container">
      <div class="about-header">
        <div class="about-app-title">Web mai Chart X</div>
        <div class="about-app-desc">${t('popup.about.desc')}</div>
      </div>
      <div class="about-links">
        <a href="https://github.com/Susuy0725/web-mai-chart-x" target="_blank" rel="noopener noreferrer" class="about-link-btn" title="GitHub">
          <img src="assets/GitHub_Invertocat_White.svg" alt="GitHub" class="about-link-icon" draggable="false" />
          <span>GitHub</span>
        </a>
        <a href="https://discord.gg/vX7XcG7bMy" target="_blank" rel="noopener noreferrer" class="about-link-btn" title="Discord">
          <img src="assets/Discord-Symbol-White.svg" alt="Discord" class="about-link-icon" draggable="false" />
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
        buttons: [],
        onOpen: (ctx) => {
            const links = ctx.elements?.customContent?.querySelectorAll('.about-link-btn');
            if (links) {
                links.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const url = link.getAttribute('href');
                        if (url) {
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }
                    });
                });
            }
        }
    });
}
