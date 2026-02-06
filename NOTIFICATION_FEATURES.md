# 通知機能 & スケジューラー

## 📋 実装した機能

### ① 休会終了通知（Slack）
- **スケジュール**: 毎月15日 AM 9:00 JST
- **送信先**: Slack（Webhook URL）
- **送信内容**:
  - 生徒名
  - 学籍番号
  - Notionリンク
  - 休会終了日（開始日 + 休会月数の月末）

**計算例**:
```
開始日: 2024-11-01
休会月数: 3ヶ月
→ 2024年11月 + 3ヶ月 = 2025年1月31日（月末）
→ 2025年1月15日に通知送信
```

### ② 月次生徒リスト通知（Discord）
- **スケジュール**: 毎月1日 AM 9:00 JST
- **送信先**: 各担当TutorのDiscord Webhook
- **送信内容**:
  - 今月のヒアリング対象（4ヶ月目・10ヶ月目）
  - 今月の延長審査対象（5ヶ月目・11ヶ月目）
  - 担当Tutorごとにグループ化

### ③ 未完了リスト通知（Discord）
- **スケジュール**: 毎月20日 AM 9:00 JST
- **送信先**: 各担当TutorのDiscord Webhook
- **送信内容**:
  - ヒアリング未完了の生徒
  - 審査結果未入力の生徒
  - 担当Tutorごとにグループ化

### ④ 審査結果フォーム確認
- **タイミング**: 延長審査一覧で審査結果を入力時
- **確認内容**: Google Sheetsのフォーム回答をチェック
- **動作**: 未送信の場合、警告ポップアップを表示
  - 「⚠️ 審査結果フォームが未送信です。フォームを送信してください」

---

## 🗓️ スケジュール一覧

| 機能 | スケジュール | 送信先 | 内容 |
|------|------------|--------|------|
| データ更新 | 毎日 AM 2:00 JST | - | Notion/Sheets データ取得 |
| 月次生徒リスト | 毎月1日 AM 9:00 JST | Discord（Tutor別） | ヒアリング・審査対象 |
| 休会終了通知 | 毎月15日 AM 9:00 JST | Slack | 今月終了予定の休会生徒 |
| 未完了リスト | 毎月20日 AM 9:00 JST | Discord（Tutor別） | 未完了の生徒 |

---

## ⚙️ 環境変数設定

### 必須の環境変数

```bash
# Slack Webhook（休会終了通知用）
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Tutor Webhook スプレッドシート ID
TUTOR_WEBHOOK_SHEET_ID=13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs

# Google Sheets API（既存）
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_SHEETS_ID=1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ
```

### Renderでの設定手順

1. **Renderダッシュボード**を開く
2. プロジェクトの**Environment**タブへ
3. 以下の環境変数を追加:
   - `SLACK_WEBHOOK_URL`: Slackのインカミング Webhook URL
   - `TUTOR_WEBHOOK_SHEET_ID`: `13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs`
4. **Save Changes**をクリック（自動再デプロイ）

---

## 📊 Tutor Webhook スプレッドシート

### スプレッドシート構造
- **URL**: https://docs.google.com/spreadsheets/d/13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs/edit?gid=2058276273#gid=2058276273
- **A列**: Tutor名（例: りほ先生、先生りほ）
- **E列**: WTCチャットURL（Discord Webhook URL）

### Tutor名の正規化
- システムが自動的に「先生」を除去して照合
- Notion: 「先生りほ」
- スプレッドシート: 「りほ先生」
- → 正規化後: 「りほ」で照合 ✅

### 例

| A列（Tutor名） | E列（WTCチャットURL） |
|---------------|---------------------|
| りほ先生 | https://discord.com/api/webhooks/... |
| たけし先生 | https://discord.com/api/webhooks/... |
| 先生さくら | https://discord.com/api/webhooks/... |

---

## 📝 審査結果フォームの確認

### フォーム回答スプレッドシート
- **URL**: https://docs.google.com/spreadsheets/d/1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ/edit?gid=1473368384#gid=1473368384
- **シート名**: フォームの回答 1
- **B列**: タイムスタンプ
- **E列**: 学籍番号

### 確認ロジック
1. 審査結果が入力された場合
2. スプレッドシートの「フォームの回答 1」シートを確認
3. 学籍番号（E列）とタイムスタンプの月（B列）が一致する行を検索
4. 一致する行が**ない**場合 → 警告ポップアップ表示

### 例

**ケース1: フォーム送信済み（ポップアップなし）**
```
学籍番号: OLTS240001
タイムスタンプ: 2026-02-10 14:30:00
現在月: 2026-02
→ 一致する行あり ✅ ポップアップなし
```

**ケース2: フォーム未送信（ポップアップあり）**
```
学籍番号: OLTS240002
タイムスタンプ: 2026-01-15 10:00:00
現在月: 2026-02
→ 一致する行なし ⚠️ 警告ポップアップ
「審査結果フォームが未送信です。フォームを送信してください」
```

---

## 🧪 テスト用API

### 手動通知送信（テスト用）

```bash
# 1. 休会終了通知を送信
curl -X POST https://extended-management.onrender.com/api/notifications/suspension-end

# 2. 月次生徒リストを送信
curl -X POST https://extended-management.onrender.com/api/notifications/monthly-student-list

# 3. 未完了リストを送信
curl -X POST https://extended-management.onrender.com/api/notifications/incomplete-list

# 4. 審査結果フォームを確認
curl -X POST https://extended-management.onrender.com/api/notifications/check-examination-form \
  -H "Content-Type: application/json" \
  -d '{"studentId":"OLTS240001"}'
```

