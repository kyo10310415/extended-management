import express from 'express';
import { fetchStudents } from '../services/notionService.js';
import { fetchFormUpdates } from '../services/sheetsService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth } from '../utils/dateUtils.js';

const router = express.Router();

/**
 * GET /api/notion/students
 * Notionから全生徒情報を取得
 */
router.get('/students', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    
    // 経過月数を追加し、フォーム更新日を紐付け
    const enrichedStudents = enrichStudentsWithMonths(students).map(student => ({
      ...student,
      formLastUpdate: formUpdates[student.studentId] || null,
    }));

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
 * 4ヶ月目の生徒（ヒアリング一覧）を取得
 */
router.get('/hearing', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    
    // 4ヶ月目の生徒をフィルタリング
    const hearingStudents = filterStudentsByMonth(students, 4).map(student => ({
      ...student,
      monthsElapsed: 4,
      formLastUpdate: formUpdates[student.studentId] || null,
    }));

    res.json({
      success: true,
      data: hearingStudents,
      count: hearingStudents.length,
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
 * 5ヶ月目の生徒（延長審査一覧）を取得
 */
router.get('/examination', async (req, res) => {
  try {
    const students = await fetchStudents();
    const formUpdates = await fetchFormUpdates();
    
    // 5ヶ月目の生徒をフィルタリング
    const examinationStudents = filterStudentsByMonth(students, 5).map(student => ({
      ...student,
      monthsElapsed: 5,
      formLastUpdate: formUpdates[student.studentId] || null,
    }));

    res.json({
      success: true,
      data: examinationStudents,
      count: examinationStudents.length,
    });
  } catch (error) {
    console.error('Error in /api/notion/examination:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
