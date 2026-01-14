# 🚀 クイックスタートガイド

このガイドでは、最短でシステムをデプロイする手順を説明します。

---

## 📋 チェックリスト

### ✅ Phase 1: API設定（30分）

#### 1. Notion API設定
- [ ] https://www.notion.so/my-integrations にアクセス
- [ ] 「New integration」をクリック
- [ ] Name: `WannaV延長管理`を入力
- [ ] 「Submit」→ APIキーをコピー（`secret_xxxxx...`）
- [ ] Notionで生徒名簿データベースを開く
- [ ] 右上「…」→「Connect to」→「WannaV延長管理」を選択
- [ ] データベースURLから32文字のDatabase IDをコピー

**メモ欄:**
```
NOTION_API_KEY: secret_________________________
NOTION_DATABASE_ID: ________________________________
```

#### 2. Google Sheets API設定
- [ ] Google Cloud Consoleでプロジェクト作成
- [ ] Google Sheets APIを有効化
- [ ] 認証情報でAPIキーを作成
- [ ] スプレッドシートを「リンクを知っている全員が閲覧可」に設定

**メモ欄:**
```
GOOGLE_API_KEY: _____________________________________
GOOGLE_SHEETS_ID: 1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ (既に入力済み)
```

---

### ✅ Phase 2: GitHub設定（10分）

#### 1. GitHub認証
- [ ] GenSparkの #github タブを開く
- [ ] GitHub App と OAuth を両方認証
- [ ] 認証完了を確認

#### 2. リポジトリ作成
- [ ] GitHubで新しいリポジトリを作成
- [ ] リポジトリ名: `wannav-extension-manager`（推奨）
- [ ] 公開/非公開: どちらでも可

**メモ欄:**
```
GitHub リポジトリURL: https://github.com/____________/wannav-extension-manager
```

#### 3. コードをプッシュ
```bash
# GenSparkのターミナルで実行
cd /home/user/wannav-extension-manager

# setup_github_environment ツールで認証設定済み
# リモートリポジトリを追加
git remote add origin https://github.com/YOUR_USERNAME/wannav-extension-manager.git

# プッシュ
git push -u origin main
```

- [ ] `git push`が成功
- [ ] GitHubでコードを確認

---

### ✅ Phase 3: Renderデプロイ（20分）

#### 1. PostgreSQLデータベース作成
- [ ] https://dashboard.render.com/ にアクセス
- [ ] 「New +」→「PostgreSQL」
- [ ] Name: `wannav-extension-db`
- [ ] Plan: **Starter ($7/month)** を選択
- [ ] 「Create Database」をクリック
- [ ] 「Connections」タブで **Internal Database URL** をコピー

**メモ欄:**
```
DATABASE_URL: postgresql://________________________________
```

#### 2. Web Service作成
- [ ] 「New +」→「Web Service」
- [ ] GitHubリポジトリ `wannav-extension-manager` を接続
- [ ] Name: `wannav-extension-manager`
- [ ] Environment: `Node`
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm start`
- [ ] Plan: **Starter ($7/month)** を選択

#### 3. 環境変数設定
「Advanced」→「Add Environment Variable」で以下を追加:

```env
NODE_ENV=production
PORT=3000
NOTION_API_KEY=secret_________________________
NOTION_DATABASE_ID=________________________________
GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
GOOGLE_API_KEY=_____________________________________
DATABASE_URL=postgresql://________________________________
```

- [ ] すべての環境変数を入力
- [ ] 「Create Web Service」をクリック

#### 4. デプロイ待機
- [ ] デプロイログを確認（5〜10分）
- [ ] 「Live」ステータスになるまで待つ

**デプロイURL:**
```
https://wannav-extension-manager.onrender.com
```

---

### ✅ Phase 4: 動作確認（5分）

#### 1. 基本動作確認
- [ ] デプロイURLにアクセス
- [ ] ダッシュボードが表示される
- [ ] 統計数値が表示される（エラーでない）

#### 2. データ取得確認
- [ ] 「ヒアリング一覧」タブをクリック
- [ ] 4ヶ月目の生徒が表示される
- [ ] 「延長審査一覧」タブをクリック
- [ ] 5ヶ月目の生徒が表示される
- [ ] 「生徒情報マスタ」タブをクリック
- [ ] 全生徒が表示される

#### 3. データ保存確認
- [ ] ヒアリング一覧で「編集」をクリック
- [ ] 延長確度、ヒアリング状況、備考を入力
- [ ] 「保存」をクリック
- [ ] 保存されたデータが表示される
- [ ] ページをリロードしても保存されている

---

## 🎉 完了！

すべてのチェックが完了したら、システムは正常に稼働しています！

---

## ❌ トラブルシューティング

### エラー: "Failed to fetch from Notion"
→ `NOTION_API_KEY` または `NOTION_DATABASE_ID` が間違っています
→ Notionの「Connect to」設定を確認してください

### エラー: "Database connection error"
→ `DATABASE_URL` が間違っています
→ RenderのPostgreSQLダッシュボードで再確認してください

### エラー: "Error fetching from Google Sheets"
→ `GOOGLE_API_KEY` が間違っています
→ スプレッドシートの共有設定を確認してください

### サイトが表示されない
→ Renderのログを確認してください
→ 「Manual Deploy」→「Clear build cache & deploy」を試してください

---

## 📞 サポート

詳細なトラブルシューティングは以下を参照:
- `DEPLOYMENT.md`: デプロイ手順書
- `API_DOCUMENTATION.md`: API仕様書
- `PROJECT_SUMMARY.md`: プロジェクト概要

---

## 💰 コスト確認

- Web Service (Starter): $7/月
- PostgreSQL (Starter): $7/月
- **合計: $14/月**

無料プランは15分でスリープし、起動に30秒かかるため非推奨です。

---

## 🔗 便利なリンク

- **Render Dashboard**: https://dashboard.render.com/
- **Notion Integrations**: https://www.notion.so/my-integrations
- **Google Cloud Console**: https://console.cloud.google.com/
- **GitHub**: https://github.com/

---

所要時間: 約1時間
難易度: ⭐⭐☆☆☆ (中級)
