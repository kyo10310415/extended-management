# 休会情報機能の実装完了ガイド

## ✅ 実装完了内容

### 1. 休会情報の取得
- **対象シート**: https://docs.google.com/spreadsheets/d/17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA/edit
- **データ構造**:
  - H列: 学籍番号（突合キー）
  - K列: 休会期間（数値）

### 2. バックエンドの変更

#### `server/services/sheetsService.js`
- `fetchSuspensionData()` 関数を追加
- 休会情報をキャッシュ対応（5分間）
- H列の学籍番号とK列の休会期間を取得

#### `server/routes/notion.js`
- `/api/notion/hearing` に休会情報を統合
- `/api/notion/examination` に休会情報を統合
- 各生徒データに以下を追加:
  ```javascript
  {
    monthsElapsed: 4 or 5 or 10 or 11,
    adjustedMonths: monthsElapsed - suspensionMonths,
    suspensionMonths: 休会期間,
    hasSuspensionHistory: true/false
  }
  ```

#### `server/services/backgroundService.js`
- 起動時に休会情報もプリロード
- 毎日AM2:00に自動更新

### 3. フロントエンドの変更

#### `src/components/StudentTable.jsx`
- **担任Tutorでソート可能**:
  - 列ヘッダーをクリックで昇順・降順切り替え
  - ▲/▼ アイコン表示
- **備考欄の横幅を拡大**:
  - `min-w-[300px]` で最小幅を設定
  - 3行表示に変更
- **休会歴の警告表示**:
  - 休会歴がある生徒には「⚠️ 休会歴あり。要チェック」を表示
  - オレンジ色の目立つ表示

#### `src/components/HearingList.jsx`
- タイトルを「🎤 ヒアリング一覧（4ヶ月目・10ヶ月目）」に変更

#### `src/components/ExaminationList.jsx`
- タイトルを「📋 延長審査一覧（5ヶ月目・11ヶ月目）」に変更

---

## 🔧 設定手順

### Step 1: 休会情報シートの共有設定

1. **サービスアカウントのメールアドレスを取得**
   - Render → 環境変数 → `GOOGLE_SERVICE_ACCOUNT_KEY` を開く
   - JSONの中から `client_email` をコピー
   - 例: `wannav-sheets@your-project-123456.iam.gserviceaccount.com`

2. **休会情報シートを共有**
   - シートを開く: https://docs.google.com/spreadsheets/d/17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA/edit
   - 右上の「共有」ボタンをクリック
   - サービスアカウントのメールアドレスを追加
   - 権限: **閲覧者**
   - 「送信」をクリック

3. **共有を確認**
   - 共有リストにサービスアカウントのメールアドレスが表示されていることを確認

---

### Step 2: Renderで再デプロイ

1. **Renderダッシュボードにアクセス**
   - https://dashboard.render.com/

2. **Web Serviceを選択**
   - `wannav-extension-manager` を選択

3. **Manual Deploy**
   - 右上の「Manual Deploy」→ 「Deploy latest commit」をクリック
   - または、自動デプロイを待つ（GitHubプッシュ後に自動トリガー）

4. **デプロイ完了を待つ**
   - 約3〜5分かかります

---

### Step 3: ログで確認

デプロイ完了後、Renderのログで以下を確認してください：

```
🚀 Initializing data preload on server startup...
🔄 Starting background data preload...
📊 Fetching students from Notion...
✅ Fetched 2596 students
📊 Fetching form updates from Google Sheets...
✅ Fetched form updates for 567 students
📊 Fetching suspension data from Google Sheets...
✅ Fetched suspension data for XX students    ← これが表示されればOK
✅ Background data preload completed in XX.XXs
💾 Cache status: {...}
🚀 Server running on port 3000
```

**エラーの場合**:
```
❌ Error fetching suspension data from Google Sheets: The caller does not have permission
```
→ Step 1 の共有設定を再確認してください

---

## 📊 実装内容の詳細

### 1. 継続月数の調整計算

**計算式**:
```
adjustedMonths = monthsElapsed - suspensionMonths
```

**例**:
- 継続月数が7ヶ月目、休会期間が3ヶ月の場合
- adjustedMonths = 7 - 3 = **4ヶ月目**

**APIレスポンス例**:
```json
{
  "studentId": "W12345",
  "name": "山田太郎",
  "monthsElapsed": 7,
  "adjustedMonths": 4,
  "suspensionMonths": 3,
  "hasSuspensionHistory": true,
  "tutor": "田中先生",
  ...
}
```

