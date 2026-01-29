# Google Sheets連携機能

## 📊 概要

生徒情報マスタから**Google Sheetsにデータを出力**する機能を実装しました。

---

## 🎯 出力される項目

以下の9項目が出力されます：

1. **生徒様名** - Notionの「名前」フィールド
2. **学籍番号** - Notionの「学籍番号」フィールド
3. **経過月数** - システムで計算した値（レッスン開始月からの経過月数）
4. **NotionURL** - Notionページへのリンク
5. **ステータス** - Notionの「ステータス」フィールド
6. **契約プラン** - Notionの「契約プラン」フィールド
7. **キャラクター名** - Notionの「キャラクター名」フィールド
8. **YTチャンネルID** - Notionの「YTチャンネルID」フィールド
9. **X ID（@は無し）** - Notionの「X ID」フィールド（**@記号を除去したもの**）

---

## 🔧 Google Sheets API設定手順

### **✅ 既存の環境変数を使用（推奨）**

既に `GOOGLE_SERVICE_ACCOUNT_KEY` 環境変数が設定されている場合、**追加設定は不要です**。

システムは以下の優先順位で環境変数を検索します：
1. `GOOGLE_SERVICE_ACCOUNT_KEY`（既存）
2. `GOOGLE_SHEETS_CREDENTIALS`（新規）

**既に設定済みの場合、この章の設定手順はスキップしてください。**

---

### **新規にサービスアカウントを作成する場合**

#### **1. Google Cloud Projectの作成**

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（例: `wannav-extension-manager`）
3. プロジェクトを選択

#### **2. Google Sheets APIの有効化**

1. 「APIとサービス」→「ライブラリ」に移動
2. 「Google Sheets API」を検索
3. 「有効にする」をクリック

#### **3. サービスアカウントの作成**

1. 「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「サービスアカウント」を選択
3. サービスアカウント名を入力（例: `wannav-sheets-exporter`）
4. 「作成して続行」をクリック
5. ロールを選択（**編集者** または **オーナー**）
6. 「完了」をクリック

#### **4. サービスアカウントキーの作成**

1. 作成したサービスアカウントをクリック
2. 「キー」タブに移動
3. 「鍵を追加」→「新しい鍵を作成」
4. **JSON形式**を選択
5. 「作成」をクリック
6. **JSONファイルがダウンロードされます**（大切に保管！）

#### **5. 環境変数の設定（Render）**

1. Renderのダッシュボードを開く
2. プロジェクトの「Environment」タブに移動
3. 以下の環境変数を追加：

**環境変数名:** `GOOGLE_SERVICE_ACCOUNT_KEY` または `GOOGLE_SHEETS_CREDENTIALS`

**値:** ダウンロードしたJSONファイルの内容をそのままコピー&ペースト

**JSONファイルの例:**
```json
{
  "type": "service_account",
  "project_id": "wannav-extension-manager",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n",
  "client_email": "wannav-sheets-exporter@wannav-extension-manager.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/wannav-sheets-exporter%40wannav-extension-manager.iam.gserviceaccount.com"
}
```

4. 「Save Changes」をクリック
5. Renderが自動的に再デプロイされます

---

## 📝 使い方

### **1. 生徒情報マスタを開く**

アプリケーションにアクセスし、「生徒情報マスタ」タブをクリック

### **2. スプレッドシート出力ボタンをクリック**

画面右上の「📊 スプレッドシート出力」ボタンをクリック

### **3. 確認ダイアログ**

「Google Sheetsに生徒情報を出力しますか？」と確認されるので、「OK」をクリック

### **4. 出力中**

ボタンが「📤 出力中...」に変わり、処理が開始されます

### **5. 完了**

**成功メッセージ:**
```
✅ XX件の生徒情報をスプレッドシートに出力しました！

スプレッドシートを開きますか？
```

- **「OK」をクリック**: 新しいタブでスプレッドシートが開きます
- **「キャンセル」をクリック**: スプレッドシートURLがクリップボードにコピーされます

---

## 🎨 スプレッドシートのフォーマット

### **シート名**

- **スプレッドシート名**: `生徒マスタ_YYYY-MM-DD`（例: `生徒マスタ_2026-01-29`）
- **シート名**: `生徒一覧`

### **ヘッダー行**

ヘッダー行は以下のフォーマットで表示されます：

- **背景色**: 青色（`#3399ff`）
- **文字色**: 白色
- **太字**: はい

### **列の自動調整**

全ての列幅が自動的に調整され、データが見やすく表示されます

### **データ例**

| 生徒様名 | 学籍番号 | 経過月数 | NotionURL | ステータス | 契約プラン | キャラクター名 | YTチャンネルID | X ID（@は無し） |
|---------|---------|---------|-----------|-----------|-----------|-------------|--------------|----------------|
| 山田太郎 | S001 | 5 | https://notion.so/... | アクティブ | スタンダード | ヤマダ | UC123... | yamada_taro |
| 佐藤花子 | S002 | 11 | https://notion.so/... | アクティブ | プレミアム | サトウ | UC456... | sato_hanako |

