# WMCX Extension Repository Protocol (WERP)

**Web mai Chart X 擴充程式儲存庫協定**

- 協定版本：1.0
- Schema Version：1
- 狀態：Draft
- 適用平台：Web mai Chart X
- 傳輸方式：HTTPS
- 索引格式：JSON
- 套件格式：ZIP
- 完整性驗證：SHA-256

---

## 1. 概述

WMCX Extension Repository Protocol（以下簡稱 WERP）是一套用於發佈、探索、下載及更新 Web mai Chart X 擴充程式的開放式靜態儲存庫協定。

本協定允許任何開發者透過支援 HTTPS 靜態檔案託管的服務建立獨立擴充程式儲存庫。

使用者可以將第三方儲存庫的索引網址加入 WMCX 客戶端，以瀏覽、安裝及更新該儲存庫提供的擴充程式。

本協定不要求儲存庫提供專用 API、後端服務或使用者驗證機制。

### 1.1 設計目標

1. **去中心化**：任何開發者均可建立及維護自己的擴充程式來源。
2. **靜態託管**：儲存庫僅需提供 JSON 索引與 ZIP 套件。
3. **跨平台相容**：可部署於 GitHub Pages、Cloudflare Pages 或其他符合要求的 HTTPS 伺服器。
4. **完整性驗證**：透過 SHA-256 確認下載套件與索引宣告一致。
5. **獨立更新**：客戶端可根據索引資訊偵測擴充程式版本變化。

### 1.2 規範用語

本文件中的關鍵詞具有以下定義：

- **MUST（必須）**：符合本協定的必要條件。
- **MUST NOT（不得）**：本協定禁止的行為。
- **SHOULD（建議）**：除非存在合理原因，否則應遵循的規則。
- **MAY（可選）**：由實作者自行決定是否支援的功能。

---

## 2. 儲存庫結構

符合 WERP 的儲存庫 MUST 提供至少一份有效的 JSON 索引文件。

推薦採用以下目錄結構：

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

`Extensions/` 並非強制名稱。實際套件路徑由索引中的 `file` 欄位指定。

索引與套件 MUST 可透過 HTTPS 存取，且客戶端 MUST 能使用瀏覽器 Fetch API 取得其內容。

伺服器 MUST 提供符合跨來源請求需求的 CORS 回應標頭。

## 3. 索引文件

### 3.1 文件格式

索引 MUST 為有效的 UTF-8 JSON 文件。

文件根節點 MUST 為 JSON Object。

範例：

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

### 3.2 根節點欄位

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `schemaVersion` | Integer | 是 | 索引協定版本 |
| `name` | String | 是 | 儲存庫顯示名稱 |
| `identifier` | String | 是 | 儲存庫宣告識別碼 |
| `description` | String | 是 | 儲存庫簡介 |
| `extensions` | Array | 是 | 擴充程式清單 |

#### schemaVersion

本版協定的 `schemaVersion` MUST 為整數 `1`。

客戶端遇到不支援的 Schema Version MUST 停止解析該索引，並回報版本不相容。

#### name

用於在客戶端中顯示儲存庫名稱。

MUST 為非空字串。

#### identifier

儲存庫自行宣告的識別碼。

SHOULD 採用反向網域名稱格式，例如：

`com.example.extensions`

識別碼 MUST 符合：

```regex
^[a-z0-9]+(?:[.-][a-z0-9]+)*$
```

不同儲存庫可能使用相同 identifier，因此客戶端 MUST NOT 單獨依賴此欄位建立來源的唯一性或信任關係。

#### description

儲存庫簡介，MUST 為字串，可為空字串。

#### extensions

擴充程式清單，MUST 為陣列。

陣列 MAY 為空，代表目前沒有可供安裝的擴充程式。

---

## 4. 擴充程式資訊

`extensions` 陣列中的每個元素 MUST 為 Object。

### 4.1 欄位定義

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | String | 是 | 擴充程式識別碼 |
| `name` | String | 是 | 擴充程式顯示名稱 |
| `version` | String | 是 | 擴充程式版本 |
| `description` | String | 是 | 擴充程式說明 |
| `file` | String | 是 | ZIP 套件相對路徑 |
| `sha256` | String | 是 | ZIP 原始位元組的 SHA-256 |

### 4.2 擴充程式識別碼

`id` MUST 為非空字串，並符合第 3.2 節 identifier 的格式規範。

