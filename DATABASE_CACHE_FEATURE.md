# データベースキャッシュ & 定期更新機能

## 📋 実装内容

### 1. CSV出力時の経過月数調整 ✅
- **休会を引いた調整後の値で出力**
- 計算式: `adjustedMonths = monthsElapsed - suspensionMonths`
- 最小値は0（負の値にならない）

### 2. データベースキャッシュ ✅
- **PostgreSQLにNotionデータをキャッシュ**
- 初回読み込みの高速化を実現
- Notion APIの呼び出し回数を削減

### 3. 定期更新スケジュール ✅
- **毎日午前2時（JST）にNotionデータを自動更新**
- `node-cron`を使用したスケジューリング
- サーバー起動時にも初回データをプリロード

---

## 🗄️ データベース設計

### テーブル: `notion_students_cache`

```sql
CREATE TABLE notion_students_cache (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100),
  tutor VARCHAR(100),
  plan VARCHAR(50),
  lesson_start_date DATE,
  status VARCHAR(50),
  character_name VARCHAR(100),
  yt_channel_id VARCHAR(100),
  x_id VARCHAR(100),
  notion_url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### インデックス
- `student_id`: 学籍番号での高速検索
- `status`: ステータスフィルタリング
- `tutor`: 担任Tutorフィルタリング

---

## ⚙️ キャッシュロジック

### データ取得フロー

```
┌─────────────────────────────────────┐
│ fetchStudents()                     │
└─────────────┬───────────────────────┘
              │
              ▼
      ┌───────────────┐
      │ forceRefresh? │
      └───────┬───────┘
              │
      ┌───────┴────────┐
      │ Yes            │ No
      ▼                ▼
┌──────────┐    ┌──────────────┐
│ Notion   │    │ Check Cache  │
│ API      │    │ Last Update  │
└─────┬────┘    └──────┬───────┘
      │                │
      │         ┌──────┴───────┐
      │         │ <1 hour old? │
      │         └──────┬───────┘
      │                │
      │         ┌──────┴──────┐
      │         │ Yes         │ No
      │         ▼             ▼
      │    ┌─────────┐  ┌──────────┐
      │    │ Return  │  │ Notion   │
      │    │ Cache   │  │ API      │
      │    └─────────┘  └─────┬────┘
      │                        │
      └────────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ Save to Cache  │
      └────────┬───────┘
               │
               ▼
          ┌─────────┐
          │ Return  │
          └─────────┘
```

### キャッシュ有効期限
- **1時間**: データベースキャッシュの有効期限
- 1時間以内: データベースから高速取得
- 1時間以上: Notion APIから最新データ取得 → データベース更新

---

## 🕐 定期更新スケジュール

### スケジュール設定
- **実行時刻**: 毎日午前2:00（JST）
- **Cron式**: `0 17 * * *` (UTC 17:00 = JST AM 2:00)
- **タイムゾーン**: UTC（Render環境）

### 更新内容
1. Notionから最新の生徒データ取得
2. Google Sheetsからフォーム更新日取得
3. Google Sheetsから休会情報取得
4. データベースキャッシュに保存

### 手動更新
フロントエンドの「🔄 最新データに更新」ボタンで手動更新可能

```javascript
// API: POST /api/notion/update
const result = await axios.post('/api/notion/update');
```

---

## 📊 CSV出力の調整後経過月数

### 計算ロジック

```javascript
const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
const suspension = suspensionData[student.studentId];

// 休会を引いた調整後の経過月数
const adjustedMonths = suspension 
  ? Math.max(0, monthsElapsed - suspension.suspensionMonths)
  : monthsElapsed;
```

### 例
- レッスン開始: 2024年1月
- 現在: 2024年7月
- 実際の経過月数: 6ヶ月
- 休会月数: 2ヶ月
- **調整後の経過月数: 4ヶ月** ← CSV出力値

---

## 🚀 デプロイ後の動作

### 1. マイグレーション自動実行
- Renderデプロイ時に`npm install`で`postinstall`スクリプトが実行
- `npm run migrate`でテーブル作成
- `DATABASE_URL`が無い場合はスキップ（開発環境）

### 2. サーバー起動時
- `initializeDataPreload()`が実行
- 初回データをNotionとGoogle Sheetsから取得
- データベースキャッシュに保存

### 3. 定期更新
- `scheduleDailyUpdate()`がスケジューラーを起動
- 毎日午前2時に自動更新

---

## 📝 実装ファイル

### 新規作成
1. `migrations/004_create_notion_students_cache.sql` - テーブル定義
2. `server/services/databaseCacheService.js` - キャッシュサービス
3. `run-migration.js` - マイグレーション実行スクリプト

### 修正
1. `server/services/notionService.js` - キャッシュロジック追加
2. `server/services/googleSheetsService.js` - 調整後経過月数を使用
3. `package.json` - マイグレーションスクリプト追加

### 既存（変更なし）
1. `server/services/backgroundService.js` - スケジューラー（既に実装済み）
2. `server/routes/notion.js` - 更新API（既に実装済み）

---

## ✅ 期待効果

### パフォーマンス改善
- 初回ロード時間: **数秒 → 100ms以下**
- Notion API呼び出し: **毎回 → 1時間に1回 + 定期更新**

### データ信頼性
- 定期更新で常に最新データを保持
- 手動更新も可能（必要に応じて即座に更新）

### コスト削減
- Notion API呼び出し回数の大幅削減
- レート制限リスクの低減

---

## 🔍 動作確認方法

### 1. ローカル開発環境
```bash
# DATABASE_URLが設定されていないのでスキップ
npm install
# ⏩ Skipping migration: DATABASE_URL not set
```

### 2. Render環境（本番）
```bash
# デプロイ時に自動実行
npm install
# 🔄 Running migration 004_create_notion_students_cache.sql...
# ✅ Migration completed successfully

# サーバー起動
npm start
# 🚀 Initializing data preload on server startup...
# 📊 Fetching students from Notion and saving to database...
# ✅ Fetched 1311 students and saved to database
# ⏰ Scheduling daily update at 2:00 AM JST (17:00 UTC)
# ✅ Daily update scheduler started
```

### 3. キャッシュ動作確認
```bash
# 1回目のAPI呼び出し（Notion APIから取得）
# 🔄 Fetching fresh data from Notion API...
# 💾 Caching 1311 students to database...

# 2回目のAPI呼び出し（キャッシュから取得）
# 📦 Using database cache (updated 5 minutes ago)
# 📦 Retrieved 1311 students from database cache
```

---

## 📌 まとめ

### 実装完了 ✅
1. ✅ CSV出力時の経過月数は休会調整後の値を使用
2. ✅ データベースキャッシュで初回読み込み高速化
3. ✅ 毎日午前2時にNotion API自動更新
4. ✅ 手動更新機能も利用可能

### 次のステップ
1. Renderにデプロイ（自動実行）
2. ログで動作確認
3. 生徒情報マスタで「CSV出力」テスト
4. 翌日午前2時に自動更新を確認

---

## 💡 補足

### タイムゾーン設定
- Renderのデフォルトタイムゾーンは UTC
- JST（日本標準時）= UTC + 9時間
- 午前2時（JST）= 前日17時（UTC）

### キャッシュクリア方法
```javascript
// フロントエンドから手動更新
await axios.post('/api/notion/update');
// → キャッシュクリア + 最新データ取得 + データベース保存
```

### マイグレーション再実行
```bash
# Render環境で手動実行する場合
npm run migrate
```
