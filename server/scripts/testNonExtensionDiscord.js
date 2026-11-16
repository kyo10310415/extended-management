import { sendExaminationResultNotification } from '../services/discordService.js';

const result = await sendExaminationResultNotification({
  name: '【テスト送信】テスト生徒',
  tutor: 'テストTutor',
  studentId: 'TEST-NON-EXTENSION',
  notionUrl: 'https://www.notion.so/test',
  resultLabel: '退会',
});

if (!result.success) {
  console.error(`Test notification failed: ${result.error || 'unknown error'}`);
  process.exitCode = 1;
} else {
  console.log('Test notification sent successfully');
}