### 2. 休会歴の表示

**条件**:
- `hasSuspensionHistory === true` の場合

**表示内容**:
- 備考欄の最上部に「⚠️ 休会歴あり。要チェック」を表示
- オレンジ色（`text-orange-600`）で目立つように

**表示位置**:
- ヒアリング一覧
- 延長審査一覧

### 3. 担任Tutorのソート機能

**使い方**:
- 「担任Tutor」列のヘッダーをクリック
- 1回目: 昇順（▲）
- 2回目: 降順（▼）
- 3回目: ソート解除（元の順序に戻る）

**ソート方法**:
- 日本語対応の `localeCompare('ja')` を使用

---

## 🧪 テスト方法

### 1. 休会情報の取得確認

**API直接アクセス**:
```bash
curl https://extended-management.onrender.com/api/notion/hearing
```

**確認ポイント**:
```json
{
  "success": true,
  "data": [
    {
      "studentId": "W12345",
      "suspensionMonths": 3,
      "hasSuspensionHistory": true,
      "adjustedMonths": 4,
      ...
    }
  ]
}
```

### 2. UI確認

1. **ヒアリング一覧を開く**
   - https://extended-management.onrender.com/
   - 「ヒアリング一覧」タブをクリック

2. **確認項目**:
   - [ ] タイトルが「🎤 ヒアリング一覧（4ヶ月目・10ヶ月目）」になっている
   - [ ] 担任Tutor列のヘッダーをクリックでソートできる
   - [ ] 備考欄の横幅が広くなっている
   - [ ] 休会歴がある生徒に「⚠️ 休会歴あり。要チェック」が表示されている
   - [ ] 継続月数が正しく表示されている（4ヶ月目または10ヶ月目）

3. **延長審査一覧を開く**
   - 「延長審査一覧」タブをクリック

4. **確認項目**:
   - [ ] タイトルが「📋 延長審査一覧（5ヶ月目・11ヶ月目）」になっている
   - [ ] 担任Tutor列のヘッダーをクリックでソートできる
   - [ ] 備考欄の横幅が広くなっている
   - [ ] 休会歴がある生徒に「⚠️ 休会歴あり。要チェック」が表示されている
   - [ ] 継続月数が正しく表示されている（5ヶ月目または11ヶ月目）

---

## 🔄 今後の運用

### 自動更新スケジュール

- **毎日AM2:00（JST）に自動更新**
  - Notion生徒データ
  - Google Sheetsフォーム更新日
  - Google Sheets休会情報

### 手動更新

必要に応じて、各画面の「🔄 更新」ボタンをクリックして手動更新できます。

---

## 🐛 トラブルシューティング

### 問題1: 休会情報が取得できない

**症状**:
- ログに `❌ Error fetching suspension data` が表示される
- 休会歴の警告が表示されない

**解決方法**:
1. 休会情報シート（17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA）の共有設定を確認
2. サービスアカウントのメールアドレスが共有リストにあるか確認
3. 権限が「閲覧者」になっているか確認
4. Renderを再起動

### 問題2: ソート機能が動作しない

**症状**:
- 担任Tutor列をクリックしても並び順が変わらない

**解決方法**:
1. ブラウザのキャッシュをクリア（Ctrl+Shift+R / Cmd+Shift+R）
2. ページをリロード

### 問題3: 備考欄が狭い

**症状**:
- 備考欄の横幅が変わっていない

**解決方法**:
1. ブラウザのキャッシュをクリア
2. ページをリロード
3. 画面を横スクロールして確認（最小幅300pxに設定済み）

---

## 📝 技術的な詳細

### キャッシュ戦略

- **キャッシュキー**: `sheets_suspension_data`
- **有効期限**: 5分間（300秒）
- **プリロード**: サーバー起動時 + 毎日AM2:00

### データフロー

```
Google Sheets (休会情報)
    ↓
sheetsService.fetchSuspensionData()
    ↓
Cache (sheets_suspension_data)
    ↓
notion.js routes
    ↓
Frontend (StudentTable)
    ↓
UI表示
```

---

## 🎉 完了！

すべての機能が実装されました！

**次のアクション**:
1. 休会情報シートを共有
2. Renderで再デプロイ
3. ログで確認
4. UIで動作確認

問題があれば、このガイドを参考にトラブルシューティングしてください。

---

**作成日**: 2025-01-16  
**バージョン**: 1.0  
**Git Commit**: cbc22b0
