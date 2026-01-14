# 📚 API ドキュメント

## ベースURL

- **開発環境**: `http://localhost:3000`
- **本番環境**: `https://your-app-name.onrender.com`

---

## 🔌 エンドポイント一覧

### 1. ヘルスチェック

#### `GET /api/health`

サーバーの稼働状況を確認します。

**レスポンス例:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-14T10:30:00.000Z"
}
```

---

### 2. Notion関連

#### `GET /api/notion/students`

Notionから全生徒情報を取得します。

**レスポンス例:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notion-page-id",
      "studentId": "OLTS240270-VO",
      "name": "黒田 凪晴",
      "tutor": "かずは先生",
      "plan": "生徒プラン",
      "lessonStartDate": "2024/06/01",
      "status": "在籍",
      "monthsElapsed": 7,
      "formLastUpdate": "2024/12/01",
      "notionUrl": "https://notion.so/..."
    }
  ],
  "count": 67
}
```

#### `GET /api/notion/hearing`

4ヶ月目の生徒（ヒアリング対象）を取得します。

**レスポンス例:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notion-page-id",
      "studentId": "OLTS240270-VO",
      "name": "黒田 凪晴",
      "tutor": "かずは先生",
      "plan": "生徒プラン",
      "lessonStartDate": "2024/10/01",
      "status": "在籍",
      "monthsElapsed": 4,
      "formLastUpdate": "2024/12/01"
    }
  ],
  "count": 12
}
```

#### `GET /api/notion/examination`

5ヶ月目の生徒（延長審査対象）を取得します。

**レスポンス例:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notion-page-id",
      "studentId": "OLTS240270-VO",
      "name": "黒田 凪晴",
      "tutor": "かずは先生",
      "plan": "生徒プラン",
      "lessonStartDate": "2024/09/01",
      "status": "在籍",
      "monthsElapsed": 5,
      "formLastUpdate": "2024/12/01"
    }
  ],
  "count": 15
}
```

---

### 3. 生徒延長管理データ

#### `GET /api/students/:studentId`

特定の生徒の延長管理データを取得します。

**パラメータ:**
- `studentId`: 学籍番号（例: `OLTS240270-VO`）

**レスポンス例:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "student_id": "OLTS240270-VO",
    "extension_certainty": "高",
    "hearing_status": true,
    "examination_result": "延長",
    "notes": "意欲がめちゃめちゃあります！",
    "updated_at": "2025-01-14T10:30:00.000Z",
    "created_at": "2025-01-14T10:00:00.000Z"
  }
}
```

データが存在しない場合:
```json
{
  "success": true,
  "data": null
}
```

#### `POST /api/students/:studentId`

生徒の延長管理データを作成または更新します。

**パラメータ:**
- `studentId`: 学籍番号（例: `OLTS240270-VO`）

**リクエストボディ:**
```json
{
  "extension_certainty": "高",
  "hearing_status": true,
  "examination_result": "延長",
  "notes": "意欲がめちゃめちゃあります！"
}
```

**フィールド説明:**
- `extension_certainty`: 延長確度（`"高"`, `"中"`, `"低"`, `"対象外"`）
- `hearing_status`: ヒアリング済みか（`true` / `false`）
- `examination_result`: 審査結果（`"延長"`, `"在籍"`, `"退会"`, `"永久会員"`）
- `notes`: 備考（任意のテキスト）

**レスポンス例:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "student_id": "OLTS240270-VO",
    "extension_certainty": "高",
    "hearing_status": true,
    "examination_result": "延長",
    "notes": "意欲がめちゃめちゃあります!",
    "updated_at": "2025-01-14T10:30:00.000Z",
    "created_at": "2025-01-14T10:00:00.000Z"
  }
}
```

#### `POST /api/students/bulk`

複数の生徒の延長管理データを一括取得します。

**リクエストボディ:**
```json
{
  "studentIds": [
    "OLTS240270-VO",
    "OLTS240584-HT",
    "OLTS240604-CN"
  ]
}
```

**レスポンス例:**
```json
{
  "success": true,
  "data": {
    "OLTS240270-VO": {
      "id": 1,
      "student_id": "OLTS240270-VO",
      "extension_certainty": "高",
      "hearing_status": true,
      "examination_result": "延長",
      "notes": "意欲がめちゃめちゃあります！",
      "updated_at": "2025-01-14T10:30:00.000Z",
      "created_at": "2025-01-14T10:00:00.000Z"
    },
    "OLTS240584-HT": {
      "id": 2,
      "student_id": "OLTS240584-HT",
      "extension_certainty": "高",
      "hearing_status": true,
      "examination_result": "在籍",
      "notes": "意欲がめちゃめちゃあります！",
      "updated_at": "2025-01-14T10:31:00.000Z",
      "created_at": "2025-01-14T10:01:00.000Z"
    }
  }
}
```

---

## ❌ エラーレスポンス

すべてのエラーは以下の形式で返されます:

```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

**HTTPステータスコード:**
- `400`: リクエストが不正
- `404`: リソースが見つからない
- `500`: サーバー内部エラー

---

## 🔒 認証

現在、APIは認証なしで使用できます。

⚠️ **セキュリティ注意**: 本番環境では、適切な認証機構（JWT、APIキーなど）の実装を推奨します。

---

## 📊 データフロー

```
1. フロントエンド → /api/notion/students
   ↓
2. バックエンド → Notion API + Google Sheets API
   ↓
3. データ処理（経過月数計算、フォーム更新日の紐付け）
   ↓
4. フロントエンド ← JSON レスポンス

5. フロントエンド → /api/students/bulk
   ↓
6. バックエンド → PostgreSQL
   ↓
7. フロントエンド ← 延長管理データ

8. ユーザー入力（延長確度、ヒアリング、審査結果、備考）
   ↓
9. フロントエンド → /api/students/:studentId (POST)
   ↓
10. バックエンド → PostgreSQL (UPSERT)
    ↓
11. フロントエンド ← 更新完了
```

---

## 🧪 テスト用curlコマンド

### ヘルスチェック
```bash
curl http://localhost:3000/api/health
```

### 全生徒取得
```bash
curl http://localhost:3000/api/notion/students
```

### ヒアリング対象取得
```bash
curl http://localhost:3000/api/notion/hearing
```

### 延長審査対象取得
```bash
curl http://localhost:3000/api/notion/examination
```

### 延長管理データ取得
```bash
curl http://localhost:3000/api/students/OLTS240270-VO
```

### 延長管理データ保存
```bash
curl -X POST http://localhost:3000/api/students/OLTS240270-VO \
  -H "Content-Type: application/json" \
  -d '{
    "extension_certainty": "高",
    "hearing_status": true,
    "examination_result": "延長",
    "notes": "テスト備考"
  }'
```

### 一括取得
```bash
curl -X POST http://localhost:3000/api/students/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "studentIds": ["OLTS240270-VO", "OLTS240584-HT"]
  }'
```

---

## 🔄 レート制限

### Notion API
- 3 requests per second

### Google Sheets API
- 100 requests per 100 seconds per user

⚠️ **注意**: 大量のリクエストを送信する場合は、適切な間隔を設けてください。

---

## 📝 変更履歴

### v1.0.0 (2025-01-14)
- 初回リリース
- Notion API連携
- Google Sheets API連携
- PostgreSQL連携
- CRUD操作の実装
