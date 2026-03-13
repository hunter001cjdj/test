# Arena Duel Online

可部署在 Vercel 的多人房間制槍戰射擊遊戲。玩家可以建立房間、分享房號給朋友、加入同一場對戰，在 5 分鐘內累積最多擊殺數的一方獲勝。

## 架構說明

這個版本改成適合 Vercel 的即時連線方式：

- 前端頁面部署在 Vercel
- Vercel `/api/ably-auth` 負責簽發 Ably token
- Ably Realtime 負責房間、Presence、輸入同步與遊戲狀態廣播
- 房主裝置作為本局對戰的主控端，負責模擬遊戲並將狀態同步給房客

## 專案結構

- `index.html`：多人房間大廳、HUD、遊戲畫面
- `styles.css`：大廳與戰場樣式
- `app.js`：前端 Ably 連線、房間操作、輸入同步、畫面渲染與房主模擬
- `api/ably-auth.js`：Vercel Serverless Function，用來產生 Ably token
- `package.json`：Vercel 部署所需的 Ably 相依套件
- `GAME_PLAN.md`：Vercel 版多人架構的工作 SOP 與進度紀錄

## 核心玩法

- 玩家可建立房間並取得 6 碼房號
- 另一位玩家輸入房號後即可加入同一個房間
- 每個房間以 2 位玩家為目標
- 房主可在玩家到齊後開始 5 分鐘對戰
- 使用 `WASD` 移動、滑鼠瞄準、左鍵或 `Space` 射擊
- 雙方被擊倒後會短暫重生
- 倒數結束後，以擊殺數較高者獲勝

## 部署到 Vercel 前要準備的東西

1. 一個 Vercel 帳號
2. 一個 Ably 帳號
3. 在 Ably 後台建立 API Key
4. 在 Vercel 專案環境變數中加入：

```text
ABLY_API_KEY=你的_ably_api_key
```

專案內也提供了 [`.env.example`](c:\Users\Administrator\Desktop\project\test\.env.example) 作為環境變數範例。

## 本地開發

如果只是本地預覽靜態頁面，可以用任何簡單 HTTP server。

如果要完整測試多人連線，建議使用 Vercel 本地模擬：

```bash
npm install
npx vercel dev
```

然後打開：

```text
http://localhost:3000
```

## 部署到 Vercel

1. 將專案 push 到 GitHub
2. 在 Vercel 匯入這個 repo
3. 設定環境變數 `ABLY_API_KEY`
4. 重新部署
5. 將公開網址分享給朋友

如果要本機模擬 Vercel API，可以使用：

```bash
npm install
npx vercel dev
```

部署完成後，只要兩位玩家都能打開同一個 Vercel 網址，就可以透過房號一起遊玩。

## 目前限制

- 這一版是 Vercel 可行的原型架構，不是完全防作弊的正式伺服器架構
- 房主離線時，本局會中止
- 房間狀態由 Ably Presence 與房主同步控制
- 目前沒有觀戰、聊天與斷線重連

## 後續可擴充方向

- 將房主權限移轉給剩餘玩家
- 增加聊天區與準備倒數
- 讓房間可觀戰或支援更多玩家
- 改成更嚴謹的 authoritative backend 架構
- 加入排行榜、武器切換與音效
