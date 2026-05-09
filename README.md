# RAM Pulse

記憶體價格追蹤網站，Web 程式設計作業實作。網站使用 Express.js、SQLite、原生 HTML/CSS/JavaScript、Chart.js 與 Three.js。

## 功能

- 新增 RAM 價格資料：日期、商品名稱、價格、品牌、DDR 類型、容量、來源網址
- SQLite 保存歷史價格
- 表格顯示與刪除資料
- 商品名稱、品牌、DDR 類型與價格區間篩選
- 桌上型 / 筆記型用途欄位與商品勾選式趨勢圖
- 容量欄位支援 `32` 或 `16*2` 這類輸入，後端會換算成 GB
- Chart.js 價格趨勢圖
- Three.js 簡化 RAM 模型動畫
- PChome 24h 商品頁解析嘗試，失敗時可手動輸入
- TWBuyers Info 歷史價格匯入，可用 PChome 商品網址抓回多筆歷史價格

## 執行方式

```bash
npm install
npm start
```

開啟：

```text
http://localhost:3000
```

## 專案結構

```text
.
├── server.js
├── package.json
├── data.db
├── openspec/
│   └── price-tracker-spec.md
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    └── three-scene.js
```

## API

- `GET /api/prices`
- `GET /api/prices/search?q=kingston`
- `POST /api/prices`
- `DELETE /api/prices/:id`
- `POST /api/fetch-pchome`
- `POST /api/fetch-twbuyers`

## 設計方向

整體介面採用低調科技感與硬體監控面板風格，避免大面積霓虹、紫藍漸層與過度 AI 生成感。主要互動包含 toast、即時篩選、圖表重繪與 RAM 訊號 pulse 動畫。
