# 🚀 Render デプロイガイド

このガイドでは、WannaV延長管理システムをRenderにデプロイする手順を説明します。

---

## 📋 デプロイ前の準備

### ✅ 完了済み
- [x] GitHubリポジトリへのプッシュ完了
- [x] リポジトリURL: https://github.com/kyo10310415/extended-management
- [x] ブランチ: `main`

### ⚠️ 必要な情報
以下の情報を準備してください：

1. **Notion Integration Token**: `secret_xxxxxxxxxxxxxxxxxxxxx`
2. **Google Service Account JSON**: JSONファイルの内容全体
3. **Renderアカウント**: https://render.com でサインアップ

---

## 🗄️ Step 1: PostgreSQLデータベースの作成

### 1-1. Renderダッシュボードにアクセス

https://dashboard.render.com にログイン

### 1-2. 新しいPostgreSQLを作成

1. 右上の「**New +**」ボタンをクリック
2. 「**PostgreSQL**」を選択

### 1-3. データベース設定

| 項目 | 設定値 |
|------|--------|
| Name | `wannav-extension-db` |
| Database | `wannav_extension` |
| User | `wannav_user` |
| Region | `Oregon (US West)` または最寄りのリージョン |
| PostgreSQL Version | `16` (最新版) |
| Plan | **Starter ($7/month)** |

### 1-4. 作成完了

「**Create Database**」をクリック

⏳ 数分待つと、データベースが準備完了します。

### 1-5. 接続情報を取得

データベースの詳細ページで以下を確認：

- **Internal Database URL**: `postgresql://wannav_user:xxxxx@xxx.oregon-postgres.render.com/wannav_extension`

この URL を後で Web Service の環境変数に設定します。

---

## 🌐 Step 2: Web Serviceの作成

### 2-1. 新しいWeb Serviceを作成

1. 右上の「**New +**」ボタンをクリック
2. 「**Web Service**」を選択

### 2-2. GitHubリポジトリを接続

1. 「**Connect a repository**」セクションで GitHub を選択
2. 初回の場合、GitHub認証を実行
3. リポジトリ一覧から「**extended-management**」を選択
4. 「**Connect**」をクリック

### 2-3. Web Service設定

| 項目 | 設定値 |
|------|--------|
| Name | `wannav-extension-manager` |
| Region | `Oregon (US West)` (データベースと同じリージョン) |
| Branch | `main` |
| Root Directory | (空白のまま) |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Plan | **Starter ($7/month)** |

### 2-4. 環境変数を設定

「**Advanced**」セクションを展開し、「**Add Environment Variable**」をクリック

以下の環境変数を追加します：

#### 基本設定

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

#### Notion API

| Key | Value |
|-----|-------|
| `NOTION_API_KEY` | `secret_xxxxxxxxxxxxxxxxxxxxx` (あなたのトークン) |
| `NOTION_DATABASE_ID` | `88e474e5400f44998fa04d982b1c8ef7` |

#### Google Sheets API

| Key | Value |
|-----|-------|
| `GOOGLE_SHEETS_ID` | `1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | (下記参照) |

**GOOGLE_SERVICE_ACCOUNT_KEY の設定方法：**

1. ダウンロードした `service-account-key.json` をテキストエディタで開く
2. **ファイル全体の内容**をコピー
3. 環境変数の Value に貼り付け

例：
```json
{"type":"service_account","project_id":"your-project-123456","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n-----END PRIVATE KEY-----\n","client_email":"service-account@your-project-123456.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/service-account%40your-project-123456.iam.gserviceaccount.com"}
```

⚠️ **重要**: JSON全体を1行で貼り付けてください（改行なし）

#### Database接続

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Step 1 で取得した Internal Database URL |

例: `postgresql://wannav_user:xxxxx@xxx.oregon-postgres.render.com/wannav_extension`

### 2-5. デプロイ開始

「**Create Web Service**」をクリック

⏳ ビルドとデプロイが開始されます（5〜10分かかります）

---

## ✅ Step 3: デプロイ確認

### 3-1. デプロイステータスを確認

Web Service のダッシュボードで以下を確認：

- **Status**: 🟢 Live
- **Latest Deploy**: Success
- **URL**: `https://wannav-extension-manager.onrender.com`

### 3-2. アプリケーションにアクセス

ブラウザで以下のURLを開く：

```
https://wannav-extension-manager.onrender.com
```

### 3-3. 動作確認

1. **ダッシュボード**が表示されるか確認
2. **ヒアリング一覧**タブをクリック
3. **延長審査一覧**タブをクリック
4. **生徒情報マスタ**タブをクリック

データが正しく表示されれば、デプロイ成功です！ 🎉

---

## 🔧 Step 4: 初回データベースセットアップ