同一份索引中 MUST NOT 出現重複的擴充程式 ID。

不同儲存庫 MAY 提供相同 ID 的擴充程式，但客戶端 MUST 將其視為不同來源的候選套件，不得直接互相覆蓋。

### 4.3 版本規範

`version` MUST 採用 Semantic Versioning 2.0.0 格式。

例如：

- `1.0.0`
- `1.2.3`
- `2.0.0-beta.1`

客戶端 SHOULD 使用語意化版本比較規則偵測更新。

不得單純使用字串排序比較版本，例如 `1.10.0` 應高於 `1.9.0`。

同一索引的同一插件 ID 僅能宣告一筆目前提供安裝的版本。

### 4.4 套件路徑

`file` MUST 為相對於索引 URL 的路徑。

例如：

```text
Extensions/bouncing-pet-1.0.0.zip
```

客戶端應使用標準 URL 解析方式：

```javascript
const packageUrl = new URL(
  extension.file,
  registryUrl
);
```

為降低惡意索引及非預期下載風險：

- `file` MUST 使用相對路徑。
- MUST NOT 包含 `..` 路徑區段。
- MUST NOT 包含查詢參數或 URL Fragment。
- MUST NOT 為絕對 URL 或協定相對 URL。
- 路徑 MUST 以 `.zip` 結尾。
- 解析結果 MUST 使用 HTTPS，且與索引 URL 具有相同 Origin。

客戶端 MUST 驗證解析後的 URL，並遵循上述限制。

### 4.5 SHA-256

`sha256` MUST 為 64 個十六進位字元，表示下載 ZIP 原始位元組的 SHA-256 雜湊值。

客戶端 MUST 在安裝之前計算下載檔案的 SHA-256，並與索引提供的值比較。

若驗證失敗，MUST 中止安裝或更新。

SHA-256 僅提供資料完整性驗證，無法證明擴充程式作者的身分，也不能保證程式碼安全。

---

## 5. 來源管理

### 5.1 新增來源

客戶端 MUST 允許使用者透過索引 URL 新增第三方儲存庫。

新增來源時 SHOULD 執行：

1. 檢查 URL 是否使用 HTTPS。
2. 取得並解析 JSON 索引。
3. 驗證 Schema Version 及必要欄位。
4. 顯示儲存庫資訊供使用者確認。
5. 將來源 URL 與相關資訊儲存至本機。

無效來源 MUST NOT 被標記為有效的已驗證來源。

### 5.2 來源唯一性

客戶端 MUST 使用正規化後的索引 URL 作為已加入來源的主要識別依據。

來源宣告的 `identifier` 僅供識別與顯示，不構成全球唯一識別保證。

### 5.3 多來源支援

客戶端 MAY 同時維護多個來源。

不同來源 MUST 獨立取得、解析與更新。

單一來源發生錯誤時 MUST NOT 阻止其他正常來源運作。

### 5.4 來源移除

使用者 MAY 隨時移除已加入的來源。

移除來源 SHOULD NOT 自動解除安裝已從該來源取得的擴充程式。

被移除來源的既有插件應停止透過該來源檢查更新，除非使用者重新加入該來源。

---

## 6. 安裝程序

客戶端安裝擴充程式時 MUST 執行以下程序：

```text
Select Extension
       |
       v
Resolve Package URL
       |
       v
Download ZIP
       |
       v
Verify SHA-256
       |
       v
Validate ZIP Structure
       |
       v
Validate Plugin Manifest
       |
       v
Check Compatibility
       |
       v
Review Permissions
       |
       v
Install to Local Storage
```

套件解壓、Manifest 內容及插件執行 API 應由獨立的 WMCX Extension Package Specification 定義。

WERP 僅負責擴充程式的索引、發現、取得及下載完整性。

客戶端 MUST NOT 僅因插件出現在有效索引中，就自動授予其執行權限。

客戶端 SHOULD 對 ZIP 的壓縮大小、解壓大小、檔案數量及檔案路徑進行限制與驗證。

---

## 7. 更新機制

### 7.1 更新偵測

客戶端 SHOULD 定期重新取得已啟用來源的索引。

對於已安裝擴充程式，客戶端應比較：

- 擴充程式 ID
- 原始來源 URL
- 安裝版本
- 索引版本
- SHA-256

如果索引提供更新的版本，客戶端 MAY 提示使用者進行更新。

