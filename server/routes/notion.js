import express from 'express';
import { fetchStudents } from '../services/notionService.js';
import { fetchFormUpdates, fetchSuspensionData } from '../services/sheetsService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth } from '../utils/dateUtils.js';
import cacheService from '../services/cacheService.js';
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
 */
router.get('/hearing', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    const suspensionData = await fetchSuspensionData();
    
    // 4ヶ月目と10ヶ月目の生徒をフィルタリング（アクティブのみ）
    const month4Students = filterStudentsByMonth(students, 4)
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

    const month10Students = filterStudentsByMonth(students, 10)
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
 */
router.get('/examination', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    const suspensionData = await fetchSuspensionData();
    
    // 5ヶ月目と11ヶ月目の生徒をフィルタリング（アクティブのみ）
    const month5Students = filterStudentsByMonth(students, 5)
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

    const month11Students = filterStudentsByMonth(students, 11)
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
 * POST /api/notion/cache/clear
 * キャッシュをクリア（手動リフレッシュ用）
 */
router.post('/cache/clear', (req, res) => {
  try {
    cacheService.clear();
    res.json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
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

export default router;
