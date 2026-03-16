# Arena Duel Online

可部署在 Vercel 的多人連線房間制槍戰射擊遊戲。

玩家可以：
- 建立房間
- 分享房號給朋友
- 讓朋友加入同一場對戰
- 在 5 分鐘內比拚擊殺數

## 架構

這個專案目前採用：

- `GitHub`：存放程式碼
- `Vercel`：提供公開網址與 `api/ably-auth`
- `Ably`：提供即時連線、Presence、房間同步

也就是說：

- 不是你自己的電腦在提供公網遊戲伺服器
- 不是靠 `ngrok`
- 不是靠內網轉公網
- 而是靠 `Vercel + Ably` 讓你和朋友透過公開網址連線

## 主要檔案

- `index.html`：遊戲頁面
- `styles.css`：畫面樣式
- `app.js`：前端房間、輸入與同步邏輯
- `api/ably-auth.js`：Vercel API，負責簽發 Ably token
- `package.json`：依賴設定
- `vercel.json`：Vercel function 設定

## 環境變數

Vercel 需要設定：

```text
ABLY_API_KEY=你的 Ably Root key
```

環境變數範例可參考：
[.env.example](c:\Users\Administrator\Desktop\project\test\.env.example)

## 本地測試

如果只是看靜態頁，可以用一般 HTTP server。

如果要模擬 Vercel API，建議：

```bash
npm install
npx vercel dev
```

然後開啟：

```text
http://localhost:3000
```

## 部署到 Vercel

1. 將專案 push 到 GitHub
2. 在 Vercel 匯入 repo
3. 設定 `ABLY_API_KEY`
4. 關閉 `Vercel Authentication`
5. 重新部署
6. 把公開網址分享給朋友

## 教學筆記

新手版架構與操作筆記：
[MULTIPLAYER_ARCHITECTURE_GUIDE.md](c:\Users\Administrator\Desktop\project\test\MULTIPLAYER_ARCHITECTURE_GUIDE.md)

## 常見問題

### 朋友打不開網站

先檢查：
- `Settings > Deployment Protection`
- 關閉 `Vercel Authentication`

### `/api/ably-auth` 沒有回 JSON

先檢查：
- `ABLY_API_KEY` 是否正確
- 是否已重新部署

### 我改完程式網站沒更新

請重新：

```bash
git add .
git commit -m "update"
git push
```

Vercel 會依 GitHub 最新版本自動部署。

## 安全提醒

- 不要把 `Ably Root key` 放到前端程式
- 不要把 `Root key` 直接寫進 GitHub
- 如果 key 曾曝光，請去 Ably 後台重建新的 key
