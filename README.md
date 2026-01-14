# WannaV 延長管理システム

生徒の延長審査管理を効率化するWebアプリケーション

## 🎯 機能

### ダッシュボード
- 総生徒数、ヒアリング対象数、延長審査対象数の統計表示

### ヒアリング一覧（4ヶ月目）
- レッスン開始月から4ヶ月目の生徒を自動表示
- 延長確度、ヒアリング状況を手動入力・管理

### 延長審査一覧（5ヶ月目）
- レッスン開始月から5ヶ月目の生徒を自動表示
- 延長確度、審査結果、備考を手動入力・管理

### 生徒情報マスタ
- Notionから取得した全生徒情報を一覧表示
- 担任Tutor、名前・学籍番号でフィルタリング可能
- 経過月数を自動計算して表示

## 📊 データソース

1. **Notion API**: 生徒基本情報（名前、学籍番号、Tutor、プラン、レッスン開始月、ステータス）
2. **Google Spreadsheet**: 延長フォームの最終更新月（学籍番号で照合）
3. **PostgreSQL**: 手動入力データ（延長確度、ヒアリング、審査結果、備考）

## 🛠️ 技術スタック

### フロントエンド
- React 18
- TailwindCSS
- Vite

### バックエンド
- Node.js + Express
- Notion API SDK
- Google Sheets API
- PostgreSQL

## 🚀 セットアップ

### 1. 環境変数の設定

`.env`ファイルを作成し、以下を設定:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Notion API
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google Sheets API
GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
GOOGLE_API_KEY=your_google_api_key_here

# PostgreSQL Database
DATABASE_URL=postgresql://user:password@host:5432/database
```

### 2. Notion API設定

#### Integration作成
1. https://www.notion.so/my-integrations にアクセス
2. 「New integration」をクリック
3. Name: `WannaV延長管理`を入力
4. Capabilities: 「Read content」にチェック
5. 「Submit」をクリック
6. APIキー（`secret_xxxxx...`）をコピー

#### データベースへのアクセス許可
1. Notionで生徒名簿データベースを開く
2. 右上「…」→「Connect to」→ `WannaV延長管理`を選択

#### Database ID取得
1. データベースのURLを開く: `https://www.notion.so/{workspace}/{database_id}?v={view_id}`
2. `database_id`の部分（32文字）をコピー

### 3. Google Sheets API設定

1. Google Cloud Consoleで新しいプロジェクトを作成
2. Google Sheets APIを有効化
3. 認証情報でAPIキーを作成
4. APIキーを`.env`の`GOOGLE_API_KEY`に設定

### 4. 依存関係のインストール

```bash
npm install
```

### 5. 開発サーバーの起動

```bash
# フロントエンドとバックエンドを同時起動
npm run dev
```

- フロントエンド: http://localhost:5173
- バックエンドAPI: http://localhost:3000

## 📦 Renderへのデプロイ

### 1. GitHubリポジトリにプッシュ

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Renderでデータベース作成

1. Renderダッシュボードで「New +」→「PostgreSQL」
2. データベース名を入力（例: `wannav-extension-db`）
3. Freeプラン または Starterプラン（$7/月）を選択
4. 「Create Database」をクリック
5. Internal Database URLをコピー

### 3. Renderでウェブサービス作成

1. Renderダッシュボードで「New +」→「Web Service」
2. GitHubリポジトリを接続
3. 以下を設定:
   - **Name**: `wannav-extension-manager`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free または Starter（$7/月）

4. Environment Variablesを追加:
   ```
   NODE_ENV=production
   PORT=3000
   NOTION_API_KEY=your_notion_api_key
   NOTION_DATABASE_ID=your_database_id
   GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
   GOOGLE_API_KEY=your_google_api_key
   DATABASE_URL=your_postgresql_internal_url
   ```

5. 「Create Web Service」をクリック

### 4. デプロイ確認

- デプロイが完了したら、提供されたURLにアクセス
- 例: `https://wannav-extension-manager.onrender.com`

## 🔑 必要なNotionプロパティ

Notionデータベースに以下のプロパティが必要です:

- **名前** (Title): 生徒様名
- **学籍番号** (Text): 学籍番号
- **担任Tutor** (Select): 担当Tutor名
- **契約プラン** (Select): プラン名
- **レッスン開始月** (Date): レッスン開始月（`2024/04/01`形式）
- **ステータス** (Select): 在籍/休会など

## 📝 Google Spreadsheet構造

- **A列**: 最終更新月
- **E列**: 学籍番号

## 🗄️ データベーススキーマ

```sql
CREATE TABLE student_extensions (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  extension_certainty VARCHAR(20),
  hearing_status BOOLEAN DEFAULT false,
  examination_result VARCHAR(50),
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🎨 画面構成

1. **ダッシュボード**: 統計情報の表示
2. **ヒアリング一覧**: 4ヶ月目生徒の管理
3. **延長審査一覧**: 5ヶ月目生徒の管理
4. **生徒情報マスタ**: 全生徒情報の一覧

## 📄 ライセンス

© 2025 WannaV 延長管理システム
