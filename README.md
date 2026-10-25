# WannaV 延長管理システム

生徒の延長審査管理を効率化するWebアプリケーション

## ビルド依存のセキュリティ更新

lockfileの`@babel/core`を7.29.7へ更新しています。CVE-2026-49356の修正版は7.29.6です。ビルドは管理されたソースだけを入力し、外部から渡されたJavaScript/CSSを変換しないでください。実行時の認証・画面・環境変数の変更はありません。

Tailwind CSS 3経由の`postcss-selector-parser`にはCVE-2026-104844（7.1.6未満）の警告が残っています。現在の参照はVite/PostCSSによるリポジトリ内CSSのビルドで、本番Expressは生成済み`dist`を配信します。リクエスト中に外部CSSを解析する経路は静的調査で見つかっていません。依存の警告自体は未解消であり、Tailwindのメジャー移行は別途画面互換性を検証して実施してください。

## Google Sheets SDKの更新検証

Google API SDKは`googleapis@150.0.1`に固定しています。認証設定・シート構造・業務ジョブの設定変更は不要です。`npm test`には、実際のSheetsサービス処理から生成される読取り・書込みリクエスト（休会反映の`USER_ENTERED`、月次レポートの`RAW`と既存`resource`形式）を検証するテストを含みます。テストはHTTP adapterを模擬し、合成データだけを使用するため、Google・DB・Discordへ接続しません。実Google認証と本番シートへの書込みはこのテストの検証範囲外です。

## 🎯 機能

### ダッシュボード
- 総生徒数、ヒアリング対象数、延長審査対象数の統計表示

### ヒアリング一覧（4ヶ月目）
- レッスン開始月から4ヶ月目の生徒を自動表示
- エントリープランの生徒は対象外
- 延長確度、ヒアリング状況を手動入力・管理

### 延長審査一覧（5ヶ月目・11ヶ月目）
- レッスン開始月から5ヶ月目・11ヶ月目の生徒を自動表示
- エントリープランの生徒は対象外
- 延長確度、審査結果、備考を手動入力・管理

### EP延長審査（5ヶ月目・以降6ヶ月ごと）
- 契約プランが「エントリープラン」の生徒だけを表示
- 休会期間を除く継続月数が5ヶ月目・11ヶ月目・以降6ヶ月ごとの生徒を自動表示
- 審査結果は手動入力のみ（フォーム回答からは自動入力しない）
- 「延長」は売上予測シートへ5,980円、「アップセル」は22,000円を6か月分追記
- 売上予測の追記後に統括チェックを「未確認」にし、「確認済」への手動変更後に生徒様へDiscord通知
- 管理者向けDiscord通知は、保存時の確認画面で「送信」を選択した場合のみ送信

### Pro延長審査（17ヶ月目）
- 休会期間を除く継続月数が17ヶ月目の生徒を自動表示
- エントリープランの生徒は対象外

### 生徒情報マスタ
- Notionから取得した全生徒情報を一覧表示
- 担任Tutor、名前・学籍番号でフィルタリング可能
- 経過月数を自動計算して表示

## 📊 データソース

1. **Notion API**: 生徒基本情報（名前、学籍番号、Tutor、プラン、レッスン開始月、ステータス）
2. **Google Spreadsheet**: 延長フォームの最終更新月（学籍番号で照合）
3. **PostgreSQL**: 手動入力データ（延長確度、ヒアリング、審査結果、備考）

## 認証と運用時の設定

業務画面・業務APIはWannaV DashboardのSSOが必須です。admin/leaderは従来の管理画面、crewは管理者が明示登録した担任Tutorの担当生徒専用画面を利用します。crewには全体一覧・KPI・同期・管理操作を許可しません。

- `JWT_SECRET`: Dashboardと一致する32文字以上のランダムな共有鍵。未設定・短い鍵・既定の例示値では起動を拒否します。鍵の値はログへ出力しないでください。
- `APP_ORIGIN`: このアプリの正規の公開origin（例 `https://extension.example.com`）。パス・query・fragmentは付けません。公開URLの`scheme/hostname/port`がDashboardのSSO発行時`targetUrl`と一致する必要があります。本番ではHTTPS必須です。
- `DASHBOARD_URL`: ログイン案内先。既定は既存のWannaV Dashboardです。

SSOの署名（HS256）・期限・種別・本人情報・役割・送信先originを検証します。既存の `?auth_token=...` によるSSO着地はHTMLのGETだけで受け付け、HttpOnly / SameSite=Lax Cookieへ保存後にURLからトークンを除きます。業務APIのqueryにトークンを付けても認証されません。APIの認証失敗は401、権限不足は403のJSONとなり、画面は再ログインまたはアクセス拒否表示へ切り替わります。

更新系APIはCookieに加え、`Origin`が`APP_ORIGIN`と一致し`X-WannaV-Request: 1`があることを要求します。画面の共通fetch処理がこのヘッダーを付けます。外部HTTPジョブで匿名APIを呼ぶ運用は利用できません。既存の定期同期・通知は同一プロセスからサービス関数を直接呼ぶため、この変更による認証除外は不要です。GET/HEAD `/api/health` とビルド済みassetsだけは匿名アクセス可能です。

本番への適用前に、上記の設定、Dashboardの対象URL、`admin`/`leader`の正規SSO、Cookie期限切れ、更新系APIと自動ジョブの動作を隔離環境で確認してください。Vite開発サーバーだけではHTMLのSSO着地を処理しないため、SSO確認は`npm run build`後のバックエンド配信と同一originで行います。

