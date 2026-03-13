# Vercel 多人連線槍戰射擊遊戲工作計畫

## 專案目標
- [x] 將原本依賴自架 WebSocket 伺服器的版本改成可部署在 Vercel 的方案
- [x] 改用 Vercel + Ably Realtime 支援和朋友透過公開網址一起遊玩
- [x] 保留建立房間、加入房間、5 分鐘對戰與擊殺勝負規則
- [x] 同步更新前端、API、README 與工作流程文件

## 目前檔案結構
- [x] `index.html`：多人房間大廳、HUD、戰場畫面
- [x] `styles.css`：房間與遊戲畫面樣式
- [x] `app.js`：Ably 房間同步、房主模擬、畫面渲染
- [x] `api/ably-auth.js`：Vercel API Function，負責 Ably token
- [x] `package.json`：Ably 套件依賴
- [x] `README.md`：Vercel 部署與多人遊玩說明

## 工作 SOP 勾選清單

### 1. 架構轉換
- [x] 確認 Vercel 不適合直接跑長連線 WebSocket server
- [x] 選定第三方 Realtime 服務作為同步層
- [x] 改用 Vercel + Ably Realtime 架構
- [x] 將即時同步邏輯從 `server.js` 轉移到房主端 + Ably 廣播

### 2. 房間與連線流程
- [x] 建立房間並產生房號
- [x] 加入房間並透過房號連線
- [x] 透過 Presence 顯示目前房內玩家
- [x] 限制房間以雙人對戰為主
- [x] 保留房主開始對戰流程

### 3. 對戰同步機制
- [x] 房主負責模擬本局遊戲
- [x] 房客透過 Ably 傳送輸入資料
- [x] 房主定期廣播遊戲狀態快照
- [x] 同步玩家位置、血量、擊殺、子彈與倒數
- [x] 對戰結束後同步結果畫面

### 4. Vercel API 與部署
- [x] 新增 `api/ably-auth.js` 用於 token auth
- [x] 改寫 `package.json` 以符合 Vercel 安裝需求
- [x] 新增 `.env.example` 與 `vercel.json` 輔助部署
- [x] 更新 README 的環境變數與部署說明
- [ ] 在 Vercel 後台設定 `ABLY_API_KEY`
- [ ] 實際部署到 Vercel 並驗證朋友可連線

### 5. 測試與驗收
- [ ] 安裝最新相依套件
- [ ] 驗證 Ably token API 可正常回應
- [ ] 以兩個瀏覽器視窗測試建房與加入房間
- [ ] 測試房主開始、倒數、擊殺與結算同步
- [ ] 測試房主離線時的中止流程

## 里程碑
- [x] M1：完成 Vercel 相容架構設計
- [x] M2：完成 Ably 房間連線與 Presence
- [x] M3：完成房主模擬與狀態廣播
- [x] M4：完成 README 與工作流程更新
- [ ] M5：完成 Vercel 正式部署驗證

## 備註
- [ ] 目前尚未替你實際設定 Ably 帳號與 Vercel 環境變數
- [ ] 若你提供 Ably API Key 並同意，我下一步可以繼續幫你整理部署步驟或推送最新版本到 GitHub
