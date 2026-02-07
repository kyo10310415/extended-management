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

/**
 * GET /api/notifications/preview-monthly-student-list
 * 月次生徒リストをプレビュー（Discordには送信しない）
 */
router.get('/preview-monthly-student-list', async (req, res) => {
  try {
    const { fetchStudentsFromNotion } = await import('../services/notionService.js');
    const { enrichStudentsWithMonths, filterStudentsByMonth } = await import('../utils/dateUtils.js');
    const { getTutorWebhooks, normalizeTutorName } = await import('../services/tutorWebhookService.js');
    
    const students = await fetchStudentsFromNotion();
    const enrichedStudents = enrichStudentsWithMonths(students);
    
    // 今月のヒアリング対象（4ヶ月目・10ヶ月目）
    const hearingStudents = [
      ...filterStudentsByMonth(enrichedStudents, 4, 0),
      ...filterStudentsByMonth(enrichedStudents, 10, 0),
    ].filter(s => s.status === 'アクティブ');
    
    // 今月の延長審査対象（5ヶ月目・11ヶ月目）
    const examinationStudents = [
      ...filterStudentsByMonth(enrichedStudents, 5, 0),
      ...filterStudentsByMonth(enrichedStudents, 11, 0),
    ].filter(s => s.status === 'アクティブ');
    
    // 担当Tutorごとにグループ化
    const tutorWebhooks = await getTutorWebhooks();
    const tutorGroups = groupStudentsByTutor(hearingStudents, examinationStudents);
    
    // プレビュー用にデータを整形
    const preview = [];
    for (const [tutor, students] of Object.entries(tutorGroups)) {
      const normalizedTutor = normalizeTutorName(tutor);
      const webhookData = tutorWebhooks[normalizedTutor];
      
      preview.push({
        tutor,
        normalizedTutor,
        hasWebhook: !!webhookData,
        userId: webhookData?.userId || null,
        roleId: '1294923221107478571',
        mentions: buildMentions(webhookData?.userId),
        hearingCount: students.hearing.length,
        examinationCount: students.examination.length,
        hearingStudents: students.hearing.map(s => ({
          name: s.name,
          studentId: s.studentId,
          monthsElapsed: s.monthsElapsed,
          notionUrl: s.notionUrl,
        })),
        examinationStudents: students.examination.map(s => ({
          name: s.name,
          studentId: s.studentId,
          monthsElapsed: s.monthsElapsed,
          notionUrl: s.notionUrl,
        })),
      });
    }
    
    res.json({
      success: true,
      totalTutors: preview.length,
      totalHearingStudents: hearingStudents.length,
      totalExaminationStudents: examinationStudents.length,
      preview,
    });
  } catch (error) {
    console.error('❌ Error previewing monthly student list:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/notifications/preview-incomplete-list
 * 未完了リストをプレビュー（Discordには送信しない）
 */
router.get('/preview-incomplete-list', async (req, res) => {
  try {
    const { fetchStudentsFromNotion } = await import('../services/notionService.js');
    const { enrichStudentsWithMonths, filterStudentsByMonth } = await import('../utils/dateUtils.js');
    const { getTutorWebhooks, normalizeTutorName } = await import('../services/tutorWebhookService.js');
    
    const students = await fetchStudentsFromNotion();
    const enrichedStudents = enrichStudentsWithMonths(students);
    
    // 今月のヒアリング対象（4ヶ月目・10ヶ月目）でヒアリング未完了
    const hearingStudents = [
      ...filterStudentsByMonth(enrichedStudents, 4, 0),
      ...filterStudentsByMonth(enrichedStudents, 10, 0),
    ].filter(s => s.status === 'アクティブ' && !s.hearingCompleted);
    
    // 今月の延長審査対象（5ヶ月目・11ヶ月目）で審査結果未入力
    const examinationStudents = [
      ...filterStudentsByMonth(enrichedStudents, 5, 0),
      ...filterStudentsByMonth(enrichedStudents, 11, 0),
    ].filter(s => s.status === 'アクティブ' && !s.examinationResult);
    
    // 担当Tutorごとにグループ化
    const tutorWebhooks = await getTutorWebhooks();
    const tutorGroups = groupStudentsByTutor(hearingStudents, examinationStudents);
    
    // プレビュー用にデータを整形
    const preview = [];
    for (const [tutor, students] of Object.entries(tutorGroups)) {
      const normalizedTutor = normalizeTutorName(tutor);
      const webhookData = tutorWebhooks[normalizedTutor];
      
      preview.push({
        tutor,
        normalizedTutor,
        hasWebhook: !!webhookData,
        userId: webhookData?.userId || null,
        roleId: '1294923221107478571',
        mentions: buildMentions(webhookData?.userId),
        incompleteHearingCount: students.hearing.length,
        incompleteExaminationCount: students.examination.length,
        incompleteHearingStudents: students.hearing.map(s => ({
          name: s.name,
          studentId: s.studentId,
          monthsElapsed: s.monthsElapsed,
          notionUrl: s.notionUrl,
        })),
        incompleteExaminationStudents: students.examination.map(s => ({
          name: s.name,
          studentId: s.studentId,
          monthsElapsed: s.monthsElapsed,
          notionUrl: s.notionUrl,
        })),
      });
    }
    
    res.json({
      success: true,
      totalTutors: preview.length,
      totalIncompleteHearingStudents: hearingStudents.length,
      totalIncompleteExaminationStudents: examinationStudents.length,
      preview,
    });
  } catch (error) {
    console.error('❌ Error previewing incomplete list:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ヘルパー関数: 担当Tutorごとに生徒をグループ化
 */
function groupStudentsByTutor(hearingStudents, examinationStudents) {
  const groups = {};
  
  hearingStudents.forEach(student => {
    if (!student.tutor) return;
    if (!groups[student.tutor]) {
      groups[student.tutor] = { hearing: [], examination: [] };
    }
    groups[student.tutor].hearing.push(student);
  });
  
  examinationStudents.forEach(student => {
    if (!student.tutor) return;
    if (!groups[student.tutor]) {
      groups[student.tutor] = { hearing: [], examination: [] };
    }
    groups[student.tutor].examination.push(student);
  });
  
  return groups;
}

/**
 * ヘルパー関数: メンション文字列を作成
 */
function buildMentions(userId) {
  const roleId = '1294923221107478571';
  const roleMention = `<@&${roleId}>`;
  const userMention = userId ? `<@${userId}>` : null;
  return [roleMention, userMention].filter(Boolean).join(' ');
}

/**
 * GET /api/notifications/debug-tutor-webhooks
 * スプレッドシートからTutorのWebhookとUser IDを取得してデバッグ表示
 */
router.get('/debug-tutor-webhooks', async (req, res) => {
  try {
    const { getTutorWebhooks } = await import('../services/tutorWebhookService.js');
    
    console.log('🔍 Fetching tutor webhooks from spreadsheet...');
    const tutorWebhooks = await getTutorWebhooks();
    
    // デバッグ情報を整形
    const debug = {
      success: true,
      totalTutors: Object.keys(tutorWebhooks).length,
      tutors: Object.entries(tutorWebhooks).map(([normalizedName, data]) => ({
        normalizedName,
        hasWebhook: !!data.webhookUrl,
        webhookUrl: data.webhookUrl ? `${data.webhookUrl.substring(0, 50)}...` : null, // 最初の50文字のみ表示
        userId: data.userId,
      })),
      rawData: tutorWebhooks, // 全データを返す（デバッグ用）
    };
    
    console.log(`✅ Successfully fetched ${debug.totalTutors} tutors`);
    res.json(debug);
  } catch (error) {
    console.error('❌ Error fetching tutor webhooks:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
