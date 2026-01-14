# 🏗️ システムアーキテクチャ

## 📊 全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザー（ブラウザ）                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Render Web Service                            │
│                  (Node.js + Express)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              React Frontend (SPA)                        │  │
│  │  ┌──────────┬─────────────┬────────────┬──────────────┐ │  │
│  │  │Dashboard │Hearing List │Examination │Student Master│ │  │
│  │  │          │ (4ヶ月目)   │(5ヶ月目)   │              │ │  │
│  │  └──────────┴─────────────┴────────────┴──────────────┘ │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ /api/*                              │
│  ┌────────────────────────┴─────────────────────────────────┐  │
│  │             Express Backend (REST API)                   │  │
│  │  ┌────────────┬────────────────┬──────────────────────┐ │  │
│  │  │Notion Route│Students Route  │Date Utils            │ │  │
│  │  └────────────┴────────────────┴──────────────────────┘ │  │
│  └────────────────────────┬─────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ↓                  ↓                  ↓
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│   Notion API    │ │Google Sheets │ │   PostgreSQL    │
│  (生徒基本情報) │ │   API        │ │   (手動入力)    │
│                 │ │(フォーム更新)│ │                 │
│ • 名前          │ │              │ │ • 延長確度      │
│ • 学籍番号      │ │ • 最終更新月 │ │ • ヒアリング    │
│ • Tutor         │ │ • 学籍番号   │ │ • 審査結果      │
│ • プラン        │ │              │ │ • 備考          │
│ • 開始月        │ │              │ │                 │
│ • ステータス    │ │              │ │                 │
└─────────────────┘ └──────────────┘ └─────────────────┘
        │                    │                  │
        └────────────────────┴──────────────────┘
                             ↓
                    ┌─────────────────┐
                    │   Render DB     │
                    │  (PostgreSQL)   │
                    │  $7/month       │
                    └─────────────────┘
```

---

## 🔄 データフロー

### 1. ページ読み込み時

```
ユーザー → React App → Express API
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
        Notion API           Google Sheets API
              ↓                     ↓
        生徒基本情報          フォーム更新日
              └──────────┬──────────┘
                         ↓
              データマージ + 経過月数計算
                         ↓
        PostgreSQL: 手動入力データ取得
                         ↓
                    React App
                         ↓
                  ブラウザに表示
```

### 2. データ保存時

```
ユーザー入力 (延長確度、ヒアリング、審査結果、備考)
      ↓
  React App
      ↓
  POST /api/students/:studentId
      ↓
  Express API
      ↓
  PostgreSQL (UPSERT)
      ↓
  成功レスポンス
      ↓
  React App (状態更新)
      ↓
  ブラウザに反映
```

---

## 📦 技術スタック詳細

### フロントエンド
```
React 18.2.0
├── react-dom (DOM操作)
├── TailwindCSS (スタイリング)
└── Vite (ビルドツール)
```

### バックエンド
```
Node.js 18+
├── Express 4.18.2 (Webフレームワーク)
├── @notionhq/client 2.2.15 (Notion SDK)
├── googleapis 128.0.0 (Google API)
├── pg 8.11.3 (PostgreSQL クライアント)
├── date-fns 3.0.0 (日付計算)
└── cors, dotenv (ミドルウェア)
```

### データベース
```
PostgreSQL 15
└── student_extensions テーブル
    ├── id (SERIAL PRIMARY KEY)
    ├── student_id (VARCHAR(50) UNIQUE)
    ├── extension_certainty (VARCHAR(20))
    ├── hearing_status (BOOLEAN)
    ├── examination_result (VARCHAR(50))
    ├── notes (TEXT)
    ├── updated_at (TIMESTAMP)
    └── created_at (TIMESTAMP)
```

---

## 🔐 セキュリティ

### 環境変数（.env）
```
NODE_ENV=production
PORT=3000
NOTION_API_KEY=secret_*****    # ← 秘密情報
NOTION_DATABASE_ID=******      # ← 秘密情報
GOOGLE_API_KEY=******          # ← 秘密情報
GOOGLE_SHEETS_ID=******        # ← 公開OK
DATABASE_URL=postgresql://***  # ← 秘密情報
```

### アクセス制御
- Notion: Integration経由のみアクセス可能
- Google Sheets: APIキー認証
- PostgreSQL: 内部URL（Render内部のみ）

⚠️ **注意**: 現在、フロントエンドに認証機構はありません。本番環境では認証の実装を推奨します。

---

## 📈 スケーラビリティ

### 現在の構成（Starter Plan）
- **同時接続数**: ~100ユーザー
- **リクエスト/秒**: ~10req/s
- **データベース**: 256MB RAM, 1GB storage
- **コスト**: $14/月

### スケールアップオプション
1. **Render Pro Plan** ($25/月):
   - 同時接続数: ~1000ユーザー
   - より高速なCPU/メモリ

2. **PostgreSQL Standard** ($20/月):
   - 1GB RAM, 10GB storage
   - 自動バックアップ

3. **CDN導入**:
   - Cloudflare Pages でフロントエンドを配信
   - レイテンシ削減

---

## 🔄 API エンドポイント

### Notion関連
```
GET  /api/notion/students      # 全生徒取得
GET  /api/notion/hearing        # ヒアリング対象（4ヶ月目）
GET  /api/notion/examination    # 延長審査対象（5ヶ月目）
```

### 生徒管理
```
GET  /api/students/:studentId   # 個別データ取得
POST /api/students/:studentId   # 個別データ保存
POST /api/students/bulk         # 一括データ取得
```

### システム
```
GET  /api/health               # ヘルスチェック
```

---

## 🚀 パフォーマンス最適化

### 実装済み
1. **データキャッシング**: PostgreSQLで手動入力データをキャッシュ
2. **一括取得**: `/api/students/bulk`で複数生徒のデータを1回のクエリで取得
3. **経過月数の事前計算**: サーバー側で計算してフロントエンドに送信

### 今後の改善案
1. **Redis導入**: Notion/Sheetsのレスポンスをキャッシュ（15分TTL）
2. **Webhook連携**: Notion更新時に自動同期
3. **ページネーション**: 生徒数が増えた場合の対応

---

## 📊 監視・ログ

### Renderダッシュボード
- デプロイログ
- リアルタイムログ
- メトリクス（CPU/メモリ使用率）

### エラーハンドリング
```javascript
try {
  // API呼び出し
} catch (error) {
  console.error('Error:', error)
  res.status(500).json({ success: false, error: error.message })
}
```

---

## 🎯 システムの強み

1. **自動計算**: レッスン開始月から経過月数を自動計算
2. **リアルタイム**: Notion更新後、即座に反映
3. **柔軟な管理**: 手動入力項目で細かい管理が可能
4. **シンプル**: 複雑な認証不要で即座に利用開始
5. **コスト効率**: $14/月で完全管理可能

---

## 📝 今後の拡張案

1. **認証機能**: JWT認証でセキュリティ強化
2. **通知機能**: メール/Slack通知
3. **エクスポート**: CSV/Excelダウンロード
4. **統計ダッシュボード**: グラフ表示
5. **モバイルアプリ**: React Native展開