### 4-1. データベーステーブルの作成

Render の Web Service ダッシュボードで：

1. 「**Shell**」タブを開く
2. 以下のコマンドを実行：

```bash
npm run db:migrate
```

これにより、必要なテーブルが自動作成されます。

### 4-2. データベース接続を確認

Shell で以下を実行：

```bash
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

以下のテーブルが表示されれば成功：

- `students` - 生徒情報
- `extension_data` - 延長管理データ

---

## 📊 Step 5: データ同期の確認

### 5-1. Notion データの取得確認

アプリケーションで「**生徒情報マスタ**」タブを開く

Notion データベースから生徒情報が取得されているか確認

### 5-2. Google Sheets データの取得確認

「**ヒアリング一覧**」または「**延長審査一覧**」で、各生徒の「**最終更新月**」が表示されているか確認

---

## 🔄 継続的デプロイ（自動デプロイ）

Render は、GitHubの `main` ブランチへの push を自動検知してデプロイします。

### コード変更→自動デプロイの流れ

1. ローカルでコードを変更
2. Git commit & push
```bash
git add .
git commit -m "機能追加: xxx"
git push origin main
```
3. Render が自動的にビルド＆デプロイ
4. 数分後、変更が反映される

---

## 💰 料金について

### 月額コスト

| サービス | プラン | 月額料金 |
|----------|--------|----------|
| Web Service | Starter | $7 |
| PostgreSQL | Starter | $7 |
| **合計** | | **$14** |

### 無料枠について

- Render の無料プランも利用可能ですが、以下の制約があります：
  - 15分間アクセスがないとスリープ
  - 起動に30秒以上かかる
  - 月750時間まで

本番運用には **Starter プラン**を推奨します。

---

## 🐛 トラブルシューティング

### デプロイが失敗する

**症状**: Build Failed

**対処法**:
1. Render のログを確認
2. `package.json` の `scripts` セクションを確認
3. 環境変数がすべて設定されているか確認

### アプリケーションが起動しない

**症状**: Application failed to respond

**対処法**:
1. 環境変数 `PORT` が `3000` に設定されているか確認
2. `DATABASE_URL` が正しいか確認
3. Shell で `npm start` を手動実行してエラーを確認

### Notion データが取得できない

**症状**: 生徒情報が表示されない

**対処法**:
1. `NOTION_API_KEY` が正しいか確認
2. Notion データベースに Integration を接続したか確認
3. データベース ID が `88e474e5400f44998fa04d982b1c8ef7` か確認

### Google Sheets データが取得できない

**症状**: 最終更新月が表示されない

**対処法**:
1. `GOOGLE_SERVICE_ACCOUNT_KEY` が正しく設定されているか確認（JSON全体）
2. サービスアカウントのメールアドレスをスプレッドシートに共有したか確認
3. スプレッドシート ID が `1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ` か確認

### データベース接続エラー

**症状**: Database connection failed

**対処法**:
1. `DATABASE_URL` が正しいか確認（Internal Database URL を使用）
2. PostgreSQL データベースが起動しているか確認
3. Web Service とデータベースが同じリージョンにあるか確認

---

## 📞 サポート

### Render サポート

- ドキュメント: https://render.com/docs
- コミュニティ: https://community.render.com

### プロジェクト情報

- GitHub: https://github.com/kyo10310415/extended-management
- Issue: https://github.com/kyo10310415/extended-management/issues

---

## ✅ デプロイ完了チェックリスト

### データベース
- [ ] PostgreSQL データベースを作成
- [ ] Internal Database URL を取得
- [ ] データベーステーブルを作成（`npm run db:migrate`）

### Web Service
- [ ] GitHub リポジトリを接続
- [ ] ビルド＆スタートコマンドを設定
- [ ] 環境変数をすべて設定
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3000`
  - [ ] `NOTION_API_KEY`
  - [ ] `NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7`
  - [ ] `GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ`
  - [ ] `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON全体)
  - [ ] `DATABASE_URL`
- [ ] デプロイが成功（Status: Live）

### 動作確認
- [ ] アプリケーションにアクセス可能
- [ ] ダッシュボードが表示される
- [ ] ヒアリング一覧にデータが表示される
- [ ] 延長審査一覧にデータが表示される
- [ ] 生徒情報マスタにNotionデータが表示される
- [ ] 最終更新月がGoogle Sheetsから取得されている

### セキュリティ
- [ ] `.env` ファイルをGitHubにプッシュしていない
- [ ] `config/` ディレクトリをGitHubにプッシュしていない
- [ ] Notion Integration のアクセス権限を確認
- [ ] Google Sheets の共有設定を確認

---

**デプロイ完了後、このドキュメントを保存してください！**

最終更新: 2025-01-15
