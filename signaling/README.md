# 配對服務部署

配對入口為 `worker.mjs`。多人房使用 `/api/room/create` 與 `/api/room/join/{code}`，由 `SYNC_ROOMS` Durable Object 處理。`/health` 回傳 `roomProtocol: 1`。房間到期由 Durable Object alarm 處理。

## 本機

```sh
npx wrangler dev --config signaling/wrangler.jsonc --ip 127.0.0.1 --port 8791
```

直接開啟 Vite 提供的編輯器及 `_play` 網址。Vite 將配對 WebSocket 轉到本機 Worker。

## 線上切換

1. 執行 `npx wrangler login`，在瀏覽器授權 Cloudflare 帳號。
2. 將 `wrangler.production.example.jsonc` 複製成同目錄的 `wrangler.production.jsonc`。填入現有兩組限流 namespace ID，核對配額、相容日期、flags 和現有路由。若 Worker 已有 Durable Object migration，保留歷史並使用尚未使用的 tag。這份設定以空的 Cron Triggers 取代原本的定時清理。
3. 用 `npx wrangler deploy --dry-run --config signaling/wrangler.production.jsonc` 檢查。再用相同設定部署 Worker，確認 `/health` 回傳 `roomProtocol: 1`，並以四個測試客戶端驗證配對。
4. 發布前端並重新整理編輯器與 `_play`。舊站的配對會在 Worker 更新當下停止，建議把兩次發布排在同一次維護時段。
