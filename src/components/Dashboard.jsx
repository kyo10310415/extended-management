import { useState, useEffect } from 'react'

function Dashboard() {
  const [stats, setStats] = useState({
    loading: true,
    refreshing: false, // 手動更新中フラグ
    // 基本データ
    totalStudents: 0,
    hearingStudents: [],
    examinationStudents: [],
    // Proプラン
    proPlanTotalCount: 0,
    proPlanEnabledCount: 0,
    proPlanRate: 0,
    // KPI設定
    extensionRateKPI: 80, // デフォルト80%
    // 計算されたKPI
    extensionCountKPI: 0,
    certaintyFilledCount: 0,
    extensionCount: 0,
    withdrawalCount: 0,
    extensionRate: 0,
    extensionRateVsResult: 0,
    remainingCount: 0,
    certaintyHigh: 0,
    certaintyMid: 0,
    certaintyLow: 0,
    // 延長審査1回目（5ヶ月目）
    exam1stTargetCount: 0,
    exam1stExtensionCount: 0,
    exam1stExtensionRate: 0,
    exam1stWithdrawalCount: 0,
    exam1stRemainingCount: 0,
    // 延長審査2回目（11ヶ月目）
    exam2ndTargetCount: 0,
    exam2ndExtensionCount: 0,
    exam2ndExtensionRate: 0,
    exam2ndWithdrawalCount: 0,
    exam2ndRemainingCount: 0,
    // 延長審査3回目（17ヶ月目）
    exam3rdTargetCount: 0,
    exam3rdExtensionCount: 0,
    exam3rdExtensionRate: 0,
    exam3rdWithdrawalCount: 0,
    exam3rdRemainingCount: 0,
    // 延長審査4回目（PROプラン継続5か月目）
    exam4thTargetCount: 0,
    exam4thExtensionCount: 0,
    exam4thExtensionRate: 0,
    exam4thWithdrawalCount: 0,
    exam4thRemainingCount: 0,
  })

  // KPIエクスポート関連の状態
  const [kpiExport, setKpiExport] = useState({
    spreadsheetId: localStorage.getItem('kpi_spreadsheet_id') || '', // localStorageから復元
    spreadsheetUrl: localStorage.getItem('kpi_spreadsheet_url') || '',
    creating: false,
    exporting: false,
  })

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      console.log('📊 Dashboard: データ取得開始');
      
      // Notion API への同時並走を防ぐため、students を先に取得してから
      // 残りのエンドポイントを並列で叩く（全5本同時ではなく、1本→4本に分割）
      const allRes = await fetch('/api/notion/students')
      const allData = await allRes.json()

      const [hearingRes, examRes, proExamRes, proPlanRes, proExam4thRes] = await Promise.all([
        fetch('/api/notion/hearing'),
        fetch('/api/notion/examination'),
        fetch('/api/notion/pro-examination'),
        fetch('/api/pro-plan/students'),
        fetch('/api/pro-plan/advanced-examination?round=4&monthOffset=0'),
      ])

      const hearingData = await hearingRes.json()
      const examData = await examRes.json()
      const proExamData = await proExamRes.json()
      const proPlanData = await proPlanRes.json()
      const proExam4thData = await proExam4thRes.json()

      console.log('  ヒアリング対象:', hearingData.data?.length);
      console.log('  延長審査対象:', examData.data?.length);
      console.log('  Pro延長審査対象:', proExamData.data?.length);
      console.log('  永久会員:', proPlanData.count);

      // ヒアリングデータを調整後月数4ヶ月と10ヶ月に分ける
      const hearing4Month = (hearingData.data || []).filter(s => s.adjustedMonths === 4);
      const hearing10Month = (hearingData.data || []).filter(s => s.adjustedMonths === 10);
      
      console.log('  - 4ヶ月目:', hearing4Month.length);
      console.log('  - 10ヶ月目:', hearing10Month.length);

      // サイクル1のヒアリングデータ取得（4ヶ月目）
      let hearing1Data = {};
      if (hearing4Month.length > 0) {
        const hearing1Ids = hearing4Month.map(s => s.studentId);
        const res1 = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: hearing1Ids, cycle: 1 }),
        });
        const data1 = await res1.json();
        hearing1Data = data1.data || {};
      }

      // サイクル2のヒアリングデータ取得（10ヶ月目）
      let hearing2Data = {};
      if (hearing10Month.length > 0) {
        const hearing2Ids = hearing10Month.map(s => s.studentId);
        const res2 = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: hearing2Ids, cycle: 2 }),
        });
        const data2 = await res2.json();
        hearing2Data = data2.data || {};
      }

      // 延長審査データを調整後月数5ヶ月と11ヶ月に分ける
      const exam5Month = (examData.data || []).filter(s => s.adjustedMonths === 5);
      const exam11Month = (examData.data || []).filter(s => s.adjustedMonths === 11);
      
      console.log('  - 5ヶ月目:', exam5Month.length);
      console.log('  - 11ヶ月目:', exam11Month.length);

      // サイクル1の延長審査データ取得（5ヶ月目）
      let exam1Data = {};
      if (exam5Month.length > 0) {
        const exam1Ids = exam5Month.map(s => s.studentId);
        const res1 = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: exam1Ids,
            cycle: 1,
          }),
        });
        const data1 = await res1.json();
        exam1Data = data1.data || {};
        console.log('  サイクル1延長審査データ取得:', Object.keys(exam1Data).length);
      }

      // サイクル2の延長審査データ取得（11ヶ月目）
      let exam2Data = {};
      if (exam11Month.length > 0) {
        const exam2Ids = exam11Month.map(s => s.studentId);
        const res2 = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: exam2Ids,
            cycle: 2,
          }),
        });
        const data2 = await res2.json();
        exam2Data = data2.data || {};
        console.log('  サイクル2延長審査データ取得:', Object.keys(exam2Data).length);
      }

      // サイクル3の延長審査データ取得（17ヶ月目）
      let exam3Data = {};
      const proExam17Month = (proExamData.data || []).filter(s => s.adjustedMonths === 17);
      console.log('  - 17ヶ月目:', proExam17Month.length);
      if (proExam17Month.length > 0) {
        const exam3Ids = proExam17Month.map(s => s.studentId);
        const res3 = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: exam3Ids,
            cycle: 3,
          }),
        });
        const data3 = await res3.json();
        exam3Data = data3.data || {};
        console.log('  サイクル3延長審査データ取得:', Object.keys(exam3Data).length);
      }

      // 4回目延長審査データ（PROプラン継続5か月目）
      // /api/pro-plan/advanced-examination はすでに extensionData を含む
      const proExam4thStudents = (proExam4thData.data || []);
      console.log('  - PRO継続5か月目（4回目審査）:', proExam4thStudents.length);

      // データマージ（各生徒に正しいサイクルのデータを紐付け）
      const hearingStudents = (hearingData.data || []).map(s => {
        const cycle = s.adjustedMonths === 10 ? 2 : 1;
        const extensionData = cycle === 1 ? hearing1Data[s.studentId] : hearing2Data[s.studentId];
        return {
          ...s,
          extensionData: extensionData || null,
        };
      });

      const examinationStudents = (examData.data || []).map(s => {
        const cycle = s.adjustedMonths === 11 ? 2 : 1;
        const extensionData = cycle === 1 ? exam1Data[s.studentId] : exam2Data[s.studentId];
        return {
          ...s,
          extensionData: extensionData || null,
        };
      }).filter(s => 
        // 延長確度が「対象外」の生徒を除外 & KPIはアクティブのみ
        s.extensionData?.extension_certainty !== '対象外' &&
        s.status === 'アクティブ'
      );

      // 3回目（17ヶ月目）の審査生徒マージ
      const proExaminationStudents = proExam17Month.map(s => {
        const extensionData = exam3Data[s.studentId];
        return {
          ...s,
          extensionData: extensionData || null,
        };
      }).filter(s =>
        s.extensionData?.extension_certainty !== '対象外'
      );

      // 4回目（PRO継続5か月目）の審査生徒
      // advanced-examination API はすでに extensionData を含む
      // extensionData は { extension_certainty_4, examination_result_4, ... } 形式なので
      // 3回目と同じフィールド名に正規化する
      const proExamination4thStudents = proExam4thStudents.map(s => ({
        ...s,
        extensionData: s.extensionData
          ? {
              extension_certainty: s.extensionData.extension_certainty_4,
              examination_result:  s.extensionData.examination_result_4,
              hearing_status:      s.extensionData.hearing_status_4,
              notes:               s.extensionData.notes_4,
            }
          : null,
      })).filter(s => s.extensionData?.extension_certainty !== '対象外');

      // KPI計算（1回目＋2回目＋3回目＋4回目の合計）
      // --- 3回目の中間値（統計用）---
      const _exam3rdExtCount = proExaminationStudents.filter(s =>
        s.extensionData?.examination_result === '延長'
      ).length
      const _exam3rdLifetimeCount = proExaminationStudents.filter(s =>
        s.extensionData?.examination_result === '永久会員'
      ).length
      const _exam3rdRemainingCount = proExaminationStudents.filter(s =>
        !s.extensionData?.examination_result ||
        s.extensionData.examination_result.trim() === ''
      ).length

      // --- 4回目の中間値（統計用）---
      const _exam4thExtCount = proExamination4thStudents.filter(s =>
        s.extensionData?.examination_result === '延長'
      ).length
      const _exam4thLifetimeCount = proExamination4thStudents.filter(s =>
        s.extensionData?.examination_result === '永久会員'
      ).length
      const _exam4thRemainingCount = proExamination4thStudents.filter(s =>
        !s.extensionData?.examination_result ||
        s.extensionData.examination_result.trim() === ''
      ).length

      // 全体の延長審査対象数（1回目＋2回目＋3回目＋4回目）
      const examinationCount = examinationStudents.length + proExaminationStudents.length + proExamination4thStudents.length

      console.log('📊 KPI計算開始');
      console.log('  延長審査対象（全体）:', examinationCount,
        `(1・2回目: ${examinationStudents.length}, 3回目: ${proExaminationStudents.length}, 4回目: ${proExamination4thStudents.length})`);

      // 延長確度記入済み = 確度が入力されている - 「対象外」
      const certaintyFilledCount = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty && 
        s.extensionData.extension_certainty !== '対象外'
      ).length

      // 延長数 = 1・2回目「延長」 + 3回目「延長」 + 4回目「延長」
      const extensionCount = examinationStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length + _exam3rdExtCount + _exam4thExtCount

      console.log('  延長数（全体）:', extensionCount);

      // 退会数 = 1・2回目「退会」 + 3回目「永久会員」 + 4回目「永久会員」
      const withdrawalCount = examinationStudents.filter(s => 
        s.extensionData?.examination_result === '退会'
      ).length + _exam3rdLifetimeCount + _exam4thLifetimeCount

      console.log('  退会 / 永久会員数（全体）:', withdrawalCount);

      // 延長率 = 延長数 / 延長審査対象 × 100
      const extensionRate = examinationCount > 0 
        ? (extensionCount / examinationCount * 100) 
        : 0

      // 延長率（対 審査結果お伝え） = 延長数 / (延長数 + 退会数) × 100
      const totalDecided = extensionCount + withdrawalCount
      const extensionRateVsResult = totalDecided > 0 
        ? (extensionCount / totalDecided * 100) 
        : 0

      // 残弾数 = 1・2回目（対象-延長-退会） + 3回目（空欄件数） + 4回目（空欄件数）
      const remaining12Count = examinationStudents.length -
        examinationStudents.filter(s => s.extensionData?.examination_result === '延長').length -
        examinationStudents.filter(s => s.extensionData?.examination_result === '退会').length
      const remainingCount = remaining12Count + _exam3rdRemainingCount + _exam4thRemainingCount

      // 延長確度別カウント
      const certaintyHigh = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '高'
      ).length

      const certaintyMid = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '中'
      ).length

      const certaintyLow = hearingStudents.filter(s => 
        s.extensionData?.extension_certainty === '低'
      ).length

      // 延長審査1回目（調整後月数5ヶ月目）
      const exam1stStudents = examinationStudents.filter(s => s.adjustedMonths === 5)
      const exam1stTargetCount = exam1stStudents.length
      const exam1stExtensionCount = exam1stStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length
      const exam1stWithdrawalCount = exam1stStudents.filter(s => 
        s.extensionData?.examination_result === '退会'
      ).length
      const exam1stRemainingCount = exam1stTargetCount - exam1stExtensionCount - exam1stWithdrawalCount
      const exam1stExtensionRate = exam1stTargetCount > 0 
        ? (exam1stExtensionCount / exam1stTargetCount * 100) 
        : 0
      
      console.log('  1回目（調整後5ヶ月目）:');
      console.log('    対象数:', exam1stTargetCount);
      console.log('    延長数:', exam1stExtensionCount);
      console.log('    退会数:', exam1stWithdrawalCount);
      console.log('    残弾数:', exam1stRemainingCount);
      console.log('    延長率:', exam1stExtensionRate.toFixed(2) + '%');

      // 延長審査2回目（調整後月数11ヶ月目）
      const exam2ndStudents = examinationStudents.filter(s => s.adjustedMonths === 11)
      const exam2ndTargetCount = exam2ndStudents.length
      const exam2ndExtensionCount = exam2ndStudents.filter(s => 
        s.extensionData?.examination_result === '延長'
      ).length
      const exam2ndWithdrawalCount = exam2ndStudents.filter(s => 
        s.extensionData?.examination_result === '退会'
      ).length
      const exam2ndRemainingCount = exam2ndTargetCount - exam2ndExtensionCount - exam2ndWithdrawalCount
      const exam2ndExtensionRate = exam2ndTargetCount > 0 
        ? (exam2ndExtensionCount / exam2ndTargetCount * 100) 
        : 0
      
      console.log('  2回目（調整後11ヶ月目）:');
      console.log('    対象数:', exam2ndTargetCount);
      console.log('    延長数:', exam2ndExtensionCount);
      console.log('    退会数:', exam2ndWithdrawalCount);
      console.log('    残弾数:', exam2ndRemainingCount);
      console.log('    延長率:', exam2ndExtensionRate.toFixed(2) + '%');

      // 延長審査3回目（調整後月数17ヶ月目）
      // ※3回目は計算方法が異なる
      //   退会数 = 審査結果が「永久会員」
      //   残弾数 = 審査結果が空欄（未入力）
      const exam3rdStudents = proExaminationStudents
      const exam3rdTargetCount = exam3rdStudents.length
      const exam3rdExtensionCount = exam3rdStudents.filter(s =>
        s.extensionData?.examination_result === '延長'
      ).length
      const exam3rdWithdrawalCount = exam3rdStudents.filter(s =>
        s.extensionData?.examination_result === '永久会員'
      ).length
      const exam3rdRemainingCount = exam3rdStudents.filter(s =>
        !s.extensionData?.examination_result ||
        s.extensionData.examination_result.trim() === ''
      ).length
      const exam3rdExtensionRate = exam3rdTargetCount > 0
        ? (exam3rdExtensionCount / exam3rdTargetCount * 100)
        : 0

      console.log('  3回目（調整後17ヶ月目）:');
      console.log('    対象数:', exam3rdTargetCount);
      console.log('    延長数:', exam3rdExtensionCount);
      console.log('    永久会員数:', exam3rdWithdrawalCount);
      console.log('    残弾数（空欄）:', exam3rdRemainingCount);
      console.log('    延長率:', exam3rdExtensionRate.toFixed(2) + '%');

      // 延長審査4回目（PROプラン継続5か月目）
      const exam4thStudents = proExamination4thStudents
      const exam4thTargetCount = exam4thStudents.length
      const exam4thExtensionCount = _exam4thExtCount
      const exam4thWithdrawalCount = _exam4thLifetimeCount
      const exam4thRemainingCount = _exam4thRemainingCount
      const exam4thExtensionRate = exam4thTargetCount > 0
        ? (exam4thExtensionCount / exam4thTargetCount * 100)
        : 0

      console.log('  4回目（PRO継続5か月目）:');
      console.log('    対象数:', exam4thTargetCount);
      console.log('    延長数:', exam4thExtensionCount);
      console.log('    永久会員数:', exam4thWithdrawalCount);
      console.log('    残弾数（空欄）:', exam4thRemainingCount);
      console.log('    延長率:', exam4thExtensionRate.toFixed(2) + '%');

      // Proプラン成約率の計算
      const proPlanTotalCount = proPlanData.count || 0
      const proPlanEnabledCount = (proPlanData.data || []).filter(s => s.proPlanStatus === '確定').length
      const proPlanRate = proPlanTotalCount > 0 
        ? (proPlanEnabledCount / proPlanTotalCount * 100) 
        : 0
      
      console.log('  Proプラン:');
      console.log('    永久会員数:', proPlanTotalCount);
      console.log('    Proプラン確定数:', proPlanEnabledCount);
      console.log('    成約率:', proPlanRate.toFixed(2) + '%');
      
      console.log('✅ KPI計算完了');

      setStats(prev => ({
        ...prev,
        loading: false,
        totalStudents: allData.count || 0,
        hearingStudents,
        examinationStudents,
        proPlanTotalCount,
        proPlanEnabledCount,
        proPlanRate,
        extensionCountKPI: Math.ceil(examinationCount * prev.extensionRateKPI / 100),
        certaintyFilledCount,
        extensionCount,
        withdrawalCount,
        extensionRate,
        extensionRateVsResult,
        remainingCount,
        certaintyHigh,
        certaintyMid,
        certaintyLow,
        exam1stTargetCount,
        exam1stExtensionCount,
        exam1stExtensionRate,
        exam1stWithdrawalCount,
        exam1stRemainingCount,
        exam2ndTargetCount,
        exam2ndExtensionCount,
        exam2ndExtensionRate,
        exam2ndWithdrawalCount,
        exam2ndRemainingCount,
        exam3rdTargetCount,
        exam3rdExtensionCount,
        exam3rdExtensionRate,
        exam3rdWithdrawalCount,
        exam3rdRemainingCount,
        exam4thTargetCount,
        exam4thExtensionCount,
        exam4thExtensionRate,
        exam4thWithdrawalCount,
        exam4thRemainingCount,
      }))
    } catch (error) {
      console.error('Error fetching stats:', error)
      setStats(prev => ({ ...prev, loading: false }))
    }
  }

  const handleKPIChange = (value) => {
    const kpi = Number(value)
    // 全体対象数 = 1・2回目 + 3回目 + 4回目
    const examinationCount = stats.examinationStudents.length + stats.exam3rdTargetCount + stats.exam4thTargetCount
    const extensionCountKPI = Math.ceil(examinationCount * kpi / 100)
    
    setStats(prev => ({
      ...prev,
      extensionRateKPI: kpi,
      extensionCountKPI,
    }))
  }

  const handleRefresh = async () => {
    console.log('🔄 手動更新: キャッシュクリア中...');
    
    // 読み込み状態を開始
    setStats(prev => ({ ...prev, refreshing: true }));
    
    try {
      // キャッシュをクリア
      await fetch('/api/notion/cache/clear', { method: 'POST' });
      console.log('  ✅ キャッシュクリア完了');
      
      // データを再取得
      console.log('  📊 データ再取得中...');
      await fetchStats();
      console.log('  ✅ データ再取得完了');
      
      // 成功メッセージ
      alert('✅ データを最新に更新しました！');
    } catch (error) {
      console.error('  ❌ 更新エラー:', error);
      alert('❌ 更新に失敗しました: ' + error.message);
    } finally {
      // 読み込み状態を終了
      setStats(prev => ({ ...prev, refreshing: false }));
    }
  }

  // KPIスプレッドシートを設定
  const handleSetupKPISheet = async () => {
    if (kpiExport.creating) return;

    // スプレッドシートIDを入力させる
    const inputId = window.prompt(
      '既存のスプレッドシートIDを入力してください：\n\n' +
      '※ Google Sheets で新しいスプレッドシートを作成し、URLから ID をコピーしてください\n' +
      '例: https://docs.google.com/spreadsheets/d/【この部分がID】/edit\n\n' +
      '※ スプレッドシートはサービスアカウント（' + 
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your-service-account@project.iam.gserviceaccount.com') + 
      '）に「編集者」権限で共有してください',
      kpiExport.spreadsheetId || ''
    );

    if (!inputId || inputId.trim() === '') {
      return; // キャンセルまたは空入力
    }

    const spreadsheetId = inputId.trim();
    setKpiExport(prev => ({ ...prev, creating: true }));

    try {
      console.log('📊 KPIスプレッドシートを設定中...');
      const response = await fetch('/api/kpi-export/setup-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId }),
      });

      const data = await response.json();

      if (data.success) {
        // localStorageに保存
        localStorage.setItem('kpi_spreadsheet_id', data.spreadsheetId);
        localStorage.setItem('kpi_spreadsheet_url', data.url);

        setKpiExport(prev => ({
          ...prev,
          spreadsheetId: data.spreadsheetId,
          spreadsheetUrl: data.url,
        }));

        alert(`✅ KPIスプレッドシートの設定が完了しました！\n\n${data.message}\nURL: ${data.url}`);
        console.log('✅ スプレッドシート設定完了:', data);
      } else {
        throw new Error(data.error || 'スプレッドシート設定に失敗しました');
      }
    } catch (error) {
      console.error('❌ スプレッドシート設定エラー:', error);
      alert(`❌ スプレッドシート設定に失敗しました\n\nエラー: ${error.message}\n\n確認事項：\n1. スプレッドシートIDが正しいか\n2. サービスアカウントに編集権限があるか`);
    } finally {
      setKpiExport(prev => ({ ...prev, creating: false }));
    }
  };

  // 月次KPIデータをスプレッドシートに追加
  const handleExportMonthlyKPI = async (monthOffset = 0) => {
    if (!kpiExport.spreadsheetId) {
      alert('⚠️ 先にスプレッドシートを作成してください。');
      return;
    }

    if (kpiExport.exporting) return;

    // 対象月のラベルを生成
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    const targetYear = targetDate.getFullYear();
    const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
    const targetLabel = `${targetYear}年${targetMonth}月`;

    const confirmed = window.confirm(
      `${targetLabel}のKPIデータをスプレッドシートに追加しますか？\n\n※追加後は取り消しできません。`
    );
    if (!confirmed) return;

    setKpiExport(prev => ({ ...prev, exporting: true }));

    try {
      console.log(`📊 ${targetLabel}の月次KPIデータをエクスポート中...`);
      const response = await fetch('/api/kpi-export/append-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: kpiExport.spreadsheetId,
          monthOffset,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.month}のKPIデータを追加しました！\n\n列: ${data.column}\nURL: ${data.url}`);
        console.log('✅ 月次データ追加完了:', data);
      } else {
        throw new Error(data.error || 'データ追加に失敗しました');
      }
    } catch (error) {
      console.error('❌ データ追加エラー:', error);
      alert(`❌ データ追加に失敗しました\n\nエラー: ${error.message}`);
    } finally {
      setKpiExport(prev => ({ ...prev, exporting: false }));
    }
  };

  if (stats.loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // 全体の延長審査対象数（1・2回目 + 3回目）
  const examinationTargetCount = stats.examinationStudents.length + stats.exam3rdTargetCount

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">ダッシュボード</h2>
        <button
          onClick={handleRefresh}
          disabled={stats.refreshing}
          className={`px-4 py-2 text-white rounded-lg transition text-sm flex items-center gap-2 ${
            stats.refreshing 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {stats.refreshing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              読み込み中...
            </>
          ) : (
            <>
              🔄 最新データに更新
            </>
          )}
        </button>
      </div>
      
      {/* KPI設定 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 mb-6 text-white">
        <h3 className="text-lg font-semibold mb-4">🎯 延長率KPI設定</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">目標延長率:</label>
          <input
            type="number"
            min="0"
            max="100"
            value={stats.extensionRateKPI}
            onChange={(e) => handleKPIChange(e.target.value)}
            className="w-24 px-3 py-2 text-gray-900 rounded-lg font-semibold text-center focus:ring-2 focus:ring-white"
          />
          <span className="text-lg font-bold">%</span>
          <div className="ml-auto flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
            <span className="text-sm">延長数KPI:</span>
            <span className="text-2xl font-bold">{stats.extensionCountKPI}</span>
            <span className="text-sm">件</span>
          </div>
        </div>
      </div>

      {/* メインKPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長審査対象</p>
          <p className="text-3xl font-bold text-gray-900">{examinationTargetCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            1・2回目 {stats.examinationStudents.length} + 3回目 {stats.exam3rdTargetCount} + 4回目 {stats.exam4thTargetCount}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度記入済み</p>
          <p className="text-3xl font-bold text-blue-600">{stats.certaintyFilledCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.hearingStudents.length > 0 ? 
              `${((stats.certaintyFilledCount / stats.hearingStudents.length) * 100).toFixed(1)}%` : 
              '0%'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長数</p>
          <p className="text-3xl font-bold text-green-600">{stats.extensionCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            目標まで残り {Math.max(0, stats.extensionCountKPI - stats.extensionCount)} 件
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">退会 / 永久会員数</p>
          <p className="text-3xl font-bold text-red-600">{stats.withdrawalCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            1・2回目退会 + 3・4回目永久会員
          </p>
        </div>
      </div>

      {/* 延長率 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長率（対 審査対象）</p>
          <p className="text-3xl font-bold text-purple-600">{stats.extensionRate.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.extensionCount} / {examinationTargetCount} × 100
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長率（対 結果お伝え）</p>
          <p className="text-3xl font-bold text-indigo-600">{stats.extensionRateVsResult.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.extensionCount} / ({stats.extensionCount} + {stats.withdrawalCount}) × 100
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">👑 Proプラン成約率</p>
          <p className="text-3xl font-bold text-yellow-600">{stats.proPlanRate.toFixed(2)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.proPlanEnabledCount} / {stats.proPlanTotalCount} × 100
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">残弾数</p>
          <p className="text-3xl font-bold text-orange-600">{stats.remainingCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            1・2回目未決定 + 3・4回目空欄
          </p>
        </div>
      </div>

      {/* 延長確度 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「高」</p>
          <p className="text-3xl font-bold text-green-600">{stats.certaintyHigh}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「中」</p>
          <p className="text-3xl font-bold text-yellow-600">{stats.certaintyMid}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 mb-1">延長確度「低」</p>
          <p className="text-3xl font-bold text-red-600">{stats.certaintyLow}</p>
        </div>
      </div>

      {/* 延長審査1回目・2回目・3回目・4回目 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査1回目（5ヶ月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam1stTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam1stExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">退会数:</span>
              <span className="text-2xl font-bold text-red-600">{stats.exam1stWithdrawalCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">残弾数:</span>
              <span className="text-2xl font-bold text-blue-600">{stats.exam1stRemainingCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam1stExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査2回目（11ヶ月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam2ndTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam2ndExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">退会数:</span>
              <span className="text-2xl font-bold text-red-600">{stats.exam2ndWithdrawalCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">残弾数:</span>
              <span className="text-2xl font-bold text-blue-600">{stats.exam2ndRemainingCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam2ndExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査3回目（17ヶ月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam3rdTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam3rdExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">永久会員数:</span>
              <span className="text-2xl font-bold text-red-600">{stats.exam3rdWithdrawalCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">残弾数（空欄）:</span>
              <span className="text-2xl font-bold text-blue-600">{stats.exam3rdRemainingCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam3rdExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-400">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 延長審査4回目（PRO継続5か月目）</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">対象数:</span>
              <span className="text-2xl font-bold text-gray-900">{stats.exam4thTargetCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">延長数:</span>
              <span className="text-2xl font-bold text-green-600">{stats.exam4thExtensionCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">永久会員数:</span>
              <span className="text-2xl font-bold text-red-600">{stats.exam4thWithdrawalCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">残弾数（空欄）:</span>
              <span className="text-2xl font-bold text-blue-600">{stats.exam4thRemainingCount}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-sm font-semibold text-gray-700">延長率:</span>
              <span className="text-3xl font-bold text-purple-600">{stats.exam4thExtensionRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIエクスポート機能 */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-6 mb-6 text-white">
        <h3 className="text-lg font-semibold mb-4">📤 月次KPIデータエクスポート</h3>
        
        <div className="space-y-4">
          {/* スプレッドシート情報 */}
          {kpiExport.spreadsheetId ? (
            <div className="bg-white/20 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">✅ スプレッドシート設定済み</p>
              <p className="text-xs mb-2">ID: {kpiExport.spreadsheetId}</p>
              {kpiExport.spreadsheetUrl && (
                <a
                  href={kpiExport.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline hover:text-white/80"
                >
                  📊 スプレッドシートを開く
                </a>
              )}
            </div>
          ) : (
            <div className="bg-white/20 rounded-lg p-4">
              <p className="text-sm">⚠️ スプレッドシートが未設定です</p>
              <p className="text-xs mt-1">先に Google Sheets でスプレッドシートを作成し、「スプレッドシート設定」ボタンで登録してください</p>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-3">
            <button
              onClick={handleSetupKPISheet}
              disabled={kpiExport.creating}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                kpiExport.creating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-white text-green-600 hover:bg-gray-100'
              }`}
            >
              {kpiExport.creating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                  設定中...
                </>
              ) : (
                <>
                  📝 スプレッドシート設定
                </>
              )}
            </button>

            <button
              onClick={handleExportMonthlyKPI}
              disabled={!kpiExport.spreadsheetId || kpiExport.exporting}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                !kpiExport.spreadsheetId || kpiExport.exporting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-yellow-500 text-white hover:bg-yellow-600'
              }`}
            >
              {kpiExport.exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  エクスポート中...
                </>
              ) : (
                <>
                  📤 今月のKPIを追加
                </>
              )}
            </button>

            <button
              onClick={() => handleExportMonthlyKPI(-1)}
              disabled={!kpiExport.spreadsheetId || kpiExport.exporting}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                !kpiExport.spreadsheetId || kpiExport.exporting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {kpiExport.exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  エクスポート中...
                </>
              ) : (
                <>
                  📤 先月のKPIを追加
                </>
              )}
            </button>
          </div>

          {/* 説明 */}
          <div className="text-xs space-y-1 bg-white/10 rounded p-3">
            <p><strong>📝 スプレッドシート設定:</strong> 既存のスプレッドシートを登録し、KPI項目を初期化します</p>
            <p className="mt-2"><strong>手順:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Google Sheets で新しい空のスプレッドシートを作成</li>
              <li>スプレッドシートのURLから「ID」をコピー（例: /d/【この部分】/edit）</li>
              <li>サービスアカウント（環境変数 GOOGLE_SERVICE_ACCOUNT_EMAIL）に「編集者」権限で共有</li>
              <li>「スプレッドシート設定」ボタンをクリックして ID を入力</li>
            </ol>
            <p className="mt-2"><strong>📤 今月のKPIを追加:</strong> 現在のKPIデータを月次データとしてスプレッドシートに追加します（月末に実行）</p>
            <p className="mt-2 text-yellow-200"><strong>⚠️ 注意:</strong> 「今月のKPIを追加」は月末に1回だけ実行してください。複数回実行すると重複データが追加されます。</p>
          </div>
        </div>
      </div>

      {/* システム概要 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">システム概要</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            <span className="font-semibold">📊 データソース:</span> Notion API + Google Spreadsheet
          </p>
          <p>
            <span className="font-semibold">🎤 ヒアリング一覧:</span> レッスン開始月から4ヶ月目・10ヶ月目の生徒
          </p>
          <p>
            <span className="font-semibold">📋 延長審査一覧:</span> レッスン開始月から5ヶ月目・11ヶ月目の生徒
          </p>
          <p>
            <span className="font-semibold">✍️ 手動入力項目:</span> 延長確度、ヒアリング、審査結果、備考
          </p>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
