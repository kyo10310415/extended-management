import axios from 'axios';
import { getTutorWebhooks, normalizeTutorName } from './tutorWebhookService.js';

/**
 * 担当Tutorごとにヒアリング対象と延長審査対象の生徒リストをDiscordに送信
 */
export async function sendMonthlyStudentListToTutors(hearingStudents, examinationStudents) {
  try {
    console.log(`📊 sendMonthlyStudentListToTutors called with:`);
    console.log(`   - hearingStudents: ${hearingStudents.length}`);
    console.log(`   - examinationStudents: ${examinationStudents.length}`);
    
    const tutorWebhooks = await getTutorWebhooks();
    
    // 担当Tutorごとに生徒をグループ化
    const tutorGroups = groupStudentsByTutor(hearingStudents, examinationStudents);
    
    console.log(`📊 Grouped into ${Object.keys(tutorGroups).length} tutors:`);
    for (const [tutor, students] of Object.entries(tutorGroups)) {
      console.log(`   - ${tutor}: hearing=${students.hearing.length}, examination=${students.examination.length}`);
    }
    
    const results = [];
    
    for (const [tutor, students] of Object.entries(tutorGroups)) {
      const normalizedTutor = normalizeTutorName(tutor);
      const webhookData = tutorWebhooks[normalizedTutor];
      
      console.log(`\n📤 Sending to ${tutor} (normalized: ${normalizedTutor}):`);
      console.log(`   - Hearing: ${students.hearing.length} students`);
      console.log(`   - Examination: ${students.examination.length} students`);
      console.log(`   - Has webhook: ${!!webhookData?.webhookUrl}`);
      
      if (!webhookData || !webhookData.webhookUrl) {
        console.warn(`⚠️ No webhook URL found for tutor: ${tutor} (normalized: ${normalizedTutor})`);
        results.push({ tutor, success: false, message: 'Webhook URL not found' });
        continue;
      }
      
      try {
        await sendDiscordMessage(webhookData.webhookUrl, {
          tutor,
          userId: webhookData.userId,
          hearingStudents: students.hearing,
          examinationStudents: students.examination,
        });
        
        console.log(`✅ Sent Discord notification to ${tutor}`);
        results.push({ 
          tutor, 
          success: true, 
          hearingCount: students.hearing.length,
          examinationCount: students.examination.length,
        });
      } catch (error) {
        console.error(`❌ Error sending Discord notification to ${tutor}:`, error);
        results.push({ tutor, success: false, error: error.message });
      }
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('❌ Error in sendMonthlyStudentListToTutors:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 未完了の生徒リストを担当Tutorに送信
 */
export async function sendIncompleteStudentListToTutors(incompleteHearingStudents, incompleteExaminationStudents) {
  try {
    const tutorWebhooks = await getTutorWebhooks();
    
    // 担当Tutorごとに生徒をグループ化
    const tutorGroups = groupStudentsByTutor(incompleteHearingStudents, incompleteExaminationStudents);
    
    const results = [];
    
    for (const [tutor, students] of Object.entries(tutorGroups)) {
      const normalizedTutor = normalizeTutorName(tutor);
      const webhookData = tutorWebhooks[normalizedTutor];
      
      if (!webhookData || !webhookData.webhookUrl) {
        console.warn(`⚠️ No webhook URL found for tutor: ${tutor} (normalized: ${normalizedTutor})`);
        results.push({ tutor, success: false, message: 'Webhook URL not found' });
        continue;
      }
      
      try {
        await sendDiscordMessage(webhookData.webhookUrl, {
          tutor,
          userId: webhookData.userId,
          hearingStudents: students.hearing,
          examinationStudents: students.examination,
          isIncompleteList: true,
        });
        
        console.log(`✅ Sent incomplete list notification to ${tutor}`);
        results.push({ tutor, success: true, count: students.hearing.length + students.examination.length });
      } catch (error) {
        console.error(`❌ Error sending notification to ${tutor}:`, error);
        results.push({ tutor, success: false, error: error.message });
      }
    }
    
    return { success: true, results };
  } catch (error) {
    console.error('❌ Error in sendIncompleteStudentListToTutors:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 担当Tutorごとに生徒をグループ化
 */
function groupStudentsByTutor(hearingStudents, examinationStudents) {
  const groups = {};
  
  // ヒアリング対象生徒
  hearingStudents.forEach(student => {
    if (!student.tutor) return;
    
    if (!groups[student.tutor]) {
      groups[student.tutor] = { hearing: [], examination: [] };
    }
    groups[student.tutor].hearing.push(student);
  });
  
  // 延長審査対象生徒
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
 * Discordにメッセージを送信
 */
async function sendDiscordMessage(webhookUrl, data) {
  const { tutor, userId, hearingStudents, examinationStudents, isIncompleteList } = data;
  
  console.log(`\n🔍 sendDiscordMessage for ${tutor}:`);
  console.log(`   - hearingStudents: ${hearingStudents?.length || 0}`);
  console.log(`   - examinationStudents: ${examinationStudents?.length || 0}`);
  console.log(`   - isIncompleteList: ${isIncompleteList}`);
  
  const title = isIncompleteList 
    ? '⚠️ 未完了の生徒リスト' 
    : '📋 今月の対象生徒リスト';
  
  // ヒアリング対象セクション（0件でも表示）
  const hearingTitle = isIncompleteList ? 'ヒアリング未完了' : 'ヒアリング対象';
  const hearingSection = hearingStudents.length > 0 
    ? formatStudentSection(hearingTitle, hearingStudents, '🎤')
    : `**🎤 ${hearingTitle} (0名)**\n\n該当する生徒はいません\n\n`;
  
  // 延長審査対象セクション（0件でも表示）
  const examinationTitle = isIncompleteList ? '審査結果未入力' : '延長審査対象';
  const examinationSection = examinationStudents.length > 0 
    ? formatStudentSection(examinationTitle, examinationStudents, '📝')
    : `**📝 ${examinationTitle} (0名)**\n\n該当する生徒はいません\n\n`;
  
  console.log(`   - hearingSection length: ${hearingSection.length}`);
  console.log(`   - examinationSection length: ${examinationSection.length}`);
  
  // メンション文字列を作成
  // ロールID: 1294923221107478571
  const roleId = '1294923221107478571';
  const roleMention = `<@&${roleId}>`;
  const userMention = userId ? `<@${userId}>` : '';
  const mentions = [roleMention, userMention].filter(Boolean).join(' ');
  
  const description = `**${tutor}** 先生\n\n` +
                      hearingSection +
                      examinationSection;
  
  console.log(`   - Final description length: ${description.length} chars`);
  console.log(`   - Description preview: ${description.substring(0, 100)}...`);
  
  const message = {
    content: mentions, // メンションを追加
    embeds: [
      {
        title,
        description,
        color: isIncompleteList ? 0xFF6B6B : 0x4ECDC4, // 赤: 未完了、青緑: 通常
        timestamp: new Date().toISOString(),
        footer: {
          text: 'WannaV 延長管理システム'
        }
      }
    ]
  };
  
  console.log(`   - Sending to Discord webhook...`);
  await axios.post(webhookUrl, message);
  console.log(`   ✅ Discord message sent successfully`);
}

/**
 * 生徒リストのセクションをフォーマット
 */
function formatStudentSection(title, students, emoji) {
  const studentList = students.map((student, index) => 
    `${index + 1}. **${student.name}** (${student.studentId})\n` +
    `   ${student.notionUrl ? `[Notionページ](${student.notionUrl})` : ''}` +
    (student.monthsElapsed ? `\n   経過月数: ${student.monthsElapsed}ヶ月目` : '')
  ).join('\n\n');
  
  return `**${emoji} ${title} (${students.length}名)**\n\n${studentList}\n\n`;
}

export default {
  sendMonthlyStudentListToTutors,
  sendIncompleteStudentListToTutors,
};
