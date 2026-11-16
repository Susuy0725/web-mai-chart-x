# WMCX Extension Repository Protocol (WERP) 開發者手冊

本文件為 Web mai Chart X 擴充程式儲存庫協定（WMCX Extension Repository Protocol，簡稱 WERP）的官方開發者手冊與規格說明。內容涵蓋協定規範、目錄結構、索引建立、套件打包與多種建議發布方法，協助開發者快速架構並維護自己的擴充程式來源。

- 協定版本：1.0
- Schema Version：1
- 狀態：正式發布
- 適用平台：Web mai Chart X
- 傳輸方式：HTTPS
- 索引格式：JSON
- 套件格式：ZIP
- 完整性驗證：SHA-256

---

## 一、目錄導覽與適用對象

本手冊適用於希望為 Web mai Chart X 開發、打包並發布第三方擴充程式或自訂儲存庫的開發者與團隊。

- 儲存庫建置者：了解如何組織目錄結構、撰寫索引檔、計算雜湊值與部署至靜態伺服器。
- 套件開發者：了解外掛版本規範、相對路徑要求及安全限制。
- 系統整合者：查閱協定規範、錯誤碼定義與客戶端行為準則。

---

## 二、WMCX Extension Repository Protocol 協定規範

### 1. 概述

WERP 是一套用於發佈、探索、下載及更新 Web mai Chart X 擴充程式的開放式靜態儲存庫協定。本協定允許任何開發者透過支援 HTTPS 靜態檔案託管的服務建立獨立擴充程式儲存庫。

使用者可以將第三方儲存庫的索引網址加入 WMCX 客戶端，以瀏覽、安裝及更新該儲存庫提供的擴充程式。本協定不要求儲存庫提供專用 API、後端服務或使用者驗證機制。

#### 1.1 設計目標

1. 去中心化：任何開發者均可建立及維護自己的擴充程式來源。
2. 靜態託管：儲存庫僅需提供 JSON 索引與 ZIP 套件。
3. 跨平台相容：可部署於 GitHub Pages、Cloudflare Pages 或其他符合要求的 HTTPS 伺服器。
4. 完整性驗證：透過 SHA-256 確認下載套件與索引宣告一致。
5. 獨立更新：客戶端可根據索引資訊偵測擴充程式版本變化。

#### 1.2 規範用語

本文件中的關鍵詞具有以下定義：

- 必須：符合本協定的必要條件。
- 不得：本協定禁止的行為。
- 建議：除非存在合理原因，否則應遵循的規則。
- 可選：由實作者自行決定是否支援的功能。

### 2. 儲存庫結構

符合 WERP 的儲存庫必須提供至少一份有效的 JSON 索引文件。推薦採用以下目錄結構：

```text
Repository/
├── index.json
└── Extensions/
    ├── bouncing-pet-1.0.0.zip
    ├── chart-brush-1.0.0.zip
    └── dvd-bounce-1.0.0.zip
```

其中：

- `index.json`：儲存庫中擴充程式的索引。
- `Extensions/`：擴充程式 ZIP 套件的建議存放目錄。

`Extensions/` 並非強制名稱。實際套件路徑由索引中的檔案欄位指定。索引與套件必須可透過 HTTPS 存取，且客戶端必須能使用瀏覽器 Fetch API 取得其內容。伺服器必須提供符合跨來源請求需求的 CORS 回應標頭。

### 3. 索引文件

#### 3.1 文件格式

索引必須為有效的 UTF-8 JSON 文件。文件根節點必須為 JSON Object。範例：

```json
{
  "schemaVersion": 1,
  "name": "WMCX Example Extensions",
  "identifier": "com.wmcx.extensions",
  "description": "Web mai Chart X 自訂擴充程式集合",
  "extensions": [
    {
      "id": "com.wmcx.bouncing-pet",
      "name": "彈彈桌寵",
      "version": "1.0.0",
      "description": "可自由拖曳的桌面掛件。",
      "file": "Extensions/bouncing-pet-1.0.0.zip",
      "sha256": "ca5a9dee6e0eee384567c82c07b81fa82e07024f0bc6d4797c00c3ff34586136"
    }
  ]
}
```