若版本相同但 SHA-256 不同，客戶端 SHOULD 將其標示為套件內容異動或完整性異常，而非一般版本升級。

### 7.2 更新來源

已安裝的擴充程式 MUST 記錄其來源 URL。

更新時 MUST 使用原始來源進行解析。

客戶端 MUST NOT 未經使用者同意，自動將插件切換到其他來源提供的同 ID 套件。

### 7.3 更新安全性

客戶端 MUST 在替換現有版本之前完成新套件的完整性及格式驗證。

SHOULD 採用可回復的安裝交易機制，避免更新失敗造成既有插件損壞。

擴充程式更新如新增權限，SHOULD 要求使用者重新授權。

---

## 8. 快取及離線支援

客戶端 MAY 快取來源索引及已下載的 ZIP 套件。

SHOULD 為每份索引保存：

- 來源 URL
- 最近成功取得時間
- 最近成功取得的有效索引
- 最近一次錯誤狀態

當來源暫時不可用時，客戶端 MAY 使用最後一次成功驗證的索引作為離線清單，但 MUST 避免將快取資料顯示成已完成即時更新檢查的結果。

已安裝插件 SHOULD 能在不存取來源伺服器的情況下運作，前提是插件本身沒有額外的網路依賴。

---

## 9. 錯誤處理

客戶端 SHOULD 提供可辨識的錯誤類型。

| 錯誤碼 | 說明 |
|---|---|
| `REGISTRY_FETCH_FAILED` | 無法取得索引 |
| `REGISTRY_INVALID_JSON` | JSON 解析失敗 |
| `REGISTRY_UNSUPPORTED_VERSION` | 不支援的 Schema Version |
| `REGISTRY_INVALID_SCHEMA` | 索引欄位不符合規範 |
| `EXTENSION_DUPLICATE_ID` | 同一索引內存在重複 ID |
| `EXTENSION_INVALID_PATH` | 套件路徑無效 |
| `EXTENSION_DOWNLOAD_FAILED` | ZIP 下載失敗 |
| `EXTENSION_HASH_MISMATCH` | SHA-256 不一致 |
| `EXTENSION_INVALID_PACKAGE` | 套件格式無效 |
| `EXTENSION_INCOMPATIBLE` | 套件與客戶端不相容 |
| `EXTENSION_PERMISSION_DENIED` | 使用者拒絕授權 |

發生錯誤時 SHOULD 提供足夠的診斷資訊，但 MUST NOT 因單一來源異常而中斷整個擴充程式管理功能。

---

## 10. 安全性

WERP 採用開放來源模型，任何使用者都可能加入第三方儲存庫。

因此：

1. 儲存庫索引 MUST 視為不可信任的外部資料。
2. 索引中的文字內容 MUST 以安全方式呈現，避免 HTML 或腳本注入。
3. SHA-256 MUST 在套件安裝前完成驗證。
4. 插件執行權限 MUST 由客戶端的插件安全模型管理。
5. 來源加入、套件安裝、插件更新與執行授權 MUST 視為不同的安全操作。

本協定不提供程式碼簽章、作者身分驗證、惡意程式檢測或插件執行隔離。

實作者不得將符合 WERP 格式解讀為插件已經過安全審核。

---

## 11. 相容性與擴充

客戶端 MUST 依 `schemaVersion` 判斷支援的協定版本。

在 Schema Version 1 中，客戶端 SHOULD 忽略不認識的額外欄位，但 MUST 嚴格驗證所有已定義的必要欄位。

未來版本 MAY 加入：

- 插件圖示
- 作者資訊
- 專案首頁
- 最低與最高相容版本
- 插件分類
- 發行紀錄
- 數位簽章
- 多語系資訊

上述功能不屬於 WERP Schema Version 1 的必要規範。

---

## 12. 符合性要求

一個儲存庫若符合以下條件，即可宣稱支援 WERP Schema Version 1：

- 提供可透過 HTTPS Fetch API 讀取的索引 JSON。
- 索引符合本文件定義的 Schema。
- 每個擴充程式具有有效 ID、版本、套件路徑及 SHA-256。
- 所有宣告的套件可透過相對 URL 取得。
- 套件下載內容與宣告的 SHA-256 一致。

客戶端若能正確解析索引、檢查版本、下載並驗證套件，且遵守來源隔離與錯誤處理規範，即可宣稱支援 WERP Schema Version 1 的客戶端功能。

---

**WERP v1.0 — End of Specification**