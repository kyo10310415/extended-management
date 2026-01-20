# 🔍 データ保存問題のデバッグ - 詳細ログ追加

## 🚨 問題の再発

**報告内容:**
> やはりヒアリング一覧と延長審査一覧に入力した内容が保存されない。

---

## 📊 デバッグログの追加

### バックエンド（`server/routes/students.js`）

```javascript
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const { extension_certainty, hearing_status, examination_result, notes, cycle } = req.body;
  
  const cycleNumber = cycle || 1;

  // デバッグログ
  console.log('📝 POST /api/students/:studentId');
  console.log('  学籍番号:', studentId);
  console.log('  サイクル:', cycleNumber);
  console.log('  データ:', { extension_certainty, hearing_status, examination_result, notes });
  console.log('  カラム名:', { certaintyCol, hearingCol, examCol, notesCol });
  
  // ... SQL実行 ...
  
  console.log('  ✅ 保存成功:', data);
});
```

### フロントエンド（`src/components/HearingList.jsx`, `ExaminationList.jsx`）

```javascript
const handleUpdate = async (studentId, updatedData) => {
  const student = students.find(s => s.studentId === studentId);
  const cycle = student?.cycle || 1;
  
  console.log('📝 handleUpdate 呼び出し');
  console.log('  学籍番号:', studentId);
  console.log('  継続月数:', student?.monthsElapsed);
  console.log('  サイクル:', cycle);
  console.log('  更新データ:', updatedData);
  
  // ... fetch ...
  
  console.log('  レスポンス:', data);
  console.log('  ✅ 更新成功 - ローカル状態を更新');
};
```

---

## 🔍 デバッグ手順

### ステップ1: ブラウザのコンソールを開く

1. アプリURL（https://extended-management.onrender.com/）を開く
2. ブラウザのデベロッパーツールを開く（F12）
3. 「Console」タブに移動

### ステップ2: データを入力して保存

1. ヒアリング一覧を開く
2. 任意の生徒の「確度」を選択
3. 「保存」ボタンをクリック
4. コンソールに以下のログが表示される:

```
📝 handleUpdate 呼び出し
  学籍番号: ABC123
  継続月数: 4
  サイクル: 1
  更新データ: { extension_certainty: '高', hearing_status: false, examination_result: '', notes: '' }
  レスポンス: { success: true, data: { ... } }
  ✅ 更新成功 - ローカル状態を更新
```

### ステップ3: サーバーログを確認

**Renderダッシュボード:**
1. https://dashboard.render.com/ を開く
2. `wannav-extension-manager` プロジェクトを選択
3. 「Logs」タブを開く
4. 以下のログが表示される:

```
📝 POST /api/students/:studentId
  学籍番号: ABC123
  サイクル: 1
  データ: { extension_certainty: '高', hearing_status: false, examination_result: '', notes: '' }
  カラム名: { certaintyCol: 'extension_certainty_1', hearingCol: 'hearing_status_1', ... }
  ✅ 保存成功: { student_id: 'ABC123', extension_certainty: '高', ... }
```

---

## 📋 チェックリスト

### フロントエンドの確認

- [ ] `handleUpdate`が呼び出されている
- [ ] `studentId`が正しい
- [ ] `cycle`が正しい（4ヶ月目→1, 10ヶ月目→2）
- [ ] `updatedData`に値が含まれている
- [ ] APIレスポンスが`success: true`
- [ ] ローカル状態が更新されている

### バックエンドの確認

- [ ] POSTリクエストが到達している
- [ ] `studentId`が正しい
- [ ] `cycle`が正しい
- [ ] カラム名が正しい（`extension_certainty_1` or `_2`）
- [ ] SQL実行が成功している
- [ ] データベースに保存されている

### データベースの確認

- [ ] テーブル`student_extensions`が存在する
- [ ] カラム`extension_certainty_1`と`extension_certainty_2`が存在する
- [ ] データが正しく保存されている

---

## 🐛 想定される問題パターン

### パターン1: サイクル判定が間違っている

**症状:**
- 10ヶ月目の生徒のデータを保存してもログが出ない

**確認:**
```javascript
// コンソールログ
  サイクル: 1  // ← 本来は2であるべき
```

**原因:**
- `monthsElapsed`が正しく計算されていない
- フィルターロジックが間違っている

---

### パターン2: API呼び出しが失敗している

**症状:**
- ブラウザコンソールにエラーが表示される
- サーバーログに何も表示されない

**確認:**
```javascript
// コンソールログ
  ❌ エラー: Failed to fetch
```

**原因:**
- SSO認証ミドルウェアがAPIをブロックしている
- ネットワークエラー

---

### パターン3: データベースエラー

**症状:**
- サーバーログにエラーが表示される
- レスポンスが`success: false`

**確認:**
```
❌ 保存エラー: column "extension_certainty_1" does not exist
```

**原因:**
- マイグレーションが実行されていない
- カラム名が間違っている

---

### パターン4: ローカル状態が更新されていない

**症状:**
- 保存は成功するが、画面上に反映されない
- ページをリロードすると表示される

**確認:**
```javascript
// コンソールログ
  ✅ 更新成功 - ローカル状態を更新
  // ← このログは出るが、画面が更新されない
```

**原因:**
- Reactの状態更新ロジックが間違っている
- `extensionData`のマージが失敗している

---

## 🔧 次のステップ

### 1. ログを確認してエラーを特定

**ブラウザコンソール:**
- エラーメッセージを確認
- どのステップで失敗しているかを特定

**Renderログ:**
- サーバー側のエラーを確認
- SQL実行が成功しているかを確認

### 2. 問題のパターンを特定

- パターン1〜4のどれに該当するか判断
- 該当するパターンの対策を実施

### 3. 追加のデバッグ情報を収集

必要に応じて以下の情報を提供してください：
- ブラウザコンソールのスクリーンショット
- Renderログのコピー
- 具体的なエラーメッセージ

---

## 🚀 デプロイ情報

- ✅ **GitHubにプッシュ済み**
- ✅ **コミット**: `4b348d5` - debug: Add extensive logging to track data save issues
- ✅ **GitHub**: https://github.com/kyo10310415/extended-management
- ✅ **アプリURL**: https://extended-management.onrender.com/
- ⏳ **Render自動デプロイ中**（約3〜5分）

---

## 📝 お願い

デプロイ完了後、以下の手順でログを確認してください：

### 1. ブラウザコンソール
```
1. F12キーでデベロッパーツールを開く
2. Consoleタブを選択
3. ヒアリング一覧でデータを入力して保存
4. コンソールに表示されるログをコピー
```

### 2. Renderログ（オプション）
```
1. https://dashboard.render.com/ を開く
2. プロジェクトのLogsタブを開く
3. ログをコピー
```

**これらのログを共有していただけると、問題を正確に特定できます。**

---

**実装日**: 2026-01-20  
**担当**: AI Developer  
**コミット**: `4b348d5`
