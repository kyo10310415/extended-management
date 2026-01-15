# 🔐 環境変数設定ガイド

このガイドでは、WannaV延長管理システムに必要な環境変数の設定方法を説明します。

## 📋 必要な環境変数一覧

### 1. Notion API設定

```env
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7
```

#### 設定手順：

**NOTION_API_KEY の取得：**
1. https://www.notion.so/my-integrations にアクセス
2. 「WannaV延長管理」Integration を開く
3. 「内部インテグレーションシークレット」をコピー
4. `secret_` で始まる文字列です

**NOTION_DATABASE_ID の確認：**
- すでに設定済み: `88e474e5400f44998fa04d982b1c8ef7`

**⚠️ 重要：データベースへの接続許可**
1. https://www.notion.so/88e474e5400f44998fa04d982b1c8ef7 を開く
2. 右上の「...」→「接続」→「WannaV延長管理」を選択
3. アクセスを許可

---

### 2. Google Sheets API設定

```env
GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
GOOGLE_SERVICE_ACCOUNT_KEY=./config/service-account-key.json
```

#### 設定手順（サービスアカウント方式）：

**JSONキーファイルの配置：**
1. プロジェクトルートに `config` ディレクトリを作成
2. ダウンロードしたJSONキーファイルを `config/service-account-key.json` として保存
3. スプレッドシートにサービスアカウントのメールアドレスを共有（閲覧権限）

**サービスアカウントのメールアドレス：**
- JSONファイル内の `client_email` フィールドを確認
- 形式: `service-account-name@project-id.iam.gserviceaccount.com`

**スプレッドシートへの共有：**
1. https://docs.google.com/spreadsheets/d/1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ/edit を開く
2. 右上の「共有」をクリック
3. サービスアカウントのメールアドレスを追加（閲覧者として）

---

### 3. PostgreSQL Database設定

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

#### 設定手順：

**Render でPostgreSQLデータベースを作成：**
1. Render ダッシュボードで「New +」→「PostgreSQL」
2. 以下を設定：
   - Name: `wannav-extension-db`
   - Database: `wannav_extension`
   - User: `wannav_user`
   - Region: `Oregon (US West)` または最寄りのリージョン
   - Plan: `Starter ($7/month)`
3. 作成完了後、「Internal Database URL」をコピー

**Render Web Serviceへの接続：**
1. Web Service の Environment タブを開く
2. `DATABASE_URL` に Internal Database URL を設定

---

## 🚀 ローカル開発環境のセットアップ

### Step 1: `.env` ファイルを作成

プロジェクトルートに `.env` ファイルを作成します：

```bash
cp .env.example .env
```

### Step 2: `.env` ファイルを編集

以下の情報を入力します：

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Notion API
NOTION_API_KEY=secret_あなたのトークンをここに貼る
NOTION_DATABASE_ID=88e474e5400f44998fa04d982b1c8ef7

# Google Sheets API
GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
GOOGLE_SERVICE_ACCOUNT_KEY=./config/service-account-key.json

# PostgreSQL Database (ローカル開発用)
DATABASE_URL=postgresql://localhost:5432/wannav_extension_dev
```

### Step 3: Google Service Accountキーを配置

```bash
# config ディレクトリを作成
mkdir -p config

# JSONキーファイルをコピー
# ダウンロードしたファイルを config/service-account-key.json に配置
```

### Step 4: ローカルPostgreSQLをセットアップ（オプション）

```bash
# PostgreSQLがインストールされている場合
createdb wannav_extension_dev

# データベースマイグレーション
npm run db:migrate
```

---

## 🌐 Render デプロイ時の環境変数設定

### Web Service の環境変数

Render の Web Service → Environment タブで以下を設定：

| Key | Value | 説明 |
|-----|-------|------|
| `NODE_ENV` | `production` | 本番環境モード |
| `NOTION_API_KEY` | `secret_xxxxx...` | Notion Integration トークン |
| `NOTION_DATABASE_ID` | `88e474e5400f44998fa04d982b1c8ef7` | NotionデータベースID |
| `GOOGLE_SHEETS_ID` | `1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ` | スプレッドシートID |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSONファイルの内容全体 | サービスアカウントキー（JSON形式） |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL接続URL（自動設定） |

**⚠️ GOOGLE_SERVICE_ACCOUNT_KEY の設定方法：**

1. `config/service-account-key.json` をテキストエディタで開く
2. **ファイル全体の内容**をコピー（波括弧 `{` から `}` まで）
3. Render の環境変数に貼り付け

例：
```json
{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com",...}
```

---

## ✅ 設定確認チェックリスト

### Notion API
- [ ] Integration `WannaV延長管理` を作成
- [ ] Integration Token を取得
- [ ] データベース `88e474e5400f44998fa04d982b1c8ef7` に Integration を接続
- [ ] `.env` に `NOTION_API_KEY` を設定

### Google Sheets API
- [ ] サービスアカウントを作成
- [ ] JSONキーファイルをダウンロード
- [ ] スプレッドシートにサービスアカウントを共有（閲覧権限）
- [ ] `config/service-account-key.json` にファイルを配置
- [ ] `.env` に `GOOGLE_SERVICE_ACCOUNT_KEY` のパスを設定

### PostgreSQL Database
- [ ] Render で PostgreSQL データベースを作成
- [ ] Internal Database URL を取得
- [ ] Web Service に `DATABASE_URL` を設定

### セキュリティ
- [ ] `.env` ファイルが `.gitignore` に含まれていることを確認
- [ ] `config/` ディレクトリが `.gitignore` に含まれていることを確認
- [ ] 機密情報をGitHubにプッシュしていないことを確認

---

## 🔍 トラブルシューティング

### Notion API エラー

**エラー:** `notion_api_error: Unauthorized`
- Integration Token が正しいか確認
- データベースに Integration を接続したか確認

**エラー:** `notion_api_error: Object not found`
- Database ID が正しいか確認
- データベースに Integration がアクセス権を持っているか確認

### Google Sheets API エラー

**エラー:** `Error: The caller does not have permission`
- サービスアカウントのメールアドレスをスプレッドシートに共有したか確認
- 共有時に「閲覧者」権限を付与したか確認

**エラー:** `Error: Unable to parse JSON`
- `GOOGLE_SERVICE_ACCOUNT_KEY` の値が正しいJSON形式か確認
- 改行コードや特殊文字が正しくエスケープされているか確認

### Database エラー

**エラー:** `connection refused`
- `DATABASE_URL` が正しいか確認
- Render のデータベースが起動しているか確認

---

## 📞 サポート

問題が解決しない場合は、以下を確認してください：

1. **エラーログ**: Render のログを確認
2. **環境変数**: すべての必須変数が設定されているか確認
3. **権限**: Notion/Google Sheets へのアクセス権限を確認

---

**最終更新**: 2025-01-15
