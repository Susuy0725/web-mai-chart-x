import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { appContext } from '../core/appContext.js';
import { setEasterEggUnlocked } from '../core/settingsConfig.js';

/**
 * 開啟關於 Web mai Chart X 說明彈窗
 */
export function openAboutModal() {
  const customContent = `
    <div class="about-modal-container">
      <div class="about-header">
        <div class="about-app-icon-wrap" id="about-easter-egg-btn" title="Web mai Chart X" role="button" tabindex="0">
          <img src="favicon.png" alt="Web mai Chart X" class="about-app-icon" draggable="false" />
        </div>
        <div class="about-header-text">
          <div class="about-app-title">Web mai Chart X</div>
          <div class="about-app-desc">${t('popup.about.desc')}</div>
        </div>
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
      <div class="about-section">
        <div class="about-section-title">${t('popup.about.legalTitle')}</div>
        <div class="about-legal-links">
          <a href="./privacy.html" target="_blank" rel="noopener noreferrer" class="about-legal-link">
            <span>${t('popup.about.privacyPolicy')}</span>
          </a>
          <a href="./terms.html" target="_blank" rel="noopener noreferrer" class="about-legal-link">
            <span>${t('popup.about.termsOfService')}</span>
          </a>
        </div>
      </div>
    </div>`;

  popupWindow({
    title: t('popup.about.title'),
    customContent,
    width: 440,
    buttons: [],
    onOpen: (ctx) => {
      // 彩蛋連點 7 下邏輯
      const eggBtn = ctx.elements?.customContent?.querySelector('#about-easter-egg-btn');
      if (eggBtn) {
        let clickCount = 0;
        let resetTimer = null;

        eggBtn.addEventListener('click', (e) => {
          e.preventDefault();
          clickCount++;

          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            clickCount = 0;
          }, 3000);

          eggBtn.classList.remove('icon-bounce');
          void eggBtn.offsetWidth;
          eggBtn.classList.add('icon-bounce');

          const audioManager = appContext.audioManager;

          if (clickCount < 7) {
            // 前 6 次點擊：播放清脆回饋音，音調漸升
            if (audioManager) {
              try {
                audioManager.play('touch', false, 0.45, null, (clickCount - 1) * 150);
                audioManager.play('judge_break', false, 0.45, null, (clickCount - 1) * 150);
              } catch (_) { }
            }
          } else {
            // 第 7 次點擊：觸發神奇音效與解鎖 ??? 標籤
            clickCount = 0;
            if (resetTimer) clearTimeout(resetTimer);

            eggBtn.classList.add('egg-unlocked');
            setTimeout(() => eggBtn.classList.remove('egg-unlocked'), 1200);

            // 播放神奇音效 (all_perfect)
            let played = false;
            if (audioManager) {
              try {
                audioManager.play('hanabi', false, 0.4, null, -1200);
                audioManager.play('track_start', false, 0.4, null, 1550);
                audioManager.play('judge_break', false, 0.5, null, 1050);
                audioManager.play('judge_break', false, 0.45, null, 0);
                audioManager.play('judge_break', false, 0.45, null, -1050);
                played = true;
              } catch (_) { }
            }
            if (!played) {
              try {
                const snd = new Audio('./Sounds/track_start.ogg');
                snd.volume = 0.4;
                snd.play().catch(() => { });
              } catch (_) { }
            }

            // 解鎖彩蛋設定
            setEasterEggUnlocked(true);

            simpleToast({
              content: '✨ 神秘設定「???」已解鎖！',
              type: 'success',
              timeout: 3000
            });
          }
        });
      }

      const links = ctx.elements?.customContent?.querySelectorAll('.about-link-btn, .about-legal-link');
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
