# Slack メンション機能の設定ガイド

## 📋 概要

休会終了通知に`@tutors`ユーザーグループへのメンションを追加する方法を説明します。

---

## 🎯 メンションの動作

### メンション設定あり（推奨）
```
@tutors 🔔 休会終了予定のお知らせ
今月中に休会期間が終了する生徒は 3名 です。
```
- `@tutors`グループのメンバー全員に通知が届きます
- Slackのモバイルアプリでもプッシュ通知が届きます

### メンション設定なし
```
@tutors 🔔 休会終了予定のお知らせ
今月中に休会期間が終了する生徒は 3名 です。
```
- `@tutors`はただのテキストとして表示されます
- メンション通知は届きません

---

## 🔧 Slackユーザーグループ IDの取得方法

### 方法1: Slack UIから取得（簡単・推奨）

#### 1. Slackワークスペースを開く
ブラウザでSlackを開きます（デスクトップアプリでも可）

#### 2. ユーザーグループを探す
1. 左サイドバーの**「その他」**をクリック
2. **「メンバー・ユーザーグループ」**をクリック
3. **「ユーザーグループ」**タブを選択

#### 3. tutorsグループを開く
1. **@tutors**グループをクリック
2. グループの詳細ページが開きます

#### 4. グループIDをコピー
**URLからIDを取得**:
```
https://app.slack.com/client/T01234ABCDE/browse-user-groups/user_groups/S01234ABCDE
                                                                    ↑
                                                            このIDをコピー
```

**形式**: `S` で始まる11文字（例: `S01234ABCDE`）

---

### 方法2: Slack APIから取得

#### 1. Slack APIページにアクセス
https://api.slack.com/apps

#### 2. アプリを選択
既存の「WannaV 休会終了通知」アプリを選択

#### 3. OAuth & Permissions を開く

#### 4. Scopesを追加
**User Token Scopes**に以下を追加:
- `usergroups:read`

#### 5. アプリを再インストール
1. **Reinstall to Workspace**をクリック
2. 権限を許可

#### 6. User OAuth Tokenをコピー
```
xoxp-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 7. curlでグループIDを取得
```bash
curl -X GET "https://slack.com/api/usergroups.list" \
  -H "Authorization: Bearer xoxp-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

#### 8. レスポンスからIDを探す
```json
{
  "ok": true,
  "usergroups": [
    {
      "id": "S01234ABCDE",
      "name": "tutors",
      "handle": "tutors",
      "description": "Tutor group",
      ...
    }
  ]
}
```

**`id`フィールドの値**（`S01234ABCDE`）をコピー

---

## ⚙️ Renderに環境変数を設定

### 1. Renderダッシュボードを開く
https://dashboard.render.com/

### 2. プロジェクトの Environment タブを開く

### 3. 環境変数を追加

```bash
# 既存の環境変数
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX

# 新規追加
SLACK_MENTION_GROUP_ID=S01234ABCDE
```

**注意**: `S` で始まる11文字のIDを入力してください。

### 4. Save Changes
自動的に再デプロイされます（約3〜5分）

---

## 🧪 動作確認

### 1. テスト送信
```bash
curl -X POST https://extended-management.onrender.com/api/notifications/suspension-end
```

### 2. 期待される結果

**Slackチャンネル**:
```
@tutors 🔔 休会終了予定のお知らせ
今月中に休会期間が終了する生徒は 3名 です。

──────────────────
山田太郎 (OLTS240001)
休会終了日: 2026-02-28
Notionページを開く
```

**@tutorsグループのメンバー**:
- Slackの通知音が鳴る
- モバイルアプリにプッシュ通知が届く
- 通知バッジが表示される

---

## 🔍 メンション形式の詳細

### Slackのメンション構文

```
<!subteam^S01234ABCDE|@tutors>
```

- `<!subteam^`: ユーザーグループメンション開始
- `S01234ABCDE`: ユーザーグループID
- `|@tutors>`: 表示名（任意）

