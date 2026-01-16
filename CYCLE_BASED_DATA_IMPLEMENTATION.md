# 🎯 サイクル別データ管理機能 - 実装完了

## 📋 実装内容

### アイデアの実現

**あなたのアイデア:**
> フィールドを①と②に分けることで、4ヶ月・5ヶ月は①を使用し、10ヶ月・11ヶ月は②を使用する。
> これで10ヶ月目に戻った時には②が空欄（新規）になり、見た目上リセットされているように見える。

**実装結果:** ✅ 完全に実現しました！

---

## 🗄️ データベース設計

### 新しいテーブル構造

```sql
CREATE TABLE student_extensions (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  
  -- 1回目（4ヶ月目・5ヶ月目用）
  extension_certainty_1 VARCHAR(20),
  hearing_status_1 BOOLEAN DEFAULT false,
  examination_result_1 VARCHAR(50),
  notes_1 TEXT,
  
  -- 2回目（10ヶ月目・11ヶ月目用）
  extension_certainty_2 VARCHAR(20),
  hearing_status_2 BOOLEAN DEFAULT false,
  examination_result_2 VARCHAR(50),
  notes_2 TEXT,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### フィールドの使い分け

| 継続月数 | サイクル | 使用フィールド | 説明 |
|---------|---------|---------------|------|
| 4ヶ月目 | 1回目 | `_1` | ヒアリング（1回目） |
| 5ヶ月目 | 1回目 | `_1` | 延長審査（1回目） |
| 10ヶ月目 | 2回目 | `_2` | ヒアリング（2回目） |
| 11ヶ月目 | 2回目 | `_2` | 延長審査（2回目） |

---

## 🔄 動作の流れ

### 1回目（4ヶ月目・5ヶ月目）

```
4ヶ月目（ヒアリング）
  ↓ 
  延長確度_1 に入力
  ヒアリング_1 にチェック
  備考_1 に記入
  ↓
5ヶ月目（延長審査）
  ↓
  延長確度_1 が引き継がれる（自動）
  ヒアリング_1 が引き継がれる（自動）
  備考_1 が引き継がれる（自動）
  審査結果_1 に入力
```

### 2回目（10ヶ月目・11ヶ月目）

```
10ヶ月目（ヒアリング）
  ↓
  延長確度_2 は空欄（新規入力） ← ✨ リセットされて見える！
  ヒアリング_2 は未チェック（新規）
  備考_2 は空欄（新規）
  ↓
11ヶ月目（延長審査）
  ↓
  延長確度_2 が引き継がれる（自動）
  ヒアリング_2 が引き継がれる（自動）
  備考_2 が引き継がれる（自動）
  審査結果_2 に入力
```

**重要なポイント:**
- 10ヶ月目に戻った時、_2フィールドは空欄
- 1回目のデータ（_1）は保存されたまま
- 2回目のデータ（_2）は新たに入力できる

---

## 💻 技術実装

### バックエンド

#### 1. データベースマイグレーション

既存のデータは自動的に `_1` フィールドに移行されます：

```javascript
// 既存のカラムを _1 にリネーム
ALTER TABLE student_extensions 
  RENAME COLUMN extension_certainty TO extension_certainty_1;
  
// _2 フィールドを追加
ALTER TABLE student_extensions 
  ADD COLUMN extension_certainty_2 VARCHAR(20),
  ADD COLUMN hearing_status_2 BOOLEAN DEFAULT false,
  ADD COLUMN examination_result_2 VARCHAR(50),
  ADD COLUMN notes_2 TEXT;