### レスポンス例

```json
{
  "success": true,
  "count": 5,
  "message": "Notifications sent successfully"
}
```

---

## 🏗️ アーキテクチャ

### サービス構成

```
backgroundService.js
├── initializeDataPreload()       # サーバー起動時
├── scheduleDailyUpdate()         # 毎日 AM 2:00
├── scheduleSuspensionEnd...()    # 毎月15日 AM 9:00
├── scheduleMonthlyStudent...()   # 毎月1日 AM 9:00
└── scheduleIncompleteList...()   # 毎月20日 AM 9:00

slackService.js
└── sendSuspensionEndNotification()  # Slack通知

discordService.js
├── sendMonthlyStudentListToTutors()     # 月次リスト
└── sendIncompleteStudentListToTutors()  # 未完了リスト

tutorWebhookService.js
├── getTutorWebhooks()     # Webhook URL取得
└── normalizeTutorName()   # Tutor名正規化

sheetsService.js
└── checkExaminationFormSubmission()  # フォーム確認
```

### データフロー

```
Cron Scheduler
    ↓
backgroundService
    ↓
fetchStudentsFromNotion() + fetchSuspensionData()
    ↓
Calculate suspension end dates
    ↓
Filter students (this month)
    ↓
slackService / discordService
    ↓
Send notifications to Slack / Discord
```

---

## 🚀 デプロイ情報

- **GitHub**: プッシュ済み ✅
  - コミット: `f014975` - feat: Add scheduled notifications and examination form check
  - リポジトリ: https://github.com/kyo10310415/extended-management
- **アプリURL**: https://extended-management.onrender.com/
- **Render**: 自動デプロイ中（約3〜5分）

---

## 🔍 動作確認手順

### 1. 環境変数の設定（必須）

#### Renderダッシュボード:
```
Environment タブ:
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
  TUTOR_WEBHOOK_SHEET_ID=13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs
```

### 2. デプロイ完了確認

Renderログで以下を確認:
```
✅ Server initialization completed
⏰ Scheduling daily data update at 2:00 AM JST (17:00 UTC)
⏰ Scheduling suspension end notifications on 15th of each month at 9:00 AM JST
⏰ Scheduling monthly student list notifications on 1st of each month at 9:00 AM JST
⏰ Scheduling incomplete list notifications on 20th of each month at 9:00 AM JST
```

### 3. テスト実行

#### 3-1. 休会終了通知テスト
```bash
curl -X POST https://extended-management.onrender.com/api/notifications/suspension-end
```

**期待される動作**:
- Slackに通知が送信される
- 今月終了予定の休会生徒がリスト表示される

#### 3-2. 月次生徒リストテスト
```bash
curl -X POST https://extended-management.onrender.com/api/notifications/monthly-student-list
```

**期待される動作**:
- 各Tutorのディスコードに通知が送信される
- ヒアリング対象と延長審査対象が表示される

#### 3-3. 未完了リストテスト
```bash
curl -X POST https://extended-management.onrender.com/api/notifications/incomplete-list
```

**期待される動作**:
- 各Tutorのディスコードに通知が送信される
- ヒアリング未完了と審査結果未入力の生徒が表示される

#### 3-4. 審査結果フォーム確認テスト

1. アプリURLを開く: https://extended-management.onrender.com/
2. **延長審査一覧**へ移動
3. 審査結果を入力
4. **期待される動作**:
   - フォームが未送信の場合 → 警告ポップアップ表示
   - フォームが送信済みの場合 → ポップアップなし

---

## 📌 まとめ

### 実装完了 ✅

1. ✅ 休会終了通知（Slack）- 毎月15日 AM 9:00
2. ✅ 月次生徒リスト通知（Discord）- 毎月1日 AM 9:00
3. ✅ 未完了リスト通知（Discord）- 毎月20日 AM 9:00
4. ✅ 審査結果フォーム確認 - 審査結果入力時

### 必要なアクション

1. **Renderで環境変数を設定**:
   - `SLACK_WEBHOOK_URL`
   - `TUTOR_WEBHOOK_SHEET_ID`（既に設定値あり）
2. **Tutor Webhook スプレッドシート**を更新:
   - A列: Tutor名
   - E列: Discord Webhook URL
3. **テストAPI**で動作確認

### 次のステップ

- 環境変数設定後、テストAPIで各通知機能を確認
- スケジューラーは自動実行されるため、初回は翌日以降に確認
- Renderログでスケジューラーの起動を確認

---

## 💡 補足

### タイムゾーン
- Renderのデフォルトタイムゾーン: UTC
- JST = UTC + 9時間
- Cron式はUTCで設定（自動的にJSTに変換）

### 休会終了日の計算
```javascript
const startDate = new Date(student.lessonStartDate);
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + suspension.suspensionMonths);
endDate.setDate(0); // 月末日に設定
```

### Tutor名の正規化
```javascript
function normalizeTutorName(tutorName) {
  return tutorName.replace(/先生/g, '');
}
// 「先生りほ」→ 「りほ」
// 「りほ先生」→ 「りほ」
```

---

完了！🚀
