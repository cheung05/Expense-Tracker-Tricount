# 🌍 TravelSplit — 旅遊分帳助手

[![Google Sheets](https://img.shields.io/badge/Backend-Google%20Sheets-34A853?logo=googlesheets&logoColor=white)](https://sheets.google.com)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript%20ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**TravelSplit** 是一款專為旅遊愛好者設計的輕量級分帳工具。無需下載 App，直接在瀏覽器中使用。整合 Google 試算表作為強大的後端數據庫，讓您的每一筆行程與開銷都能安全地儲存在自己的雲端硬碟中。

![App Mockup](https://raw.githubusercontent.com/cheung05/Expense-Tracker-Tricount/main/docs/hero.png)

## ✨ 精選功能

-   **☁️ Google 試算表同步**：所有數據直接讀寫至您的 Google Sheets，完全掌握自己的帳務資料。
-   **🤝 團體分帳功能**：快速建立旅遊行程、添加成員，輕鬆記錄誰代付了哪一筆款項。
-   **💹 多幣別轉換**：支持全球主流貨幣（USD, JPY, EUR, KRW 等），自動換算匯率，旅遊血拼不再混亂。
-   **🧠 智能結算算法**：採用貪婪算法（Greedy Algorithm）優化結算路徑，將跨人債務簡化到最少交易次數。
-   **📊 數據視覺化**：直觀的圓餅圖與成員餘額條，一眼看出開銷分佈與各自分擔狀況。
-   **📱 行動優先設計**：現代化的 UI/UX，支援深色模式感官體驗，單手即可完成記帳。
-   **🔒 Google OAuth 登入**：採用 Google 官方授權機制，安全可靠。

## 🛠️ 技術架構

-   **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+)
-   **Charts**: Chart.js
-   **Icons**: Material Symbols
-   **Backend**: Google Sheets API v4
-   **Auth**: Google Identity Services (OAuth 2.0)

## 🚀 快速上手

### 1. 準備 Google 試算表
-   在 Google Drive 建立一個新的試算表。
-   複製網址列中的 `Spreadsheet ID`（例如：`11ZFd6upOKh8...`）。

### 2. 申請 Google API 憑證
-   前往 [Google Cloud Console](https://console.cloud.google.com/)。
-   啟用 **Google Sheets API**。
-   建立 **OAuth 2.0 用戶端 ID**。
-   在「已授權的 JavaScript 來源」中加入您的執行網址（例如：`http://localhost:5500` 或您的域名）。

### 3. 配置環境變數
在 `app.js` 中填入您的憑證：

```javascript
const CLIENT_ID = '您的_CLIENT_ID';
const SPREADSHEET_ID = '您的_試算表_ID';
```

### 4. 開始使用
打開 `index.html` 即可開始您的記帳之旅！系統會自動在您的試算表中建立必要的「旅行」與「費用」工作表。

## 📸 介面展示

````carousel
![歡迎頁面](https://raw.githubusercontent.com/cheung05/Expense-Tracker-Tricount/main/docs/screen-1.png)
<!-- slide -->
![旅程列表](https://raw.githubusercontent.com/cheung05/Expense-Tracker-Tricount/main/docs/screen-2.png)
<!-- slide -->
![總覽報表](https://raw.githubusercontent.com/cheung05/Expense-Tracker-Tricount/main/docs/screen-3.png)
<!-- slide -->
![智能結算](https://raw.githubusercontent.com/cheung05/Expense-Tracker-Tricount/main/docs/screen-4.png)
````

## 🛡️ 資料隱私
本專案為客戶端（Client-side）應用，除 Google 官方 API 通訊外，不會將您的資料傳輸至任何第三方伺服器。您的所有旅遊隱私都安全地存放在您自己的 Google 帳戶中。

## 📄 開源協議
本項目採用 [MIT License](LICENSE) 開源。