import express from 'express';
import { 
  manualSendSuspensionEndNotifications,
  manualSendMonthlyStudentList,
  manualSendIncompleteList
} from '../services/backgroundService.js';
import { checkExaminationFormSubmission } from '../services/sheetsService.js';

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

export default router;
