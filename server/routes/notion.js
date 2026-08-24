import express from 'express';
import { fetchStudents } from '../services/notionService.js';
import {
  fetchFormUpdates,
  fetchSuspensionData,
  fetchLessonDatesForMonth,
  getLessonDatesForStudent,
} from '../services/sheetsService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth, calculateEffectiveSuspensionMonths } from '../utils/dateUtils.js';
import cacheService from '../services/cacheService.js';
import databaseCacheService from '../services/databaseCacheService.js';
import { manualUpdate } from '../services/backgroundService.js';
import { fetchProStartDates, calculateProPlanMonths } from '../services/proPlanExternalService.js';

const router = express.Router();

/**
 * GET /api/notion/students
 * Notionから全生徒情報を取得（休会情報も含む）
 */
router.get('/students', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    const suspensionData = await fetchSuspensionData();
    
    // キャッシュの年齢を取得
    const lastUpdate = await databaseCacheService.getCacheLastUpdate();
    let cacheInfo = null;
    if (lastUpdate) {
      const cacheAge = Date.now() - new Date(lastUpdate).getTime();
      const ageMinutes = Math.floor(cacheAge / 1000 / 60);
      const ageHours = Math.floor(ageMinutes / 60);
      cacheInfo = {
        lastUpdate: lastUpdate,
        ageMinutes: ageMinutes,
        ageHours: ageHours,
        displayAge: ageHours > 0 
          ? `${ageHours}時間${ageMinutes % 60}分前` 
          : `${ageMinutes}分前`,
      };
    }
    
    // 外部DB（wannav-student-management）から pro_plan_start_date を一括取得
    const allStudentIds = students.map(s => s.studentId);
    const proStartMap = await fetchProStartDates(allStudentIds);

    // 経過月数を追加し、フォーム更新日と休会情報を紐付け
    const enrichedStudents = enrichStudentsWithMonths(students).map(student => {
      const suspension = suspensionData[student.studentId];
      const adjustedMonths = suspension 
        ? Math.max(0, student.monthsElapsed - calculateEffectiveSuspensionMonths(suspension, 0))
        : student.monthsElapsed;
      
      const { proStartDate } = proStartMap[student.studentId] || {};
      const proPlanMonths = calculateProPlanMonths(proStartDate, 0);

      return {
        ...student,
        formLastUpdate: formUpdates[student.studentId] || null,
        suspensionMonths: calculateEffectiveSuspensionMonths(suspension, 0),
        suspensionStartDate: suspension?.suspensionStartDate || null,
        hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
        adjustedMonths,
        proStartDate: proStartDate
          ? (() => { const d = new Date(proStartDate); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })()
          : null,
        proPlanMonths: proPlanMonths,
      };
    });

    res.json({
      success: true,
      data: enrichedStudents,
      count: enrichedStudents.length,
      cacheInfo: cacheInfo,
    });
  } catch (error) {
    console.error('Error in /api/notion/students:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/hearing
 * 4ヶ月目と10ヶ月目の生徒（ヒアリング一覧）を取得
 * ステータスが「アクティブ」の生徒のみ
 * 休会情報も含む
 * @query {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 */
router.get('/hearing', async (req, res) => {
  try {
    const monthOffset = parseInt(req.query.monthOffset) || 0;
    const [students, formUpdates, suspensionData, lessonSchedule] = await Promise.all([
      fetchStudents(),
      fetchFormUpdates(),
      fetchSuspensionData(),
      fetchLessonDatesForMonth(monthOffset),
    ]);
    
    // 今月・翌月はアクティブのみ。過去月は正規退会・強制退会も含める
    const allActiveStudents = enrichStudentsWithMonths(students, monthOffset)
      .filter(s =>
        s.status === 'アクティブ' ||
        (monthOffset < 0 && (s.status === '正規退会' || s.status === '強制退会'))
      )
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const suspensionMonths = calculateEffectiveSuspensionMonths(suspension, monthOffset);
        const adjustedMonths = Math.max(0, student.monthsElapsed - suspensionMonths);
        
        return {
          ...student,
          adjustedMonths,
          suspensionMonths,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          suspensionStartDate: suspension?.suspensionStartDate || null,
          suspensionRecords: suspension?.records || [],
          formLastUpdate: formUpdates[student.studentId] || null,
          lessonDates: getLessonDatesForStudent(lessonSchedule.lessonDatesByStudent, student.studentId),
        };
      });
    
    // 調整後月数が4ヶ月または10ヶ月の生徒を抽出
    const month4Students = allActiveStudents.filter(s => s.adjustedMonths === 4);
    const month10Students = allActiveStudents.filter(s => s.adjustedMonths === 10);

    const hearingStudents = [...month4Students, ...month10Students];

    res.json({
      success: true,
      data: hearingStudents,
      count: hearingStudents.length,
      monthOffset,
      breakdown: {
        month4: month4Students.length,
        month10: month10Students.length,
      },
    });
  } catch (error) {
    console.error('Error in /api/notion/hearing:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/examination
 * 5ヶ月目と11ヶ月目の生徒（延長審査一覧）を取得
 * ステータスが「アクティブ」の生徒のみ
 * 休会情報も含む
 * @query {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 */
router.get('/examination', async (req, res) => {
  try {
    const monthOffset = parseInt(req.query.monthOffset) || 0;
    const [students, formUpdates, suspensionData, lessonSchedule] = await Promise.all([
      fetchStudents(),
      fetchFormUpdates(),
      fetchSuspensionData(),
      fetchLessonDatesForMonth(monthOffset),
    ]);
    
    // アクティブ + 正規退会 + 無断キャンセルは常に表示
    // 過去月はさらに強制退会も含める
    const allActiveStudents = enrichStudentsWithMonths(students, monthOffset)
      .filter(s =>
        s.status === 'アクティブ' ||
        s.status === '正規退会' ||
        s.status === '無断キャンセル' ||
        (monthOffset < 0 && s.status === '強制退会')
      )
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const suspensionMonths = calculateEffectiveSuspensionMonths(suspension, monthOffset);
        const adjustedMonths = Math.max(0, student.monthsElapsed - suspensionMonths);
        
        return {
          ...student,
          adjustedMonths,
          suspensionMonths,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          suspensionStartDate: suspension?.suspensionStartDate || null,
          suspensionRecords: suspension?.records || [],
          formLastUpdate: formUpdates[student.studentId] || null,
          lessonDates: getLessonDatesForStudent(lessonSchedule.lessonDatesByStudent, student.studentId),
        };
      });
    
    // 調整後月数が5ヶ月または11ヶ月の生徒を抽出
    const month5Students = allActiveStudents.filter(s => s.adjustedMonths === 5);
    const month11Students = allActiveStudents.filter(s => s.adjustedMonths === 11);

    const examinationStudents = [...month5Students, ...month11Students];

    res.json({
      success: true,
      data: examinationStudents,
      count: examinationStudents.length,
      monthOffset,
      breakdown: {
        month5: month5Students.length,
        month11: month11Students.length,
      },
    });
  } catch (error) {
    console.error('Error in /api/notion/examination:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/pro-hearing
 * 16ヶ月目の生徒（Proプランヒアリング一覧）を取得
 * ステータスが「アクティブ」の生徒のみ
 * 休会情報も含む
 * @query {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 */
router.get('/pro-hearing', async (req, res) => {
  try {
    const monthOffset = parseInt(req.query.monthOffset) || 0;
    const [students, formUpdates, suspensionData, lessonSchedule] = await Promise.all([
      fetchStudents(),
      fetchFormUpdates(),
      fetchSuspensionData(),
      fetchLessonDatesForMonth(monthOffset),
    ]);
    
    // 今月・翌月はアクティブのみ。過去月は正規退会・強制退会も含める
    const allActiveStudents = enrichStudentsWithMonths(students, monthOffset)
      .filter(s =>
        s.status === 'アクティブ' ||
        (monthOffset < 0 && (s.status === '正規退会' || s.status === '強制退会'))
      )
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const suspensionMonths = calculateEffectiveSuspensionMonths(suspension, monthOffset);
        const adjustedMonths = Math.max(0, student.monthsElapsed - suspensionMonths);
        
        return {
          ...student,
          adjustedMonths,
          suspensionMonths,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          suspensionStartDate: suspension?.suspensionStartDate || null,
          suspensionRecords: suspension?.records || [],
          formLastUpdate: formUpdates[student.studentId] || null,
          lessonDates: getLessonDatesForStudent(lessonSchedule.lessonDatesByStudent, student.studentId),
        };
      });
    
    // 調整後月数が16ヶ月の生徒を抽出
    const month16Students = allActiveStudents.filter(s => s.adjustedMonths === 16);

    const proHearingStudents = month16Students;

    res.json({
      success: true,
      data: proHearingStudents,
      count: proHearingStudents.length,
      monthOffset,
    });
  } catch (error) {
    console.error('Error in /api/notion/pro-hearing:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/pro-examination
 * 17ヶ月目の生徒（Pro延長審査一覧）を取得
 * ステータスが「アクティブ」の生徒のみ
 * 休会情報も含む
 * @query {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 */
router.get('/pro-examination', async (req, res) => {
  try {
    const monthOffset = parseInt(req.query.monthOffset) || 0;
    const [students, formUpdates, suspensionData, lessonSchedule] = await Promise.all([
      fetchStudents(),
      fetchFormUpdates(),
      fetchSuspensionData(),
      fetchLessonDatesForMonth(monthOffset),
    ]);
    
    // 今月・翌月はアクティブのみ。過去月は正規退会・強制退会も含める
    const allActiveStudents = enrichStudentsWithMonths(students, monthOffset)
      .filter(s =>
        s.status === 'アクティブ' ||
        (monthOffset < 0 && (s.status === '正規退会' || s.status === '強制退会'))
      )
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const suspensionMonths = calculateEffectiveSuspensionMonths(suspension, monthOffset);
        const adjustedMonths = Math.max(0, student.monthsElapsed - suspensionMonths);
        
        return {
          ...student,
          adjustedMonths,
          suspensionMonths,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          suspensionStartDate: suspension?.suspensionStartDate || null,
          suspensionRecords: suspension?.records || [],
          formLastUpdate: formUpdates[student.studentId] || null,
          lessonDates: getLessonDatesForStudent(lessonSchedule.lessonDatesByStudent, student.studentId),
        };
      });
    
    // 調整後月数が17ヶ月の生徒を抽出
    const month17Students = allActiveStudents.filter(s => s.adjustedMonths === 17);

    const proExaminationStudents = month17Students;

    res.json({
      success: true,
      data: proExaminationStudents,
      count: proExaminationStudents.length,
      monthOffset,
    });
  } catch (error) {
    console.error('Error in /api/notion/pro-examination:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/export-spreadsheet
 * スプレッドシート用にデータを出力（CSV形式）
 */
router.get('/export-spreadsheet', async (req, res) => {
  try {
    const students = await fetchStudents();
    const enrichedStudents = enrichStudentsWithMonths(students);

    // CSVヘッダー
    const headers = [
      '生徒様名',
      '学籍番号',
      '経過月数',
      'NotionURL',
      'ステータス',
      '契約プラン',
      'キャラクター名',
      'YTチャンネルID',
      'X ID'
    ];

    // CSVデータ
    const rows = enrichedStudents.map(student => {
      // X IDから@を削除
      const xId = student.xId ? student.xId.replace('@', '') : '';
      
      return [
        student.name || '',
        student.studentId || '',
        student.monthsElapsed || 0,
        student.notionUrl || '',
        student.status || '',
        student.plan || '',
        student.characterName || '',
        student.ytChannelId || '',
        xId
      ];
    });

    // CSV形式に変換
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // カンマやダブルクォートを含む場合はエスケープ
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // UTF-8 BOM付きで返す（Excelでの文字化け防止）
    const bom = '\uFEFF';
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
    res.send(bom + csvContent);

  } catch (error) {
    console.error('Error in /api/notion/export-spreadsheet:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notion/cache/clear
 * キャッシュをクリア（手動リフレッシュ用）
 */
router.post('/cache/clear', async (req, res) => {
  try {
    console.log('🗑️ Clearing all caches...');
    
    // メモリキャッシュをクリア
    cacheService.clear();
    console.log('✅ Memory cache cleared');
    
    // データベースキャッシュをクリア
    await databaseCacheService.clearCache();
    console.log('✅ Database cache cleared');
    
    res.json({
      success: true,
      message: 'All caches cleared successfully (memory + database)',
    });
  } catch (error) {
    console.error('❌ Error clearing caches:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notion/update
 * データを手動で更新（キャッシュクリア + 再取得）
 */
router.post('/update', async (req, res) => {
  try {
    const result = await manualUpdate();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/debug/suspension
 * 休会データのデバッグ情報を取得
 */
router.get('/debug/suspension', async (req, res) => {
  try {
    console.log('🔍 Debug: Fetching suspension data...');
    const suspensionData = await fetchSuspensionData();
    
    // 最初の10件を取得
    const entries = Object.entries(suspensionData).slice(0, 10);
    
    res.json({
      success: true,
      totalCount: Object.keys(suspensionData).length,
      sample: entries.map(([studentId, data]) => ({
        studentId,
        ...data
      })),
      allKeys: Object.keys(suspensionData).slice(0, 20), // 最初の20個の学籍番号
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/debug/tutors
 * NotionからのTutor名の形式をデバッグ表示
 */
router.get('/debug/tutors', async (req, res) => {
  try {
    console.log('🔍 Debug: Fetching tutors from Notion...');
    const students = await fetchStudents();
    
    // ユニークなTutor名を抽出
    const tutors = [...new Set(students.map(s => s.tutor).filter(Boolean))].sort();
    
    res.json({
      success: true,
      totalTutors: tutors.length,
      tutors: tutors,
      sample: tutors.slice(0, 20), // 最初の20人
    });
  } catch (error) {
    console.error('❌ Error fetching tutors:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notion/suspension-history
 * 休会歴の詳細情報を取得（複数レコード対応）
 */
router.get('/suspension-history', async (req, res) => {
  try {
    console.log('📋 GET /api/notion/suspension-history - Fetching detailed suspension history');
    
    const students = await fetchStudents();
    const suspensionData = await fetchSuspensionData();
    
    // 経過月数を計算
    const enrichedStudents = enrichStudentsWithMonths(students);
    
    // 休会歴がある生徒のみをフィルタし、詳細情報を追加
    const suspensionHistory = [];
    
    enrichedStudents.forEach(student => {
      const suspension = suspensionData[student.studentId];
      
      if (suspension && suspension.hasSuspensionHistory) {
        const monthsElapsed = student.monthsElapsed || 0;
        const totalSuspensionMonths = suspension.suspensionMonths || 0;
        const adjustedMonths = Math.max(0, monthsElapsed - totalSuspensionMonths);
        
        // 各休会レコードを展開
        if (suspension.records && suspension.records.length > 0) {
          suspension.records.forEach((record, index) => {
            suspensionHistory.push({
              id: `${student.studentId}-${index}`,
              studentId: student.studentId,
              name: student.name,
              tutor: student.tutor,
              status: student.status,
              lessonStartDate: student.lessonStartDate,
              monthsElapsed,
              suspensionStartDate: record.suspensionStartDate,
              suspensionMonths: record.suspensionMonths,
              totalSuspensionMonths, // 全休会期間の合計
              adjustedMonths,
              recordIndex: index + 1,
              totalRecords: suspension.records.length,
            });
          });
        } else {
          // recordsがない場合（旧データ）は1件として扱う
          suspensionHistory.push({
            id: student.studentId,
            studentId: student.studentId,
            name: student.name,
            tutor: student.tutor,
            status: student.status,
            lessonStartDate: student.lessonStartDate,
            monthsElapsed,
            suspensionStartDate: suspension.suspensionStartDate,
            suspensionMonths: totalSuspensionMonths,
            totalSuspensionMonths,
            adjustedMonths,
            recordIndex: 1,
            totalRecords: 1,
          });
        }
      }
    });
    
    console.log(`✅ Found ${suspensionHistory.length} suspension records for ${new Set(suspensionHistory.map(r => r.studentId)).size} students`);
    
    res.json({
      success: true,
      count: suspensionHistory.length,
      uniqueStudents: new Set(suspensionHistory.map(r => r.studentId)).size,
      data: suspensionHistory,
    });
  } catch (error) {
    console.error('❌ Error fetching suspension history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
