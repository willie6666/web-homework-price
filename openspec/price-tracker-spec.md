# RAM Pulse OpenSpec

## 專案目標

建立一個記憶體價格追蹤網站，讓使用者能輸入日期、商品名稱、價格、品牌、DDR 類型、容量與 PChome 來源網址，並用表格與折線圖觀察價格變化。

## 功能需求

| 編號 | 功能 | 驗收條件 |
| --- | --- | --- |
| F1 | 新增價格資料 | 使用者送出表單後，資料會存入 SQLite 並立即更新畫面 |
| F2 | 顯示歷史資料 | 首頁表格會列出所有價格紀錄，包含日期、商品、價格、GB 單價 |
| F3 | 搜尋與篩選 | 可用關鍵字、品牌、DDR 類型、價格區間過濾資料 |
| F4 | 價格趨勢圖 | 使用 Chart.js 根據資料產生價格折線圖 |
| F5 | 刪除資料 | 可刪除輸入錯誤的價格紀錄 |
| F6 | PChome 來源 | 每筆資料可保存 PChome 商品來源網址 |
| F7 | PChome 抓取 | 可貼上 PChome 24h 網址，後端嘗試解析商品名稱與價格 |
| F8 | TWBuyers 歷史價格 | 可貼上 PChome 商品網址，透過 TWBuyers API 匯入歷史價格 |

## API 規格

### `GET /api/prices`

回傳全部價格資料，依日期新到舊排序。

### `GET /api/prices/search`

Query：

| 名稱 | 說明 |
| --- | --- |
| `q` | 商品名稱或品牌關鍵字 |
| `memory_type` | `DDR4` 或 `DDR5` |
| `brand` | 品牌名稱 |
| `min_price` | 最低價格 |
| `max_price` | 最高價格 |

### `POST /api/prices`

Request body：

```json
{
  "date": "2026-05-09",
  "product_name": "Kingston FURY Beast DDR5 6000 32GB",
  "price": 13482,
  "brand": "Kingston",
  "memory_type": "DDR5",
  "capacity_gb": 32,
  "module_type": "桌上型",
  "source_url": "https://24h.pchome.com.tw/"
}
```

### `DELETE /api/prices/:id`

刪除指定 ID 的價格資料。

### `POST /api/fetch-pchome`

Request body：

```json
{
  "url": "https://24h.pchome.com.tw/..."
}
```

若 PChome 頁面結構無法解析，會回傳錯誤並保留手動輸入流程。

### `POST /api/fetch-twbuyers`

Request body：

```json
{
  "url": "https://24h.pchome.com.tw/prod/...",
  "months": 12
}
```

後端會呼叫 `https://api.twbuyers.info/search-v2`，將回傳的 `prices` 陣列轉成多筆 SQLite 價格紀錄。若商品名稱包含 `DDR4`、`DDR5` 或 `32GB` 等文字，會自動推斷 DDR 類型與容量。

## 資料庫

```sql
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  brand TEXT,
  memory_type TEXT,
  capacity_gb INTEGER,
  module_type TEXT,
  source_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## 非功能需求

| 編號 | 需求 | 實作方式 |
| --- | --- | --- |
| NF1 | 可讀性 | 深色硬體監控面板、表格欄位清楚 |
| NF2 | 穩定性 | PChome 抓取失敗時不影響手動輸入 |
| NF3 | 效能 | Three.js 使用低面數幾何模型與 `prefers-reduced-motion` 降級 |
| NF4 | 可維護性 | 後端 API、前端互動、Three.js 場景分檔 |
| NF5 | 作業展示 | `npm start` 後可於 `http://localhost:3000` 操作 |
