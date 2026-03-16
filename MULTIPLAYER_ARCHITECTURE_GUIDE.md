# 多人連線遊戲新手超精簡筆記

## 這個遊戲現在怎麼運作

- `GitHub`：放程式碼
- `Vercel`：提供公開網址
- `Ably`：提供即時連線

一句話記法：

```text
GitHub 放程式，Vercel 放網站，Ably 負責讓你和朋友即時同步。
```

## 你要先準備什麼

你只需要有這 3 個帳號：

- GitHub
- Vercel
- Ably

## 最短部署流程

### 1. GitHub

把專案程式碼放到 GitHub repo。

平常更新：

```bash
git add .
git commit -m "update"
git push
```

### 2. Ably

1. 登入 Ably
2. 建一個 App
3. 去 `API Keys`
4. 建一組 `Root` key

你要用的是：

- `Root`：可以用
- `Subscribe only`：不能用

### 3. Vercel

1. 登入 Vercel
2. 匯入你的 GitHub repo
3. 在 `Settings > Environment Variables` 新增：

```text
ABLY_API_KEY=你的 Ably Root key
```

4. 去 `Settings > Deployment Protection`
5. 關掉 `Vercel Authentication`
6. 重新部署

## 怎麼知道有沒有成功

### 測首頁

打開你的網址：

```text
https://你的專案網址.vercel.app
```

如果能直接看到遊戲頁面，就正常。

### 測 API

打開：

```text
https://你的專案網址.vercel.app/api/ably-auth?clientId=test-player
```

如果有回 JSON，就正常。

## 怎麼和朋友玩

### 你這邊

1. 打開網站
2. 輸入名字
3. 按「建立房間」
4. 把房號傳給朋友
5. 等朋友加入後按「開始對戰」

### 朋友這邊

1. 打開同一個網址
2. 輸入名字
3. 輸入房號
4. 按「加入房間」

## 遊戲操作

- `WASD`：移動
- 滑鼠：瞄準
- 左鍵：射擊
- `Space`：射擊

## 常見問題

### 1. 網址打開出現 Authentication Required

原因：
- `Vercel Authentication` 沒關

處理：
- 去 `Settings > Deployment Protection`
- 關掉它

### 2. `/api/ably-auth` 沒有回 JSON

原因：
- `ABLY_API_KEY` 沒設好
- 或還沒重新部署

處理：
- 回 Vercel 檢查 `ABLY_API_KEY`
- 再 Redeploy

### 3. 我改了程式但網站沒變

原因：
- 還沒 push GitHub
- 或 Vercel 還沒部署完

處理：

```bash
git add .
git commit -m "update"
git push
```

## 最後記住這 5 件事

1. 程式碼放 GitHub
2. 即時連線靠 Ably
3. 公開網址靠 Vercel
4. Vercel 要設 `ABLY_API_KEY`
5. `Vercel Authentication` 要關掉，不然朋友進不來

## 架構流程總結

### 誰在提供伺服器

這個架構不是用你自己的電腦當公開遊戲伺服器。

目前分工是：

- `GitHub`：放程式碼
- `Vercel`：提供公開網站網址與 `api/ably-auth`
- `Ably`：提供真正的即時連線基礎設施

所以如果你問：

```text
誰在公共網域下讓我和朋友連線？
```

答案是：

- 網站入口是 `Vercel`
- 即時同步伺服器是 `Ably`

### 有沒有把內網網址轉成公網網址

沒有。

你現在這版不是：

- 本機開伺服器
- 再把內網網址轉成公網網址

也沒有用到：

- `ngrok`
- port forwarding
- 家用網路 IP 對外開放

### 那朋友為什麼可以連進來

因為朋友不是連你的電腦，而是：

1. 先打開 `Vercel` 提供的公開網址
2. 再透過 `Vercel` 的 `api/ably-auth` 取得 Ably token
3. 最後連到 `Ably` 的雲端即時服務

所以真正承接雙方即時同步的，不是你的本機，而是 `Ably`。

### 簡單理解版本

```text
你和朋友都打開 Vercel 網址
        ↓
前端向 Vercel API 取得 Ably token
        ↓
雙方都連到 Ably
        ↓
Ably 幫你們傳遞房間與即時資料
```

### 什麼情況才需要內網轉公網

如果你改成下面這種架構，才需要：

- 你自己在本機跑 Node.js 遊戲伺服器
- 想讓外部朋友直接連你的本機

這時候才會用到：

- `ngrok`
- 公網 IP
- 路由器 port forwarding

### 你現在這版不用做的事

你現在這版不用：

- 開本機伺服器給朋友連
- 設定路由器轉發
- 把內網網址轉公網
- 使用 ngrok

### 一句話結論

```text
你現在這個多人遊戲不是靠內網轉公網，而是靠 Vercel 提供公開網站、Ably 提供即時連線，所以朋友可以直接透過公開網址一起玩。
```