#### 3.2 根節點欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| schemaVersion | Integer | 是 | 索引協定版本 |
| name | String | 是 | 儲存庫顯示名稱 |
| identifier | String | 是 | 儲存庫宣告識別碼 |
| description | String | 是 | 儲存庫簡介 |
| extensions | Array | 是 | 擴充程式清單 |

- schemaVersion：本版協定的 schemaVersion 必須為整數 1。客戶端遇到不支援的 Schema Version 必須停止解析該索引，並回報版本不相容。
- name：用於在客戶端中顯示儲存庫名稱，必須為非空字串。
- identifier：儲存庫自行宣告的識別碼，建議採用反向網域名稱格式，例如 `com.example.extensions`。識別碼必須符合格式 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`。不同儲存庫可能使用相同 identifier，因此客戶端不得單獨依賴此欄位建立來源的唯一性或信任關係。
- description：儲存庫簡介，必須為字串，可為空字串。
- extensions：擴充程式清單，必須為陣列。陣列可為空，代表目前沒有可供安裝的擴充程式。

### 4. 擴充程式資訊

`extensions` 陣列中的每個元素必須為 Object。

#### 4.1 欄位定義

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | String | 是 | 擴充程式識別碼 |
| name | String | 是 | 擴充程式顯示名稱 |
| version | String | 是 | 擴充程式版本 |
| description | String | 是 | 擴充程式說明 |
| file | String | 是 | ZIP 套件相對路徑 |
| sha256 | String | 是 | ZIP 原始位元組的 SHA-256 |

#### 4.2 擴充程式識別碼

`id` 必須為非空字串，並符合識別碼的格式規範。同一份索引中不得出現重複的擴充程式 ID。不同儲存庫可以提供相同 ID 的擴充程式，但客戶端必須將其視為不同來源的候選套件，不得直接互相覆蓋。

#### 4.3 版本規範

`version` 必須採用 Semantic Versioning 2.0.0 格式，例如 `1.0.0`、`1.2.3` 或 `2.0.0-beta.1`。客戶端應使用語意化版本比較規則偵測更新，不得單純使用字串排序比較版本。同一索引的同一插件 ID 僅能宣告一筆目前提供安裝的版本。

#### 4.4 套件路徑

`file` 必須為相對於索引 URL 的路徑，例如 `Extensions/bouncing-pet-1.0.0.zip`。客戶端應使用標準 URL 解析方式。為降低惡意索引及非預期下載風險：

- 必須使用相對路徑。
- 不得包含路徑區段迴退。
- 不得包含查詢參數或 URL 片段。
- 不得為絕對 URL 或協定相對 URL。
- 路徑必須以 `.zip` 結尾。
- 解析結果必須使用 HTTPS，且與索引 URL 具有相同 Origin。

客戶端必須驗證解析後的 URL，並遵循上述限制。

#### 4.5 SHA-256

`sha256` 必須為 64 個十六進位字元，表示下載 ZIP 原始位元組的 SHA-256 雜湊值。客戶端必須在安裝之前計算下載檔案的 SHA-256，並與索引提供的值比較。若驗證失敗，必須中止安裝或更新。SHA-256 僅提供資料完整性驗證，無法證明擴充程式作者的身分，也不能保證程式碼安全。

### 5. 來源管理

#### 5.1 新增來源

客戶端必須允許使用者透過索引 URL 新增第三方儲存庫。新增來源時應該執行檢查 URL 是否使用 HTTPS、取得並解析 JSON 索引、驗證 Schema Version 及必要欄位、顯示儲存庫資訊供使用者確認、將來源 URL 與相關資訊儲存至本機。無效來源不得被標記為有效的已驗證來源。

#### 5.2 來源唯一性

客戶端必須使用正規化後的索引 URL 作為已加入來源的主要識別依據。來源宣告的 identifier 僅供識別與顯示，不構成全球唯一識別保證。

#### 5.3 多來源支援

客戶端可以同時維護多個來源。不同來源必須獨立取得、解析與更新。單一來源發生錯誤時不得阻止其他正常來源運作。

#### 5.4 來源移除

使用者可以隨時移除已加入的來源。移除來源不應該自動解除安裝已從該來源取得的擴充程式。被移除來源的既有插件應停止透過該來源檢查更新，除非使用者重新加入該來源。

### 6. 安裝程序

客戶端安裝擴充程式時必須執行以下程序：選擇擴充程式、解析套件網址、下載 ZIP、驗證 SHA-256、驗證 ZIP 結構、驗證外掛清單、檢查相容性、檢視權限、安裝至本機儲存庫。

套件解壓、Manifest 內容及插件執行 API 應由獨立的 WMCX Extension Package Specification 定義。WERP 僅負責擴充程式的索引、發現、取得及下載完整性。客戶端不得僅因插件出現在有效索引中，就自動授予其執行權限。客戶端應該對 ZIP 的壓縮大小、解壓大小、檔案數量及檔案路徑進行限制與驗證。

### 7. 更新機制

#### 7.1 更新偵測

客戶端應該定期重新取得已啟用來源的索引。對於已安裝擴充程式，客戶端應比較擴充程式 ID、原始來源 URL、安裝版本、索引版本、SHA-256。如果索引提供更新的版本，客戶端可以提示使用者進行更新。若版本相同但 SHA-256 不同，客戶端應該將其標示為套件內容異動或完整性異常，而非一般版本升級。

#### 7.2 更新來源

已安裝的擴充程式必須記錄其來源 URL。更新時必須使用原始來源進行解析。客戶端不得未經使用者同意，自動將插件切換到其他來源提供的同 ID 套件。

#### 7.3 更新安全性

客戶端必須在替換現有版本之前完成新套件的格式及完整性驗證。應該採用可回復的安裝交易機制，避免更新失敗造成既有插件損壞。擴充程式更新如新增權限，應該要求使用者重新授權。

### 8. 快取及離線支援

客戶端可以快取來源索引及已下載的 ZIP 套件。應該為每份索引保存來源 URL、最近成功取得時間、最近成功取得的有效索引、最近一次錯誤狀態。

當來源暫時不可用時，客戶端可以使用最後一次成功驗證的索引作為離線清單，但必須避免將快取資料顯示成已完成即時更新檢查的結果。已安裝插件應該能在不存取來源伺服器的情況下運作，前提是插件本身沒有額外的網路依賴。

### 9. 錯誤處理

客戶端應該提供可辨識的錯誤類型：

| 錯誤碼 | 說明 |
|---|---|
| REGISTRY_FETCH_FAILED | 無法取得索引 |
| REGISTRY_INVALID_JSON | JSON 解析失敗 |
| REGISTRY_UNSUPPORTED_VERSION | 不支援的 Schema Version |
| REGISTRY_INVALID_SCHEMA | 索引欄位不符合規範 |
| EXTENSION_DUPLICATE_ID | 同一索引內存在重複 ID |
| EXTENSION_INVALID_PATH | 套件路徑無效 |
| EXTENSION_DOWNLOAD_FAILED | ZIP 下載失敗 |
| EXTENSION_HASH_MISMATCH | SHA-256 不一致 |
| EXTENSION_INVALID_PACKAGE | 套件格式無效 |
| EXTENSION_INCOMPATIBLE | 套件與客戶端不相容 |
| EXTENSION_PERMISSION_DENIED | 使用者拒絕授權 |

發生錯誤時應該提供足夠的診斷資訊，但不得因單一來源異常而中斷整個擴充程式管理功能。

### 10. 安全性

WERP 採用開放來源模型，任何使用者都可能加入第三方儲存庫。因此：

1. 儲存庫索引必須視為不可信任的外部資料。
2. 索引中的文字內容必須以安全方式呈現，避免 HTML 或腳本注入。
3. SHA-256 必須在套件安裝前完成驗證。
4. 插件執行權限必須由客戶端的插件安全模型管理。
5. 來源加入、套件安裝、插件更新與執行授權必須視為不同的安全操作。

本協定不提供程式碼簽章、作者身分驗證、惡意程式檢測或插件執行隔離。實作者不得將符合 WERP 格式解讀為插件已經過安全審核。

### 11. 相容性與符合性要求

客戶端必須依 schemaVersion 判斷支援的協定版本。在 Schema Version 1 中，客戶端應該忽略不認識的額外欄位，但必須嚴格驗證所有已定義的必要欄位。

一個儲存庫若符合以下條件，即可宣稱支援 WERP Schema Version 1：

- 提供可透過 HTTPS Fetch API 讀取的索引 JSON。
- 索引符合本文件定義的 Schema。
- 每個擴充程式具有有效 ID、版本、套件路徑及 SHA-256。
- 所有宣告的套件可透過相對 URL 取得。
- 套件下載內容與宣告的 SHA-256 一致。

客戶端若能正確解析索引、檢查版本、下載並驗證套件，且遵守來源隔離與錯誤處理規範，即可宣稱支援 WERP Schema Version 1 的客戶端功能。

---

## 三、快速開始指南

本章節指導開發者如何從零開始建立第一個 WERP 擴充程式儲存庫。

### 1. 建立專案資料夾與擴充程式檔案

在本地建立一個工作目錄，並準備你的擴充程式專案（包含 `manifest.json` 與實作程式碼）：

```text
my-wmcx-repo/
├── Extensions/
└── index.json
```

### 2. 打包 ZIP 壓縮檔

將擴充程式資料夾壓縮為 ZIP 格式，並放置於 `Extensions/` 資料夾下，例如 `Extensions/bouncing-pet-1.0.0.zip`。

### 3. 計算 SHA-256 雜湊值

請使用下列對應作業系統的指令計算 ZIP 檔案的 SHA-256 雜湊值：

- PowerShell (Windows)：
  ```powershell
  Get-FileHash -Path "Extensions\bouncing-pet-1.0.0.zip" -Algorithm SHA256
  ```

- Bash (macOS / Linux)：
  ```bash
  sha256sum Extensions/bouncing-pet-1.0.0.zip
  # 或
  shasum -a 256 Extensions/bouncing-pet-1.0.0.zip
  ```

將輸出的 64 字元雜湊值複製備用。

### 4. 撰寫 `index.json`

依據 WERP 規範建立 `index.json` 檔案，填入儲存庫資訊與剛才計算出的 `sha256` 值：

```json
{
  "schemaVersion": 1,
  "name": "我的 WMCX 擴充程式庫",
  "identifier": "com.myname.wmcx-repo",
  "description": "提供個人開發的自訂外掛與特效",
  "extensions": [
    {
      "id": "com.myname.bouncing-pet",
      "name": "彈彈桌寵",
      "version": "1.0.0",
      "description": "可自由拖曳的桌面掛件。",
      "file": "Extensions/bouncing-pet-1.0.0.zip",
      "sha256": "ca5a9dee6e0eee384567c82c07b81fa82e07024f0bc6d4797c00c3ff34586136"
    }
  ]
}
```

---

## 四、建議發布方法

為了確保 WMCX 客戶端能夠順利讀取索引與下載套件，儲存庫必須託管於支援 HTTPS 傳輸與 CORS 跨來源請求的靜態伺服器上。以下提供三種推薦的發布與部署方法：

### 方法一：GitHub Pages 靜態託管

GitHub Pages 是免費且穩定支援 HTTPS 與 CORS 的靜態託管服務，非常適合用來架設 WERP 儲存庫。

1. 在 GitHub 建立一個公開的 Git 儲存庫（例如 `wmcx-extensions`）。
2. 將包含 `index.json` 與 `Extensions/` 資料夾的專案推送到儲存庫的 `main` 或 `gh-pages` 分支。
3. 在儲存庫設定中的 Pages 頁面啟用靜態網頁發布。
4. 發布成功後，取得你的儲存庫索引網址：
   `https://<你的帳號>.github.io/<儲存庫名稱>/index.json`
