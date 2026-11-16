import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 讀取 sw.js 中的 ASSETS 清單，為每個同源資產計算部署前的最終內容 SHA-256 (前 16 碼)，
 * 並將結果注入 sw.js 的 ASSET_HASHES 常數中，讓 Service Worker 在更新時僅重新下載有變更的檔案。
 *
 * @param {string} [swPath='sw.js']
 * @param {string} [rootDir='.']
 */
export function injectSwHashes(swPath = 'sw.js', rootDir = '.') {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const assetsBlockMatch = swContent.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!assetsBlockMatch) {
        throw new Error(`[inject-sw-hashes] 無法在 ${swPath} 中找到 ASSETS 陣列`);
    }

    const assetUrls = [...assetsBlockMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const hashes = {};

    for (const url of assetUrls) {
        const relPath = url === './' ? 'index.html' : url.replace(/^\.\//, '');
        const absPath = path.join(rootDir, relPath);
        if (!fs.existsSync(absPath)) {
            console.warn(`[inject-sw-hashes] 找不到資產檔案，略過雜湊計算: ${url} (${absPath})`);
            continue;
        }
        const buf = fs.readFileSync(absPath);
        hashes[url] = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    }

    const placeholderRegex = /const\s+ASSET_HASHES\s*=\s*null;\s*\/\/\s*__ASSET_HASHES__/;
    if (!placeholderRegex.test(swContent)) {
        throw new Error(`[inject-sw-hashes] 無法在 ${swPath} 中找到 ASSET_HASHES 佔位符`);
    }

    const updated = swContent.replace(
        placeholderRegex,
        `const ASSET_HASHES = ${JSON.stringify(hashes, null, 4)};`
    );
    fs.writeFileSync(swPath, updated, 'utf8');
    console.log(`[inject-sw-hashes] 已注入 ${Object.keys(hashes).length} 筆資產雜湊至 ${swPath}`);
    return hashes;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isDirectRun) {
    const targetSw = process.argv[2] || 'sw.js';
    const root = process.argv[3] || '.';
    injectSwHashes(targetSw, root);
}
