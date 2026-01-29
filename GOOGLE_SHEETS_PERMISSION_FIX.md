# Google Sheets API権限エラーの解決方法

## ❌ エラー内容

```
The caller does not have permission
status: 403
```

このエラーは、サービスアカウントにGoogle Sheets APIの権限が不足していることが原因です。

---

## ✅ 解決手順

### **手順1: Google Cloud Consoleでプロジェクトを確認**

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. サービスアカウントが所属しているプロジェクトを選択

### **手順2: Google Sheets APIを有効化**

1. 左側メニューから「APIとサービス」→「ライブラリ」を選択
2. 検索バーで「Google Sheets API」を検索
3. 「Google Sheets API」をクリック
4. **「有効にする」ボタンをクリック**（既に有効化されている場合は「管理」と表示されます）

### **手順3: サービスアカウントの権限を確認**

#### **方法A: IAMロールを確認（推奨）**

1. 左側メニューから「IAM と管理」→「IAM」を選択
2. サービスアカウントのメールアドレスを探す
   - 例: `wannav-sheets-exporter@project-id.iam.gserviceaccount.com`
3. ロールを確認：
   - ✅ **推奨**: 「編集者」または「オーナー」
   - ❌ **不十分**: 「閲覧者」

4. ロールを変更する場合：
   - 鉛筆アイコン（編集）をクリック
   - 「ロールを追加」をクリック
   - 「編集者」または「オーナー」を選択
   - 「保存」をクリック

#### **方法B: サービスアカウント自体を再作成**

既存のサービスアカウントの権限設定が複雑な場合、新しく作成する方が簡単です：

1. 左側メニューから「IAM と管理」→「サービスアカウント」を選択
2. 「サービスアカウントを作成」をクリック
3. サービスアカウント名を入力（例: `wannav-sheets-exporter-new`）
4. 「作成して続行」をクリック
5. **ロールを選択**: 「編集者」または「オーナー」
6. 「続行」→「完了」をクリック
7. 作成したサービスアカウントをクリック
8. 「キー」タブに移動
9. 「鍵を追加」→「新しい鍵を作成」→「JSON」
10. ダウンロードしたJSONファイルの内容をRenderの環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY` に設定

### **手順4: Renderで環境変数を確認**

1. [Render Dashboard](https://dashboard.render.com/) にアクセス
2. プロジェクトを選択
3. 「Environment」タブを開く
4. `GOOGLE_SERVICE_ACCOUNT_KEY` の値を確認：
   - JSONファイルの内容が正しく設定されているか
   - `client_email` フィールドが正しいサービスアカウントのメールアドレスか

5. 値を更新した場合、「Save Changes」をクリック
6. Renderが自動的に再デプロイされます

---

## 🔍 トラブルシューティング

### **確認ポイント1: Google Sheets APIが有効か**

Google Cloud Consoleで以下を確認：
- 「APIとサービス」→「ライブラリ」
- 「Google Sheets API」を検索
- 「管理」ボタンが表示されていれば有効化済み

### **確認ポイント2: サービスアカウントの権限**

最低限必要な権限：
- ✅ **プロジェクト全体の「編集者」ロール**
- または
- ✅ **カスタムロールで以下の権限:**
  - `sheets.spreadsheets.create`
  - `sheets.spreadsheets.update`
  - `sheets.spreadsheets.get`

### **確認ポイント3: JSONキーの形式**

環境変数に設定するJSONは以下の形式である必要があります：

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

**注意:**
- `private_key` フィールドに改行文字 `\n` が含まれていることを確認
- JSONファイル全体を1行にせず、そのままコピー&ペースト

---

## 🚀 最も簡単な解決方法

### **新しいサービスアカウントを作成して置き換える**

1. **Google Cloud Consoleで新しいサービスアカウントを作成**
   - プロジェクトを選択
   - 「IAM と管理」→「サービスアカウント」
   - 「サービスアカウントを作成」
   - 名前: `wannav-sheets-full-access`
   - ロール: **「編集者」**（または「オーナー」）
   - JSONキーを作成してダウンロード

2. **Google Sheets APIを有効化**
   - 「APIとサービス」→「ライブラリ」
   - 「Google Sheets API」を検索
   - 「有効にする」をクリック

3. **Renderで環境変数を更新**
   - `GOOGLE_SERVICE_ACCOUNT_KEY` の値を新しいJSONファイルの内容に置き換え
   - 「Save Changes」をクリック
   - 自動再デプロイを待つ

4. **動作確認**
   - アプリURLにアクセス
   - 生徒情報マスタで「📊 スプレッドシート出力」をクリック
   - スプレッドシートが正常に作成されることを確認

---

## ⚠️ よくある間違い

### **間違い1: 閲覧者ロールを設定**
❌ **「閲覧者」ロールではスプレッドシートを作成できません**

✅ **「編集者」または「オーナー」ロールを設定してください**

### **間違い2: APIが有効化されていない**
❌ Google Sheets APIが有効化されていない

✅ Google Cloud Consoleで「Google Sheets API」を有効化してください

### **間違い3: 古いサービスアカウントキーを使用**
❌ 権限を変更した後、新しいキーを作成していない

✅ 権限を変更した後、古いキーを削除して新しいキーを作成してください

---

## 📝 チェックリスト

作業完了後、以下を確認してください：

- [ ] Google Sheets APIが有効化されている
- [ ] サービスアカウントに「編集者」または「オーナー」ロールが付与されている
- [ ] 新しいJSONキーを作成してダウンロードした
- [ ] Renderの環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY` を更新した
- [ ] Renderが再デプロイされた
- [ ] アプリで「スプレッドシート出力」ボタンをテストした

---

## 🎉 完了

上記の手順を完了すると、スプレッドシート出力機能が正常に動作するようになります。

問題が解決しない場合は、以下の情報を確認してください：
1. Google Cloud Consoleでサービスアカウントのメールアドレス
2. サービスアカウントに付与されているロール
3. Google Sheets APIが有効化されているか
4. Renderの環境変数に正しいJSONが設定されているか

ご不明な点があればお知らせください！
