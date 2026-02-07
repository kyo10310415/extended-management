import express from 'express';
import { fetchStudents } from '../services/notionService.js';
import { fetchFormUpdates, fetchSuspensionData } from '../services/sheetsService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth } from '../utils/dateUtils.js';
import cacheService from '../services/cacheService.js';
import databaseCacheService from '../services/databaseCacheService.js';
import { manualUpdate } from '../services/backgroundService.js';

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
    
    // 経過月数を追加し、フォーム更新日と休会情報を紐付け
    const enrichedStudents = enrichStudentsWithMonths(students).map(student => {
      const suspension = suspensionData[student.studentId];
      const adjustedMonths = suspension 
        ? Math.max(0, student.monthsElapsed - suspension.suspensionMonths)
        : student.monthsElapsed;
      
      return {
        ...student,
        formLastUpdate: formUpdates[student.studentId] || null,
        suspensionMonths: suspension?.suspensionMonths || 0,
        suspensionStartDate: suspension?.suspensionStartDate || null, // 休会開始日を追加
        hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
        adjustedMonths,
      };
    });

    res.json({
      success: true,
      data: enrichedStudents,
      count: enrichedStudents.length,
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
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    const suspensionData = await fetchSuspensionData();
    
    // 4ヶ月目と10ヶ月目の生徒をフィルタリング（アクティブのみ）
    const month4Students = filterStudentsByMonth(students, 4, monthOffset)
      .filter(s => s.status === 'アクティブ')
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const adjustedMonths = suspension ? 4 - suspension.suspensionMonths : 4;
        return {
          ...student,
          monthsElapsed: 4,
          adjustedMonths: adjustedMonths >= 0 ? adjustedMonths : 0,
          suspensionMonths: suspension?.suspensionMonths || 0,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          formLastUpdate: formUpdates[student.studentId] || null,
        };
      });

    const month10Students = filterStudentsByMonth(students, 10, monthOffset)
      .filter(s => s.status === 'アクティブ')
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const adjustedMonths = suspension ? 10 - suspension.suspensionMonths : 10;
        return {
          ...student,
          monthsElapsed: 10,
          adjustedMonths: adjustedMonths >= 0 ? adjustedMonths : 0,
          suspensionMonths: suspension?.suspensionMonths || 0,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          formLastUpdate: formUpdates[student.studentId] || null,
        };
      });

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
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    const suspensionData = await fetchSuspensionData();
    
    // 5ヶ月目と11ヶ月目の生徒をフィルタリング（アクティブのみ）
    const month5Students = filterStudentsByMonth(students, 5, monthOffset)
      .filter(s => s.status === 'アクティブ')
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const adjustedMonths = suspension ? 5 - suspension.suspensionMonths : 5;
        return {
          ...student,
          monthsElapsed: 5,
          adjustedMonths: adjustedMonths >= 0 ? adjustedMonths : 0,
          suspensionMonths: suspension?.suspensionMonths || 0,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          formLastUpdate: formUpdates[student.studentId] || null,
        };
      });

    const month11Students = filterStudentsByMonth(students, 11, monthOffset)
      .filter(s => s.status === 'アクティブ')
      .map(student => {
        const suspension = suspensionData[student.studentId];
        const adjustedMonths = suspension ? 11 - suspension.suspensionMonths : 11;
        return {
          ...student,
          monthsElapsed: 11,
          adjustedMonths: adjustedMonths >= 0 ? adjustedMonths : 0,
          suspensionMonths: suspension?.suspensionMonths || 0,
          hasSuspensionHistory: suspension?.hasSuspensionHistory || false,
          formLastUpdate: formUpdates[student.studentId] || null,
        };
      });

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

export default router;