5. 將此網址提供給使用者或直接加入 WMCX 客戶端即可。

### 方法二：GitHub Actions 自動打包與部署

如果你希望每次更新程式碼時自動打包 ZIP、計算 SHA-256 並更新 `index.json`，可以使用 GitHub Actions 自動化流程。

建立 `.github/workflows/deploy.yml` 檔案：

```yaml
name: Deploy WERP Repository

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build and Package Extensions
        run: |
          # 建立輸出目錄
          mkdir -p Extensions
          
          # 範例：將 src/bouncing-pet 打包為 ZIP 並計算 SHA-256
          cd src/bouncing-pet
          zip -r ../../Extensions/bouncing-pet-1.0.0.zip .
          cd ../..
          
          # 計算 SHA-256 並自動更新 index.json 或驗證
          HASH=$(sha256sum Extensions/bouncing-pet-1.0.0.zip | awk '{print $1}')
          echo "Generated SHA-256: $HASH"

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

### 方法三：Cloudflare Pages 或其他靜態伺服器

Cloudflare Pages 提供極速的全球 CDN 託管，並原生支援 HTTPS 與完整的 CORS 標頭。

1. 將儲存庫推送到 GitHub 或 GitLab。
2. 登入 Cloudflare Dashboard，建立新的 Pages 專案並連結你的 Git 儲存庫。
3. 設定建置指令（若純靜態檔案可不填），輸出目錄設定為根目錄或儲存庫根目錄。
4. 部署完成後取得 Cloudflare 提供的網址（例如 `https://my-wmcx-repo.pages.dev/index.json`）。
5. 若使用自架伺服器（如 Nginx 或 Apache），請確保伺服器回應標頭包含：
   `Access-Control-Allow-Origin: *`