```

#### 2. サイクル判定ロジック

```javascript
function determineCycle(monthsElapsed) {
  // 4ヶ月目・5ヶ月目 → 1回目
  if (monthsElapsed === 4 || monthsElapsed === 5) {
    return 1;
  }
  // 10ヶ月目・11ヶ月目 → 2回目
  else if (monthsElapsed === 10 || monthsElapsed === 11) {
    return 2;
  }
  // デフォルトは1回目
  return 1;
}
```

#### 3. API の変更

**GET /api/students/:studentId**
```javascript
// cycle パラメータを追加
GET /api/students/W12345?cycle=1  // 1回目のデータ
GET /api/students/W12345?cycle=2  // 2回目のデータ
```

**POST /api/students/:studentId**
```javascript
// リクエストボディに cycle を含める
{
  "extension_certainty": "高",
  "hearing_status": true,
  "notes": "順調です",
  "cycle": 1  // 1回目に保存
}
```

**POST /api/students/bulk**
```javascript
// 一括取得時も cycle を指定
{
  "studentIds": ["W12345", "W12346"],
  "cycle": 1  // 1回目のデータを取得
}
```

### フロントエンド

#### HearingList の自動判定

```javascript
const fetchHearingStudents = async () => {
  const response = await fetch(`/api/notion/hearing?monthOffset=${monthOffset}`)
  const data = await response.json()

  // サイクルを自動判定（4ヶ月目なら1回目、10ヶ月目なら2回目）
  const cycle = data.data[0]?.monthsElapsed === 10 ? 2 : 1;
  
  // サイクルを指定してデータ取得
  const extensionsRes = await fetch('/api/students/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentIds, cycle }),
  })
  
  // ...
}
```

#### ExaminationList の自動判定

```javascript
const fetchExaminationStudents = async () => {
  const response = await fetch(`/api/notion/examination?monthOffset=${monthOffset}`)
  const data = await response.json()

  // サイクルを自動判定（5ヶ月目なら1回目、11ヶ月目なら2回目）
  const cycle = data.data[0]?.monthsElapsed === 11 ? 2 : 1;
  
  // サイクルを指定してデータ取得
  const extensionsRes = await fetch('/api/students/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentIds, cycle }),
  })
  
  // ...
}
```

---

## 🎬 使用例

### 生徒の流れ

**山田太郎さんの例:**

```
2024年4月: レッスン開始
↓
2024年8月（4ヶ月目）: ヒアリング一覧に表示
  - 延長確度_1: 「高」と入力
  - ヒアリング_1: ✅ チェック
  - 備考_1: 「モチベーション高い」
↓
2024年9月（5ヶ月目）: 延長審査一覧に表示
  - 延長確度_1: 「高」（引き継がれた）← ✨
  - ヒアリング_1: ✅（引き継がれた）← ✨
  - 備考_1: 「モチベーション高い」（引き継がれた）← ✨
  - 審査結果_1: 「延長」と入力
↓
2025年2月（10ヶ月目）: ヒアリング一覧に再表示
  - 延長確度_2: 空欄 ← ✨ リセットされて見える！
  - ヒアリング_2: ❌ 未チェック
  - 備考_2: 空欄
  - 新たに入力: 「最近忙しい」
↓
2025年3月（11ヶ月目）: 延長審査一覧に表示
  - 延長確度_2: 「中」（引き継がれた）← ✨
  - 備考_2: 「最近忙しい」（引き継がれた）← ✨
  - 審査結果_2: 「延長」と入力
```

**保存されているデータ:**
```javascript
{
  student_id: "W12345",
  // 1回目のデータ（保存されたまま）
  extension_certainty_1: "高",
  hearing_status_1: true,
  examination_result_1: "延長",
  notes_1: "モチベーション高い",
  // 2回目のデータ（新規入力）
  extension_certainty_2: "中",
  hearing_status_2: true,
  examination_result_2: "延長",
  notes_2: "最近忙しい",
}
```

---

## ✅ 実装の利点

### 1. 見た目上のリセット
- ✅ 10ヶ月目で空欄から始まる
- ✅ ユーザーは「新しいヒアリング」として認識できる
- ✅ 過去のデータに引きずられない

### 2. データの保存
- ✅ 1回目のデータは失われない
- ✅ 2回目のデータも独立して保存
- ✅ 将来的に分析可能（1回目と2回目の比較など）

### 3. シンプルな実装
- ✅ データベーススキーマの変更のみ
- ✅ 複雑な履歴管理テーブル不要
- ✅ 既存データの自動マイグレーション

### 4. 拡張性
- ✅ 将来的に3回目（_3）も追加可能
- ✅ サイクルごとの統計を取得可能
- ✅ 延長率の推移を分析可能

---

## 🚀 デプロイ状況

### Git コミット
- **コミット:** `dff5d78`
- **GitHub:** https://github.com/kyo10310415/extended-management
- **Render:** 自動デプロイ中（3〜5分）

### データベースマイグレーション

Renderでの初回デプロイ時に自動的にマイグレーションが実行されます：

1. 既存テーブルをチェック
2. 既存の `extension_certainty` を `extension_certainty_1` にリネーム
3. 他の既存カラムも `_1` にリネーム
4. 新しい `_2` フィールドを追加
5. 既存データは保持される

**注意:** マイグレーションは冪等性があり、何度実行しても安全です。

---

## 📊 動作確認チェックリスト

### 1回目のサイクル（4-5ヶ月目）

#### 4ヶ月目（ヒアリング一覧）
- [ ] ページが正常に表示される
- [ ] 延長確度を入力できる
- [ ] ヒアリングにチェックを入れられる
- [ ] 備考を入力できる
- [ ] 保存ボタンが動作する

#### 5ヶ月目（延長審査一覧）
- [ ] 4ヶ月目で入力した延長確度が表示される
- [ ] 4ヶ月目で入力したヒアリングが表示される
- [ ] 4ヶ月目で入力した備考が表示される
- [ ] 審査結果を入力できる

### 2回目のサイクル（10-11ヶ月目）

#### 10ヶ月目（ヒアリング一覧）
- [ ] **延長確度が空欄で表示される**（リセットされている）← ✨重要
- [ ] **ヒアリングが未チェックで表示される**← ✨重要
- [ ] **備考が空欄で表示される**← ✨重要
- [ ] 新たに延長確度を入力できる
- [ ] 新たにヒアリングにチェックを入れられる
- [ ] 新たに備考を入力できる

#### 11ヶ月目（延長審査一覧）
- [ ] 10ヶ月目で入力した延長確度が表示される
- [ ] 10ヶ月目で入力したヒアリングが表示される
- [ ] 10ヶ月目で入力した備考が表示される
- [ ] 審査結果を入力できる

### データベース確認

#### Render PostgreSQL Console
```sql
-- テーブル構造の確認
\d student_extensions

