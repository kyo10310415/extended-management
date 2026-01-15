# 🔄 バックグラウンドデータ更新機能

## 概要

WannaV延長管理システムには、**バックグラウンドでデータを自動更新する機能**が実装されています。これにより、ユーザーがアプリを開いた時に即座にデータが表示されます。

---

## 🚀 機能

### 1️⃣ サーバー起動時のデータプリロード

サーバーが起動すると、自動的にNotion APIとGoogle Sheets APIからデータを取得してキャッシュに保存します。

```
🚀 Server running on port 3000
📊 Starting data preload...
🔄 Starting background data preload...
📊 Fetching students from Notion...
✅ Fetched 1234 students
📊 Fetching form updates from Google Sheets...
✅ Fetched form updates for 567 students
✅ Background data preload completed in 25.34s
```

### 2️⃣ 定期的な自動更新

**毎日 AM 2:00 (JST)** に自動的にデータを更新します。

- Cron式: `0 17 * * *` (UTC 17:00 = JST 2:00)
- 更新内容: Notion生徒データ + Google Sheetsフォーム更新日
- キャッシュ有効期限: 5分間

### 3️⃣ 手動更新機能

ユーザーが「🔄 最新データに更新」ボタンをクリックすると、即座にデータを再取得します。

---

## ⚙️ 技術仕様

### キャッシュ戦略

| データソース | キャッシュキー | 有効期限 |
|------------|--------------|---------|
| Notion生徒データ | `notion_students` | 5分間 |
| Google Sheetsフォーム | `sheets_form_updates` | 5分間 |

### データフロー

```
サーバー起動
  ↓
データプリロード（バックグラウンド）
  ↓
キャッシュに保存
  ↓
ユーザーアクセス → 即座に表示（キャッシュから）
  ↓
5分後のアクセス → 自動的にAPIから再取得
  ↓
毎日 AM 2:00 → 定期更新
```

---

## 📊 パフォーマンス比較

### 従来（キャッシュなし）

- **初回アクセス**: 10〜30秒
- **2回目アクセス**: 10〜30秒
- **毎回API呼び出し**: 遅い

### 現在（バックグラウンド更新 + キャッシュ）

- **初回アクセス**: **即座**（サーバー起動時にプリロード済み）
- **2回目アクセス（5分以内）**: **即座**（キャッシュから）
- **2回目アクセス（5分以降）**: 10〜30秒（自動的にAPIから再取得）

---

## 🔧 設定

### スケジュール変更

`server/services/backgroundService.js` で変更できます：

```javascript
// 毎日 AM 2:00 (JST)
const cronExpression = '0 17 * * *'; // UTC 17:00

// 例: 毎日 AM 3:00 (JST) に変更
const cronExpression = '0 18 * * *'; // UTC 18:00

// 例: 6時間ごと
const cronExpression = '0 */6 * * *';

// 例: 1時間ごと
const cronExpression = '0 * * * *';
```

### キャッシュ有効期限の変更

`server/services/cacheService.js` で変更できます：

```javascript
class CacheService {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5分間 → 変更可能
  }
}
```

---

## 🐛 トラブルシューティング

### データが古い場合

1. **手動更新**: 「🔄 最新データに更新」ボタンをクリック
2. **サーバー再起動**: Renderダッシュボードで再起動
3. **キャッシュクリア**: API経由で `/api/notion/cache/clear` (POST)

### スケジュール実行の確認

Renderのログで以下を確認：

```
⏰ Scheduled update triggered at 2:00 AM JST
🔄 Starting background data preload...
✅ Background data preload completed in 25.34s
```

---

## 📝 API エンドポイント

### 手動更新

```bash
POST /api/notion/update
```

**レスポンス:**
```json
{
  "success": true,
  "studentsCount": 1234,
  "formUpdatesCount": 567,
  "duration": "25.34s"
}
```

### キャッシュクリア

```bash
POST /api/notion/cache/clear
```

**レスポンス:**
```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

---

## 💡 ベストプラクティス

1. **定期更新時刻**: データが更新されるタイミング（深夜など）に設定
2. **キャッシュ有効期限**: データの鮮度要件に応じて調整
3. **手動更新**: 緊急時の更新手段として活用
4. **ログ監視**: Renderログで定期更新が正常に動作しているか確認

---

## 🔒 セキュリティ

- APIキーはサーバー側でのみ使用
- キャッシュはメモリ上に保存（再起動で消去）
- 手動更新エンドポイントは認証なし（必要に応じて追加可能）

---

最終更新: 2026-01-15