---

## 五、更新發布最佳實務與常見錯誤排查

### 1. 更新發布最佳實務

- 版本遞增：每次修改外掛並重新打包時，必須嚴格遵守語意化版本規範遞增版號（例如從 `1.0.0` 升級至 `1.0.1` 或 `1.1.0`）。
- 重新計算雜湊：每次重新產生 ZIP 套件後，都必須重新計算 SHA-256 並更新 `index.json` 中的 `sha256` 欄位，負載端會因雜湊不一致而拒絕安裝。
- 快取控制：由於 CDN 或瀏覽器可能快取 `index.json`，建議在更新索引後適當調整伺服器的 Cache-Control 標頭，或在網址後方帶有版本參數（若客戶端支援）。

### 2. 常見錯誤排查

- 無法取得索引：請檢查網址是否正確、是否強制使用 HTTPS、伺服器是否正常回應。
- CORS 阻擋：若客戶端主控台出現跨來源請求錯誤，請確認伺服器回應標頭是否包含 `Access-Control-Allow-Origin: *`（GitHub Pages 與 Cloudflare Pages 已預設支援）。
- SHA-256 驗證失敗：通常是因為 ZIP 檔案在上傳後損壞、或是重新打包時檔案內容異動但未更新 `index.json` 中的雜湊值。請重新在本地計算雜湊並核對。
- 路徑解析錯誤：請確認 `index.json` 中的 `file` 欄位為相對路徑且結尾正確。

---

**WERP v1.0 — End of Specification**