-- サンプルデータの確認
SELECT 
  student_id,
  extension_certainty_1,
  hearing_status_1,
  extension_certainty_2,
  hearing_status_2
FROM student_extensions
LIMIT 5;
```

---

## 🎯 期待される結果

### シナリオ1: 新規生徒

1. 4ヶ月目で初めてヒアリング
   - `_1` フィールドに保存
2. 5ヶ月目で延長審査
   - `_1` フィールドのデータが表示される
3. 10ヶ月目で2回目のヒアリング
   - `_2` フィールドは空欄（新規）
4. 11ヶ月目で2回目の延長審査
   - `_2` フィールドのデータが表示される

### シナリオ2: 既存生徒（データ移行）

1. 既存データは自動的に `_1` に移行
2. 次に10ヶ月目になった時
   - `_2` フィールドは空欄（新規）
3. データは失われていない
   - `_1` には過去のデータが保存されている

---

## 💡 今後の拡張可能性

### 統計・分析機能

```javascript
// 1回目と2回目の延長率比較
const firstCycleExtensionRate = calculateRate(cycle1Data);
const secondCycleExtensionRate = calculateRate(cycle2Data);

// 確度の変化を追跡
const certaintyChange = {
  first: student.extension_certainty_1,  // "高"
  second: student.extension_certainty_2, // "中"
  trend: "下降"
};
```

### 3回目以降への対応

将来的に延長回数が増えても、同じパターンで拡張可能：

```sql
-- 3回目（16-17ヶ月目）用
ALTER TABLE student_extensions
  ADD COLUMN extension_certainty_3 VARCHAR(20),
  ADD COLUMN hearing_status_3 BOOLEAN DEFAULT false,
  -- ...
```

---

## 📝 まとめ

### ✅ 実装完了

1. ✅ データベーススキーマ変更（_1 / _2 フィールド）
2. ✅ 既存データの自動マイグレーション
3. ✅ API のサイクル対応
4. ✅ フロントエンドの自動サイクル判定
5. ✅ 4-5ヶ月目 → _1 使用
6. ✅ 10-11ヶ月目 → _2 使用（空欄から開始）

### 🎉 実現した機能

**あなたのアイデアが完全に実現されました！**

- 10ヶ月目で延長確度・ヒアリング・備考が空欄で表示される
- 1回目のデータは保存されたまま
- 2回目のデータは独立して管理
- ユーザーから見ると「リセットされている」ように見える

### 🚀 次のアクション

1. Renderの自動デプロイ完了を待つ（3〜5分）
2. 上記チェックリストで動作確認
3. 特に **10ヶ月目で空欄になっているか** を確認
4. 問題があれば報告

実装完了しました！素晴らしいアイデアをありがとうございました！🎉
