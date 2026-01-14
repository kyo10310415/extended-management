# 🚀 Renderデプロイ手順書

## ✅ 事前準備チェックリスト

### 1. Notion API設定
- [ ] Notion Integrationを作成
- [ ] APIキーを取得（`secret_xxxxx...`形式）
- [ ] 生徒名簿データベースにアクセス権限を付与
- [ ] Database IDを取得（32文字の英数字）

**必要なNotionプロパティ:**
- 名前（Title）
- 学籍番号（Text）
- 担任Tutor（Select）
- 契約プラン（Select）
- レッスン開始月（Date: `2024/04/01`形式）
- ステータス（Select）

### 2. Google Sheets API設定
- [ ] Google Cloud Consoleでプロジェクトを作成
- [ ] Google Sheets APIを有効化
- [ ] APIキーを作成
- [ ] スプレッドシートを共有設定（リンクを知っている全員が閲覧可）

**スプレッドシート構造:**
- A列: 最終更新月
- E列: 学籍番号

### 3. GitHubリポジトリ
- [ ] GitHubアカウントを準備
- [ ] 新しいリポジトリを作成（公開/非公開どちらでも可）

---

## 📦 ステップ1: GitHubにプッシュ

```bash
cd /home/user/wannav-extension-manager

# GitHub環境設定（初回のみ）
# この手順は setup_github_environment ツールで自動化されます

# リモートリポジトリを追加
git remote add origin https://github.com/YOUR_USERNAME/wannav-extension-manager.git

# プッシュ
git push -u origin main
```

---

## 🗄️ ステップ2: Renderでデータベース作成

1. **Renderにログイン**: https://dashboard.render.com/

2. **新しいPostgreSQLを作成**:
   - 「New +」→「PostgreSQL」をクリック
   - Name: `wannav-extension-db`
   - Region: `Oregon (US West)`（または任意）
   - Plan: **Starter ($7/month)** を選択
     - ⚠️ Freeプランは90日で削除されるため、Starterプランを推奨
   - 「Create Database」をクリック

3. **接続情報を取得**:
   - ダッシュボードで作成したデータベースを開く
   - 「Connections」タブを開く
   - **Internal Database URL**をコピー（例: `postgresql://user:pass@dpg-xxx.oregon-postgres.render.com/db`）

---

## 🌐 ステップ3: Renderでウェブサービス作成

1. **新しいWeb Serviceを作成**:
   - 「New +」→「Web Service」をクリック

2. **GitHubリポジトリを接続**:
   - 「Connect a repository」でGitHubアカウントを認証
   - `wannav-extension-manager`リポジトリを選択

3. **基本設定**:
   - **Name**: `wannav-extension-manager`
   - **Region**: `Oregon (US West)`（データベースと同じリージョン推奨）
   - **Branch**: `main`
   - **Root Directory**: 空白（デフォルト）
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

4. **プランを選択**:
   - **Starter ($7/month)** を選択
     - ⚠️ Freeプランは15分でスリープし、起動に30秒かかるため、Starterプランを推奨

5. **Environment Variables（環境変数）を追加**:
   
   「Advanced」→「Add Environment Variable」をクリックし、以下を1つずつ追加:

   ```
   NODE_ENV=production
   PORT=3000
   NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxx
   NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
   GOOGLE_API_KEY=your_google_api_key_here
   DATABASE_URL=postgresql://user:pass@dpg-xxx.oregon-postgres.render.com/db
   ```

   **重要**: 
   - `NOTION_API_KEY`: Notionで取得したAPIキー
   - `NOTION_DATABASE_ID`: Notionデータベースの32文字ID
   - `GOOGLE_API_KEY`: Google Cloud Consoleで取得したAPIキー
   - `DATABASE_URL`: ステップ2で取得したInternal Database URL

6. **「Create Web Service」をクリック**

---

## ⏳ ステップ4: デプロイの確認

1. **デプロイ進行状況**:
   - Renderダッシュボードでデプロイログを確認
   - 「Building...」→「Deploying...」→「Live」と進みます
   - 初回デプロイは5〜10分かかります

2. **デプロイ完了後**:
   - 上部に表示されるURLをクリック
   - 例: `https://wannav-extension-manager.onrender.com`

3. **動作確認**:
   - [ ] ダッシュボードが表示される
   - [ ] ヒアリング一覧に4ヶ月目の生徒が表示される
   - [ ] 延長審査一覧に5ヶ月目の生徒が表示される
   - [ ] 生徒情報マスタに全生徒が表示される
   - [ ] 延長確度、ヒアリング、審査結果が保存できる

---

## 🔧 トラブルシューティング

### エラー: "Failed to fetch from Notion"

**原因**: Notion APIキーまたはDatabase IDが間違っている

**解決方法**:
1. Renderの環境変数を確認
2. Notionで「Connect to」設定を確認
3. Database IDを再確認（URLから32文字をコピー）

### エラー: "Database connection error"

**原因**: DATABASE_URLが間違っている

**解決方法**:
1. RenderのPostgreSQLダッシュボードを開く
2. 「Connections」タブでInternal Database URLを再コピー
3. Renderのウェブサービスの環境変数を更新

### エラー: "Error fetching from Google Sheets"

**原因**: Google Sheets APIキーまたはスプレッドシートIDが間違っている

**解決方法**:
1. Google Cloud ConsoleでAPIキーを確認
2. スプレッドシートの共有設定を確認（リンクを知っている全員が閲覧可）
3. スプレッドシートIDを確認（URLから取得）

### サイトが表示されない

**原因**: ビルドまたは起動に失敗している

**解決方法**:
1. Renderのログを確認
2. 「Events」タブでエラーメッセージを確認
3. 必要に応じて「Manual Deploy」→「Clear build cache & deploy」を実行

---

## 💰 コスト概算

### Starterプラン（推奨）
- **Web Service**: $7/月
- **PostgreSQL**: $7/月
- **合計**: $14/月

### Freeプラン（非推奨）
- **Web Service**: 無料（15分でスリープ、起動に30秒）
- **PostgreSQL**: 無料（90日で削除）
- **合計**: 無料

⚠️ **注意**: Freeプランは実用的ではないため、Starterプランを強く推奨します。

---

## 📞 サポート

問題が解決しない場合は、以下の情報を含めてお問い合わせください:

1. エラーメッセージ
2. Renderのデプロイログ
3. ブラウザのコンソールログ（F12を押して確認）

---

## ✅ デプロイ完了チェックリスト

- [ ] GitHubにコードをプッシュ
- [ ] RenderでPostgreSQLデータベースを作成
- [ ] RenderでWeb Serviceを作成
- [ ] 環境変数を正しく設定
- [ ] デプロイが成功
- [ ] サイトにアクセスできる
- [ ] Notionからデータを取得できる
- [ ] Google Sheetsからデータを取得できる
- [ ] データベースに保存できる

🎉 **おめでとうございます！デプロイ完了です！**