---

## 🔧 技術詳細

### **API エンドポイント**

**エンドポイント:** `POST /api/sheets/export`

**リクエスト:**
```json
{}
```

**レスポンス（成功時）:**
```json
{
  "success": true,
  "message": "100件の生徒情報をスプレッドシートに出力しました",
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/ABC123.../edit",
  "spreadsheetId": "ABC123...",
  "rowCount": 100
}
```

**レスポンス（失敗時）:**
```json
{
  "success": false,
  "error": "GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_CREDENTIALS environment variable is not set"
}
```

---

### **データ取得フロー**

```
1. フロントエンド: ボタンクリック
   ↓
2. POST /api/sheets/export
   ↓
3. Notionから生徒データ取得（fetchStudents）
   ↓
4. データを整形
   - 経過月数を計算（calculateMonthsElapsed）
   - X IDから@を除去
   ↓
5. Google Sheets APIで新しいスプレッドシートを作成
   ↓
6. データを書き込み
   ↓
7. ヘッダー行をフォーマット（背景色、太字）
   ↓
8. 列幅を自動調整
   ↓
9. スプレッドシートURLを返却
```

---

### **ファイル構成**

1. **server/services/googleSheetsService.js**
   - Google Sheets APIクライアントの初期化
   - `exportStudentsToSheet()` - データ出力処理

2. **server/routes/sheets.js**
   - `POST /api/sheets/export` - APIエンドポイント

3. **src/components/StudentMaster.jsx**
   - `handleExportSpreadsheet()` - フロントエンドの処理
   - 「📊 スプレッドシート出力」ボタン

---

## 🎯 実装のポイント

### **1. X IDから@を除去**

```javascript
let xId = student.xId || '';
if (xId.startsWith('@')) {
  xId = xId.substring(1);
}
```

### **2. 経過月数の計算**

```javascript
const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
```

開始月を1ヶ月目としてカウントします。

### **3. スプレッドシートのフォーマット**

```javascript
// ヘッダー行を太字 + 青色背景
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [
      {
        repeatCell: {
          range: { startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.9 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
    ],
  },
});
```

### **4. ユーザー体験**

- **確認ダイアログ**: 誤操作を防止
- **ローディング状態**: 処理中は「📤 出力中...」を表示
- **完了時の選択肢**: 
  - スプレッドシートを開く
  - URLをクリップボードにコピー

---

## 🚀 デプロイ手順

### **1. コードをプッシュ**

```bash
git add .
git commit -m "feat: Add Google Sheets export feature"
git push origin main
```

### **2. Renderで環境変数を設定**

1. Renderダッシュボードを開く
2. プロジェクトの「Environment」タブに移動
3. `GOOGLE_SHEETS_CREDENTIALS` を追加
4. JSONファイルの内容をペースト
5. 「Save Changes」をクリック

### **3. 動作確認**

1. デプロイが完了したら、アプリURLを開く
2. 生徒情報マスタに移動
3. 「📊 スプレッドシート出力」ボタンをクリック
4. スプレッドシートが作成されることを確認

---

## ⚠️ 注意事項

### **1. Google Sheets APIの制限**

- **クォータ**: 1日あたり500リクエスト（読み取り・書き込み合計）
- **レート制限**: 1秒あたり100リクエスト

**対策:**
- 頻繁な出力は避ける
- 必要な時だけ出力する

### **2. 認証情報の管理**

- **サービスアカウントキー（JSON）は機密情報です**
- Gitにコミットしない
- 環境変数で管理する
- Renderの環境変数は暗号化されています

### **3. スプレッドシートのアクセス権**

- サービスアカウントが作成したスプレッドシートは、デフォルトでサービスアカウント自身のみがアクセス可能
- 他のユーザーと共有する場合は、スプレッドシート内で共有設定を変更する

**共有方法:**
1. スプレッドシートを開く
2. 右上の「共有」ボタンをクリック
3. メールアドレスを追加、または「リンクを知っている全員」に変更

---

## 📊 期待される効果

1. **データの可視化**:
   - Notion外でもデータを閲覧可能
   - スプレッドシートで自由に分析

2. **データのバックアップ**:
   - 定期的に出力することでバックアップとして利用
   - Notionのデータ消失時の保険

3. **外部共有**:
   - 生徒情報を他のメンバーと共有しやすい
   - スプレッドシートのURLを共有するだけ

4. **業務効率化**:
   - ワンクリックで最新データを出力
   - 手動でコピー&ペーストする必要なし

---

## 🎉 まとめ

✅ **実装完了:**
- Google Sheets API連携
- 生徒情報マスタに「スプレッドシート出力」ボタン追加
- 9項目のデータ出力（X IDは@を除去）
- スプレッドシートの自動フォーマット

✅ **次のステップ:**
1. Renderで環境変数 `GOOGLE_SHEETS_CREDENTIALS` を設定
2. アプリをデプロイ
3. 動作確認

詳細な設定手順は上記を参照してください。

ご不明な点があればお知らせください！