### コード内の実装

```javascript
const mention = SLACK_MENTION_GROUP_ID 
  ? `<!subteam^${SLACK_MENTION_GROUP_ID}|@tutors>`  // グループID設定あり → メンション
  : '@tutors';  // グループID設定なし → ただのテキスト
```

---

## 📌 tutorsユーザーグループの作成方法

### もし`@tutors`グループが存在しない場合

#### 1. Slackワークスペースを開く

#### 2. ユーザーグループを作成
1. 左サイドバーの**「その他」**
2. **「メンバー・ユーザーグループ」**
3. **「ユーザーグループ」**タブ
4. **「ユーザーグループを作成」**をクリック

#### 3. グループ情報を入力
```
名前: tutors
ハンドル: @tutors
説明: チューターグループ - 休会終了通知を受け取る
```

#### 4. メンバーを追加
- チューターのメンバーを全員追加

#### 5. 作成完了
- グループが作成されます
- 上記の手順でグループIDを取得してください

---

## 🔧 トラブルシューティング

### メンションが機能しない

#### 原因1: グループIDが間違っている
**確認方法**:
```bash
# URLからIDを確認
https://app.slack.com/client/T01234ABCDE/browse-user-groups/user_groups/S01234ABCDE
```

#### 原因2: グループIDが設定されていない
**確認方法**:
```bash
# Renderの Environment タブを確認
SLACK_MENTION_GROUP_ID が設定されているか確認
```

#### 原因3: グループが削除された
**確認方法**:
- Slackのユーザーグループ一覧で`@tutors`が存在するか確認

### メンションが`@tutors`とテキスト表示される

**原因**: `SLACK_MENTION_GROUP_ID`が設定されていない

**解決方法**:
1. Renderの Environment タブを開く
2. `SLACK_MENTION_GROUP_ID=S01234ABCDE`を追加
3. Save Changes

---

## 📊 メンション通知の例

### 通知内容
```
@tutors 🔔 休会終了予定のお知らせ

今月中に休会期間が終了する生徒は 3名 です。

──────────────────

山田太郎 (OLTS240001)
休会終了日: 2026-02-28
https://notion.so/...

──────────────────

佐藤花子 (OLTS240002)
休会終了日: 2026-02-28
https://notion.so/...

──────────────────

鈴木一郎 (OLTS240003)
休会終了日: 2026-02-28
https://notion.so/...
```

### 通知を受け取るメンバー
- `@tutors`グループに所属する全メンバー
- Slackのモバイルアプリにもプッシュ通知
- メールにも転送可能（Slack設定による）

---

## 🔒 セキュリティとベストプラクティス

### 1. グループIDは環境変数で管理
```bash
# ✅ 正しい
SLACK_MENTION_GROUP_ID=S01234ABCDE

# ❌ 間違い（コードに直接記述しない）
const groupId = 'S01234ABCDE';
```

### 2. グループメンバーを定期的に確認
- 退職者が含まれていないか
- 必要なメンバーが全員含まれているか

### 3. 通知頻度を考慮
- 毎月15日の1回のみ
- スパムにならないように注意

---

## 📌 まとめ

### 設定手順（簡略版）

1. **SlackでtutorsグループのIDを取得**:
   - Slack → ユーザーグループ → @tutors → URLからIDをコピー
   - 形式: `S01234ABCDE`

2. **Renderに環境変数を追加**:
   ```bash
   SLACK_MENTION_GROUP_ID=S01234ABCDE
   ```

3. **Save Changes** → 再デプロイ（約3〜5分）

4. **テスト送信**:
   ```bash
   curl -X POST https://extended-management.onrender.com/api/notifications/suspension-end
   ```

5. **確認**:
   - Slackで`@tutors`メンションが青色になっているか
   - グループメンバーに通知が届いているか

---

これで`@tutors`メンション機能が有効になります！🎉
