import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Slackに休会終了通知を送信
 */
export async function sendSuspensionEndNotification(suspensionEndingStudents) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('⚠️ SLACK_WEBHOOK_URL not configured, skipping Slack notification');
    return { success: false, message: 'Slack webhook URL not configured' };
  }

  try {
    const message = formatSuspensionEndMessage(suspensionEndingStudents);
    
    await axios.post(SLACK_WEBHOOK_URL, {
      text: message,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🔔 休会終了予定のお知らせ',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `今月中に休会期間が終了する生徒は *${suspensionEndingStudents.length}名* です。`
          }
        },
        {
          type: 'divider'
        },
        ...suspensionEndingStudents.map(student => ({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${student.name}* (${student.studentId})\n` +
                  `休会終了日: ${student.suspensionEndDate}\n` +
                  `<${student.notionUrl}|Notionページを開く>`
          }
        }))
      ]
    });

    console.log(`✅ Slack notification sent for ${suspensionEndingStudents.length} students`);
    return { success: true, count: suspensionEndingStudents.length };
  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 休会終了メッセージをフォーマット
 */
function formatSuspensionEndMessage(students) {
  const header = '🔔 休会終了予定のお知らせ\n\n';
  const summary = `今月中に休会期間が終了する生徒は ${students.length}名 です。\n\n`;
  
  const studentList = students.map(student => 
    `・${student.name} (${student.studentId})\n` +
    `  休会終了日: ${student.suspensionEndDate}\n` +
    `  ${student.notionUrl}`
  ).join('\n\n');

  return header + summary + studentList;
}

export default {
  sendSuspensionEndNotification,
};