監査・依存導入のみの場合は `npm ci --ignore-scripts` を使用してください。依存導入時のpostinstall DBマイグレーションは撤去しました。スキーマ変更が必要な配備では、接続先・移行差分・バックアップを確認した管理者が`npm run migrate`を明示実行してください。今回の認証修正にDB変更やデータ移行はありません。

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
3. **延長審査一覧**: 5ヶ月目・11ヶ月目生徒の管理
4. **EP延長審査**: エントリープランの5ヶ月目・以降6ヶ月ごとの延長審査管理
5. **Pro延長審査**: 17ヶ月目生徒の管理（エントリープランを除く）
6. **生徒情報マスタ**: 全生徒情報の一覧

## 📄 ライセンス

© 2025 WannaV 延長管理システム

### 依存導入と明示移行（SEC-039）
`postinstall`を撤去し、通常の`npm install`/`npm ci`で`run-migration.js`を呼ばないようにしました。今回の変更自体にDBスキーマ変更はなく、本番migrationを手動で実行する必要はありません。
新規環境・将来のスキーマ変更時は、管理者が対象DBとバックアップ、必要なSQL差分を確認して明示移行を行ってください。既存の`npm run migrate`には過去のデータ修復SQLも含まれるため、無条件に全件を再実行しないでください。
サーバー起動時の既存`initDatabase()`（テーブル・列の初期化/一部データ更新）と通常の自動同期は今回変更していません。これは依存導入時の副作用を除く変更であり、起動時のDB更新を全廃したものではありません。

### 依存関係の互換更新（2026-10-23）
既存manifest範囲内のlock更新でproxy-addr2.0.8、Express4.22.3、Axios1.20.0、PostCSS8.5.31、Rollup4.65.0等へ更新。認証・同期・DB・API実装は変更していません。Node22.23.4でnpm ci（ignore-scripts）、68テスト、フロントbuildが成功。production auditはCritical1/High15/Moderate11/Low1からCritical0/High6/Moderate7/Low1です。残るHighはTailwind等のビルド依存とVite、ModerateはGoogle関連等を含み、解消済みとは判定していません。サーバーはビルド済みdistをExpressで配信し、Viteサーバーは開発用です。実DB・同期・通知・Google通信はテストで実行していません。
proxy-addrの公式影響条件は特定のIPv6 trust subnet誤設定で、確認したアプリコードにtrust proxy設定はありません。依存警告と攻撃成立は区別します。
https://github.com/advisories/GHSA-jqcg-44mw-7w3h
https://github.com/advisories/GHSA-mw96-cpmx-2vgc

### crewの担当生徒アクセス（2026-10-25）
1. 共通ダッシュボードを更新後、管理者がユーザー管理のcrew行にある「担任Tutor対応名」へNotionの単一の担任Tutor名を完全一致で登録します。ログイン名からは推測しません。
2. この更新後に管理者の既存データ更新または定期同期を1回成功させ、最新取得集合のsnapshotを作ります。crewの閲覧で全体同期は実行しません。snapshot不在・48時間超過・取得不能時はcrewを拒否します。最新取得集合から消えた生徒は、古いキャッシュ行が残っていても許可しません。既存の共有キャッシュを削除する変更ではありません。
3. crewは共通ダッシュボードから延長管理を開き直します。SSOに署名されたtutorNameと同期済み担当データの完全一致で、一覧・個別取得・更新を限定します。対応名の変更/解除後も既発行SSOは最大1時間有効です。担当変更は次の正常同期後に反映されます。
4. crewはヒアリング状況・延長確度・備考・審査結果を更新できます。審査結果変更は保存値から判定し既存の対象生徒限定の売上転記/通知へつなぎます。役員確認の変更、全体API、CSV/シート出力、全体通知、設定/診断は拒否。担当外ID・未対応名・未知APIは既定拒否です。
検証はfixtureのDB/HTTPだけで行い、実生徒更新・審査・通知・売上転記をテストとして実行しません。

### crewの利用権限（2026-10-25変更）

crewは担当者登録・担当者Notion同期・初回承認なしで全生徒を閲覧できます。専用画面から更新できるのはヒアリング状況・延長確度・備考のみで、審査結果は閲覧のみです。保存は既存のhearing専用APIを使用し、審査結果の変更・通知・売上転記・役員確認・管理用APIはサーバー側でも許可しません。

全生徒は正常同期した最新のキャッシュ集合から返し、48時間を超えた情報や集合にない生徒へのアクセスを拒否します。これは通常の生徒データ同期で維持され、crew個別の設定は不要です。admin/leaderの既存操作は維持します。旧担当者限定の説明より本節を優先します。

### crewの共通UI

crewもadmin/leaderと同じヘッダー・タブ・一覧・検索・KPI表示を使います。審査結果と統括チェックは閲覧のみで、保存はヒアリング状況・延長確度・備考の3項目に限定します。管理用の同期・出力・強制退会・Pro設定・KPI保存はcrewに許可しません。更新ボタンはcrewでは現在の読取りデータを再表示し、手動同期やキャッシュ削除は行いません。画面用のGETと検証済みbulk読取りPOSTのみを追加許可し、それ以外のAPI制限は維持します。

### 2026-10-25 ビルド/開発依存の更新

Vite5系に当該警告の修正版がないため、互換検証のうえVite6.4.5（exact）へ更新しました。plugin-reactは既存4系、shell-quote等の推移依存は互換patchで更新。アプリ画面・認証・API・DBの変更なし。

Node22.23.4でclean install(ignore-scripts)、86テスト、Vite6のproduction build成功。架空データのブラウザーで共通タブ・一覧・crewの審査結果/統括チェック編集禁止を確認。全依存auditはCritical1/High4からCritical/High0、Moderate7/Low1残存。実業務データ更新なし。Vite6はNode18/20/22系など、採用版のengineに合うNodeを利用してください。
