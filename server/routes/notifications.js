import express from 'express';
import { 
  manualSendSuspensionEndNotifications,
  manualSendMonthlyStudentList,
  manualSendIncompleteList
} from '../services/backgroundService.js';
import { checkExaminationFormSubmission, fetchSuspensionData } from '../services/sheetsService.js';
import { sendSuspensionEndNotification } from '../services/slackService.js';

const router = express.Router();

/**
 * POST /api/notifications/suspension-end
 * 休会終了通知を手動送信（テスト用）
 */
router.post('/suspension-end', async (req, res) => {
  try {
    const result = await manualSendSuspensionEndNotifications();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/monthly-student-list
 * 月次生徒リストを手動送信（テスト用）
 */
router.post('/monthly-student-list', async (req, res) => {
  try {
    const result = await manualSendMonthlyStudentList();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/incomplete-list
 * 未完了リストを手動送信（テスト用）
 */
router.post('/incomplete-list', async (req, res) => {
  try {
    const result = await manualSendIncompleteList();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/check-examination-form
 * 審査結果フォームの送信状況を確認
 */
router.post('/check-examination-form', async (req, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'studentId is required',
      });
    }
    
    const hasSubmission = await checkExaminationFormSubmission(studentId);
    
    res.json({
      success: true,
      studentId,
      hasSubmission,
      message: hasSubmission 
        ? 'フォームが送信されています' 
        : '審査結果フォームが未送信です。フォームを送信してください',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/notifications/test-slack
 * Slack通知のテスト送信（ダミーデータ）
 */
router.post('/test-slack', async (req, res) => {
  try {
    // ダミーの休会終了生徒データを作成
    const dummyStudents = [
      {
        name: 'テスト太郎',
        studentId: 'TEST-001',
        suspensionEndDate: '2026-02-28',
        notionUrl: 'https://notion.so/test-001',
      },
      {
        name: 'テスト花子',
        studentId: 'TEST-002',
        suspensionEndDate: '2026-02-28',
        notionUrl: 'https://notion.so/test-002',
      },
    ];

    console.log('🧪 Sending test Slack notification with dummy data...');
    const result = await sendSuspensionEndNotification(dummyStudents);
    
    res.json({
      success: result.success,
      message: 'Test Slack notification sent',
      count: dummyStudents.length,
      result,
    });
  } catch (error) {
    console.error('❌ Error sending test Slack notification:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notifications/preview-suspension-end
 * 今月終了予定の休会生徒をプレビュー（Slackには送信しない）
 */
router.get('/preview-suspension-end', async (req, res) => {
  try {
    const { getSuspensionEndingStudents } = await import('../services/backgroundService.js');
    const students = await getSuspensionEndingStudents();
    
    res.json({
      success: true,
      count: students.length,
      students: students.map(s => ({
        name: s.name,
        studentId: s.studentId,
        suspensionStartDate: s.suspensionStartDate,
        suspensionMonths: s.suspensionMonths,
        suspensionEndDate: s.suspensionEndDate,
        notionUrl: s.notionUrl,
      })),
    });
  } catch (error) {
    console.error('❌ Error previewing suspension end students:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
