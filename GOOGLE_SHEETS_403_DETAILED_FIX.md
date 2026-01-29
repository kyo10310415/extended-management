# Google Sheets API 403エラーの詳細解決方法

## 🔍 問題の特定

画像から確認できること：
- ✅ IAMでサービスアカウントに「オーナー」ロールが付与されている
- ✅ Google Sheets APIがプロジェクトで有効化されている
- ❌ しかし403エラーが発生している

**原因:** サービスアカウントキー（JSON）に必要なスコープが含まれていない可能性があります。

---

## ✅ 解決方法1: 新しいサービスアカウントキーを作成（最も確実）

既存のサービスアカウントで新しいキーを作成し直します。

### **手順**

1. **Google Cloud Console**にアクセス
   - プロジェクト「extended management」を選択

2. **サービスアカウントのページに移動**
   - 左側メニュー「IAM と管理」→「サービスアカウント」
   - `extended-management@extended-management.iam.gserviceaccount.com` をクリック

3. **古いキーを削除（推奨）**
   - 「キー」タブをクリック
   - 既存のキーの右側の「︙」メニューをクリック
   - 「削除」を選択（古いキーを無効化）

4. **新しいキーを作成**
   - 「鍵を追加」ボタンをクリック
   - 「新しい鍵を作成」を選択
   - 形式: **JSON**
   - 「作成」をクリック
   - **JSONファイルがダウンロードされます**

5. **Renderで環境変数を更新**
   - [Render Dashboard](https://dashboard.render.com/) を開く
   - プロジェクト「extended-management」を選択
   - 「Environment」タブをクリック
   - `GOOGLE_SERVICE_ACCOUNT_KEY` を探す
   - 新しくダウンロードしたJSONファイルの**内容全体**をコピー&ペースト
   - **「Save Changes」をクリック**
   - Renderが自動的に再デプロイされます（約3〜5分）

6. **動作確認**
   - デプロイ完了後、アプリを開く
   - 生徒情報マスタで「📊 スプレッドシート出力」をクリック

---

## ✅ 解決方法2: Google Driveスコープを追加（代替案）

もし上記で解決しない場合、Google Drive APIも有効化します。

### **手順**

1. **Google Cloud Console**にアクセス
2. 「APIとサービス」→「ライブラリ」
3. 「**Google Drive API**」を検索
4. 「有効にする」をクリック
5. 上記「解決方法1」の手順4〜6を実行（新しいキーを作成）

---

## ✅ 解決方法3: サービスアカウントを新規作成（完全リセット）

既存のサービスアカウントに問題がある場合、新しく作成します。

### **手順**

1. **Google Cloud Console**にアクセス

2. **新しいサービスアカウントを作成**
   - 「IAM と管理」→「サービスアカウント」
   - 「サービスアカウントを作成」をクリック
   - **サービスアカウント名**: `extended-management-sheets`
   - **サービスアカウントID**: `extended-management-sheets`
   - 「作成して続行」をクリック

3. **ロールを付与**
   - 「ロールを選択」ドロップダウンをクリック
   - 「**オーナー**」または「**編集者**」を選択
   - 「続行」をクリック
   - 「完了」をクリック

4. **JSONキーを作成**
   - 作成したサービスアカウント `extended-management-sheets@...` をクリック
   - 「キー」タブをクリック
   - 「鍵を追加」→「新しい鍵を作成」
   - 形式: **JSON**
   - 「作成」をクリック
   - **JSONファイルがダウンロードされます**

5. **Renderで環境変数を更新**
   - `GOOGLE_SERVICE_ACCOUNT_KEY` の値を新しいJSONの内容に置き換え
   - 「Save Changes」をクリック

6. **動作確認**
   - デプロイ完了後、スプレッドシート出力をテスト

---

## 🔍 デバッグ: 環境変数の確認

Renderの環境変数が正しく設定されているか確認します。

### **JSONファイルの正しい形式**

環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY` には以下のようなJSON全体が設定されている必要があります：

```json
{
  "type": "service_account",
  "project_id": "extended-management",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----\n",
  "client_email": "extended-management@extended-management.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/extended-management%40extended-management.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
```

**チェックポイント:**
- [ ] `type` が `"service_account"` であること
- [ ] `project_id` が `"extended-management"` であること
- [ ] `private_key` フィールドが存在し、`-----BEGIN PRIVATE KEY-----` で始まること
- [ ] `client_email` が正しいサービスアカウントのメールアドレスであること
- [ ] JSON全体が1つの環境変数として設定されていること（分割されていないこと）

---

## 📝 よくある原因

### **原因1: 古いサービスアカウントキーを使用**

サービスアカウントの権限を変更した後、**新しいキーを作成していない**場合、古いキーには新しい権限が反映されません。

**解決策:** 新しいキーを作成し直す

### **原因2: JSONファイルが不完全**

環境変数に設定したJSONが途中で切れている、または改行が正しく含まれていない。

**解決策:** JSONファイルの内容を**全体**をコピー&ペーストする

### **原因3: プロジェクトIDが間違っている**

Renderで使用しているサービスアカウントキーのプロジェクトIDと、Google Cloud Consoleで確認しているプロジェクトが異なる。

**解決策:** 環境変数のJSONの`project_id`を確認し、Google Cloud Consoleで同じプロジェクトを開いているか確認

### **原因4: Google Sheets APIが別のプロジェクトで有効化されている**

サービスアカウントが所属するプロジェクトとは別のプロジェクトでGoogle Sheets APIを有効化している。

**解決策:** サービスアカウントが所属するプロジェクト「extended-management」でGoogle Sheets APIを有効化

---

## 🎯 推奨アクション（優先順位順）

### **1. 新しいキーを作成（最優先）**
既存のサービスアカウント `extended-management@extended-management.iam.gserviceaccount.com` で新しいJSONキーを作成し、Renderの環境変数を更新してください。

### **2. Google Drive APIを有効化**
Google Sheets APIだけでなく、Google Drive APIも有効化してください。

### **3. 新しいサービスアカウントを作成**
上記でも解決しない場合、完全に新しいサービスアカウントを作成してください。

---

## ✅ チェックリスト

以下を順番に確認してください：

- [ ] Google Cloud Consoleでプロジェクト「extended-management」を開いている
- [ ] 「APIとサービス」→「ライブラリ」で「Google Sheets API」が有効化されている
- [ ] （推奨）「Google Drive API」も有効化されている
- [ ] サービスアカウント `extended-management@...` に「オーナー」ロールが付与されている
- [ ] 新しいJSONキーを作成してダウンロードした
- [ ] Renderの環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY` にJSONファイルの**内容全体**を設定した
- [ ] Renderで「Save Changes」をクリックし、再デプロイを待った
- [ ] アプリでスプレッドシート出力をテストした

---

## 🚀 最終手段：完全リセット手順

上記すべてを試しても解決しない場合、以下を実行してください：

1. **古いサービスアカウントのキーを全て削除**
2. **新しいサービスアカウントを作成**（名前: `extended-management-sheets-v2`）
3. **ロール「オーナー」を付与**
4. **Google Sheets API + Google Drive APIを有効化**
5. **新しいJSONキーを作成**
6. **Renderの環境変数を更新**
7. **再デプロイ後にテスト**

---

この手順で解決するはずです。試してみてください！
