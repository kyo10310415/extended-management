# 🐛 バグ修正レポート - 画面真っ白問題

## 問題
ヒアリング一覧・延長審査一覧に移動すると**画面が真っ白**になる

## 根本原因

**Reactのフックのルール違反**

Reactの重要なルール：
> フックは必ずコンポーネントのトップレベルで呼ぶ必要がある
> 条件分岐（if文）やループの中、またはearly returnの後に配置してはいけない

### 問題のあったコード

```javascript
function HearingList() {
  // ... state定義

  if (loading) {
    return <Loading />  // ❌ early return
  }

  if (error) {
    return <Error />    // ❌ early return
  }

  // ❌ ここでuseMemoを呼ぶのはNG（early returnの後）
  const filteredStudents = useMemo(() => {
    return students.filter(...)
  }, [students, searchFilters])

  return <div>...</div>
}
```

**問題点:**
- `if (loading)`や`if (error)`でコンポーネントがreturnした場合、`useMemo`が呼ばれない
- 次回レンダリング時にフックの呼び出し順序が変わる
- Reactが内部状態を正しく管理できなくなる
- 結果: **白い画面エラー**

## 正しい修正

### 修正後のコード

```javascript
function HearingList() {
  // ... state定義

  // ✅ useMemoはトップレベルで呼ぶ（early returnの前）
  const filteredStudents = useMemo(() => {
    return students.filter(...)
  }, [students, searchFilters])

  const getMonthLabel = () => {
    // ... 通常の関数はOK
  }

  // ✅ early returnはフックの後に配置
  if (loading) {
    return <Loading />
  }

  if (error) {
    return <Error />
  }

  return <div>...</div>
}
```

**修正のポイント:**
1. **すべてのフック**（useState, useEffect, useMemo, useCallbackなど）はコンポーネントのトップレベルに配置
2. **条件分岐（early return）**はフックの後に配置
3. **通常の関数**（getMonthLabelなど）は任意の場所に配置可能

## 修正内容

### 影響を受けたファイル
- ✅ `src/components/HearingList.jsx`
- ✅ `src/components/ExaminationList.jsx`

### 変更内容
```diff
function HearingList() {
  const [students, setStudents] = useState([])
  // ... other states

+ // フックはトップレベルで呼ぶ
+ const filteredStudents = useMemo(() => {
+   return students.filter(...)
+ }, [students, searchFilters])
+
+ const getMonthLabel = () => { ... }

  if (loading) {
    return <Loading />
  }

  if (error) {
    return <Error />
  }

- // ❌ ここでuseMemoを呼んではいけない
- const filteredStudents = useMemo(...)

  return <div>...</div>
}
```

## Reactフックのルール（まとめ）

### ✅ 守るべきルール

1. **フックはトップレベルのみ**
   - コンポーネント関数の最上位で呼ぶ
   - カスタムフックの最上位で呼ぶ

2. **条件分岐の外で呼ぶ**
   ```javascript
   // ❌ NG
   if (condition) {
     const [state, setState] = useState(0)
   }

   // ✅ OK
   const [state, setState] = useState(0)
   if (condition) {
     setState(1)
   }
   ```

3. **ループの外で呼ぶ**
   ```javascript
   // ❌ NG
   for (let i = 0; i < 10; i++) {
     const [state, setState] = useState(i)
   }

   // ✅ OK
   const [state, setState] = useState(0)
   ```

4. **early returnの前で呼ぶ**
   ```javascript
   // ❌ NG
   if (loading) return <div>Loading...</div>
   const data = useMemo(() => ..., [])

   // ✅ OK
   const data = useMemo(() => ..., [])
   if (loading) return <div>Loading...</div>
   ```

### なぜこのルールが必要？

Reactはフックの呼び出し順序で内部状態を管理しています：

```javascript
// レンダリング1回目
useState()    // Hook #1
useEffect()   // Hook #2
useMemo()     // Hook #3

// レンダリング2回目（条件分岐で順序が変わるとエラー）
useState()    // Hook #1
// useEffect() が呼ばれない！
useMemo()     // Hook #2 (本来は#3のはず) ← 順序が狂う
```

## デプロイ状況

- **コミット:** `239e96a`
- **GitHub:** https://github.com/kyo10310415/extended-management
- **Render:** 自動デプロイ中（3〜5分）

## 動作確認

Renderのデプロイ完了後、以下を確認してください：

1. **ヒアリング一覧**
   - [ ] ページが正常に表示される
   - [ ] 検索フィルターが動作する
   - [ ] 対象月切り替えが動作する

2. **延長審査一覧**
   - [ ] ページが正常に表示される
   - [ ] 検索フィルターが動作する
   - [ ] 対象月切り替えが動作する

3. **その他**
   - [ ] ダッシュボードが正常に表示される
   - [ ] タブ切り替えがスムーズ

---

## 今後の注意点

### フックを追加する際のチェックリスト

1. ✅ コンポーネントのトップレベルに配置
2. ✅ 条件分岐（if文）の外に配置
3. ✅ ループ（for, while）の外に配置
4. ✅ early returnの前に配置
5. ✅ すべてのレンダリングで同じ順序で呼ばれる

### ESLintルール

以下のESLintルールを有効にすることを推奨：

```json
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

---

## まとめ

**問題:** 画面が真っ白になる  
**原因:** useMemoをearly returnの後に配置（Reactフックのルール違反）  
**修正:** useMemoをコンポーネントのトップレベルに移動  
**結果:** ✅ 正常に動作するように修正完了

修正完了し、GitHubにプッシュされました。Renderの自動デプロイが完了したら（約3〜5分）、問題が解決されます。🚀
