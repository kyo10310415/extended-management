import axios from 'axios';
import { getTutorWebhooks, normalizeTutorName } from './tutorWebhookService.js';

export function buildExaminationResultDiscordMessage({
  name,
  tutor,
  studentId,
  notionUrl,
  resultLabel,
}) {
  return {
    content: [
      '@everyone',
      '延長審査報告',
      `生徒名：${name || '-'}`,
      `担当Tutor名：${tutor || '-'}`,
      `学籍番号：${studentId || '-'}`,
      `NotionURL：${notionUrl || '-'}`,
      `審査結果：${resultLabel === 'PROプラン' ? 'PROプラン' : '延長'}`,
    ].join('\n'),
    allowed_mentions: { parse: ['everyone'] },
  };
}

/**
 * 審査結果が「延長」へ更新されたことを専用Webhookへ通知する。
 * @param {{name: string, tutor: string, studentId: string, notionUrl: string, resultLabel: string}} student
 */
export async function sendExaminationResultNotification({
  name,
  tutor,
  studentId,
  notionUrl,
  resultLabel,
}) {
  const webhookUrl = process.env.EXAMINATION_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      success: false,
      error: 'EXAMINATION_DISCORD_WEBHOOK_URL is not configured',
    };
  }

  const message = buildExaminationResultDiscordMessage({
    name,
    tutor,
    studentId,
    notionUrl,
    resultLabel,
  });

  try {
    await axios.post(
      webhookUrl,
      {
        ...message,
      },
      { timeout: 10000 }
    );
    console.log(`✅ Sent examination result notification for ${studentId}`);
    return { success: true };
  } catch (error) {
    console.error(
      `❌ Failed to send examination result notification for ${studentId}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

const FORCED_WITHDRAWAL_MENTION_USER_IDS = Object.freeze([
  '766666980086120470',
  '703557224814870568',
  '1423132417744441445',
]);

export function buildForcedWithdrawalDiscordMessage({
  name,
  studentId,
  forcedWithdrawalDate,
  withdrawalReason,
}) {
  const mentions = FORCED_WITHDRAWAL_MENTION_USER_IDS
    .map((userId) => `<@${userId}>`)
    .join(' ');

  return {
    content: [
      mentions,
      '強制退会申請',
      `生徒名：${name || '-'}`,
      `学籍番号：${studentId || '-'}`,
      `強制退会日：${forcedWithdrawalDate || '-'}`,
      `退会理由：${withdrawalReason || '-'}`,
    ].join('\n'),
    allowed_mentions: {
      parse: [],
      users: [...FORCED_WITHDRAWAL_MENTION_USER_IDS],
    },
  };
}

export async function sendForcedWithdrawalNotification(data) {
  const webhookUrl = process.env.FORCED_WITHDRAWAL_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      success: false,
      error: 'FORCED_WITHDRAWAL_DISCORD_WEBHOOK_URL is not configured',
    };
  }

  try {
    await axios.post(
      webhookUrl,
      buildForcedWithdrawalDiscordMessage(data),
      { timeout: 10000 }
    );
    console.log(`✅ Sent forced withdrawal notification for ${data.studentId}`);
    return { success: true };
  } catch (error) {
    console.error(
      `❌ Failed to send forced withdrawal notification for ${data.studentId}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

const FORCED_WITHDRAWAL_STUDENT_MESSAGE = `# 【退会についてのご連絡】

## ・キャラクターの利用について

ご契約期間の途中で退会された場合、ご提供したキャラクター（立ち絵、Live2Dモデル、お名前）は一切ご使用いただけなくなります。
そのため、ご自身のアカウントであっても、キャラクターが使用されている過去の動画やアイコン、ポストなどはすべて削除していただく必要がございます。
理由は、キャラクターを構成するイラストやモデルなどの「すべてのデジタル素材」の著作権や知的財産権が、弊社（株式会社ONE LOOP）に帰属しているためです。
会社として、大切なIP（知的財産）をトラブルから守るための厳格なルールとなっております。
こちらの内容は、ご契約時に同意いただいた『コンサルティング業務委託契約書』の「第3条（知的財産権の帰属）第1項・第2項」および「（別紙）利用条件」に記載されておりますので、併せてご確認ください。

## お支払いについて

メールでの諾成契約時、説明会動画、契約書による契約の締結時と3度にわたって説明させていただいた通り、退会処理後も残りの契約期間分のレッスン料は発生いたしますのでご注意ください。

残債の確認やお支払いについての問い合わせは下記のフォームよりお願い致します。

https://docs.google.com/forms/d/e/1FAIpQLSeTAfgFm65uyQeroLPXQvwVX7ww-1U6Mfr54ogdK9p26dg9FQ/viewform`;

export function isAllowedDiscordWebhookUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    const allowedHosts = new Set([
      'discord.com',
      'ptb.discord.com',
      'canary.discord.com',
      'discordapp.com',
    ]);
    const pathParts = url.pathname.split('/').filter(Boolean);

    return url.protocol === 'https:'
      && allowedHosts.has(url.hostname)
      && pathParts.length === 4
      && pathParts[0] === 'api'
      && pathParts[1] === 'webhooks'
      && /^\d+$/.test(pathParts[2])
      && pathParts[3].length > 0;
  } catch {
    return false;
  }
}

export function buildForcedWithdrawalStudentDiscordMessage(discordUserId) {
  const normalizedUserId = String(discordUserId ?? '').trim();
  return {
    content: `<@${normalizedUserId}>\n\n${FORCED_WITHDRAWAL_STUDENT_MESSAGE}`,
    allowed_mentions: {
      parse: [],
      users: [normalizedUserId],
    },
  };
}

export async function sendForcedWithdrawalStudentNotification({
  webhookUrl,
  discordUserId,
  studentId,
}) {
  const normalizedUserId = String(discordUserId ?? '').trim();
  if (!/^\d{17,20}$/.test(normalizedUserId)) {
    return { success: false, error: 'Discord user ID is invalid' };
  }
  if (!isAllowedDiscordWebhookUrl(webhookUrl)) {
    return { success: false, error: 'Discord webhook URL is invalid' };
  }

  try {
    await axios.post(
      webhookUrl,
      buildForcedWithdrawalStudentDiscordMessage(normalizedUserId),
      { timeout: 10000 }
    );
    console.log(`✅ Sent forced withdrawal student notification for ${studentId}`);
    return { success: true };
  } catch (error) {
    console.error(
      `❌ Failed to send forced withdrawal student notification for ${studentId}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

export function parseDiscordChannelUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    const allowedHosts = new Set([
      'discord.com',
      'ptb.discord.com',
      'canary.discord.com',
      'discordapp.com',
    ]);
    const parts = url.pathname.split('/').filter(Boolean);

    if (
      url.protocol !== 'https:'
      || !allowedHosts.has(url.hostname)
      || parts.length !== 3
      || parts[0] !== 'channels'
      || !/^\d{17,20}$/.test(parts[1])
      || !/^\d{17,20}$/.test(parts[2])
    ) {
      return null;
    }

    return { guildId: parts[1], channelId: parts[2] };
  } catch {
    return null;
  }
}

export function formatJapaneseYearMonthEnd(yearMonth) {
  const match = String(yearMonth ?? '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}年${month}月末`;
}

export function buildExtensionAgreementDiscordMessage(endYearMonth) {
  const formattedEndMonth = formatJapaneseYearMonthEnd(endYearMonth);
  if (!formattedEndMonth) {
    throw new Error('Extension end month is invalid');
  }

  return {
    content: `# 契約延長の妥結について

以下の内容の通り、契約延長したことをお知らせいたします。

【VTUBER事業開始契約書の備考】 VTUBER事業開始契約書の"第４条【本契約の期間等】"に記載のある本契約の有効期間及び本件業務遂行期間は、契約書の内容に関わらず、${formattedEndMonth}（レッスンの最終月）までとする。

------------------`,
    allowed_mentions: { parse: [] },
  };
}

export async function sendExtensionAgreementNotification({
  chatUrl,
  endYearMonth,
  studentId,
}) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return { success: false, error: 'DISCORD_BOT_TOKEN is not configured' };
  }

  const channel = parseDiscordChannelUrl(chatUrl);
  if (!channel) {
    return { success: false, error: 'Discord chat URL is invalid' };
  }

  try {
    await axios.post(
      `https://discord.com/api/v10/channels/${channel.channelId}/messages`,
      buildExtensionAgreementDiscordMessage(endYearMonth),
      {
        headers: { Authorization: `Bot ${botToken}` },
        timeout: 10000,
      }
    );
    console.log(`✅ Sent extension agreement notification for ${studentId}`);
    return { success: true };
  } catch (error) {
    console.error(
      `❌ Failed to send extension agreement notification for ${studentId}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

export function formatSuspensionForumThreadName(name) {
  const normalized = String(name ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const baseName = normalized.endsWith('様') ? normalized.slice(0, -1).trimEnd() : normalized;
  return `${Array.from(baseName).slice(0, 99).join('')}様`;
}

export function parseDiscordForumTagIds(value) {
  const rawIds = String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (rawIds.some((id) => !/^\d{17,20}$/.test(id))) return null;
  return [...new Set(rawIds)];
}

const SUSPENSION_NOTIFICATION_MENTION_USER_IDS = Object.freeze([
  '766666980086120470',
]);

export function buildSuspensionDiscordForumMessage({
  name,
  studentId,
  notionUrl,
  suspensionStartDate,
  suspensionEndDate,
  appliedTagIds = [],
}) {
  const threadName = formatSuspensionForumThreadName(name);
  if (!threadName) {
    throw new Error('Suspension student name is missing');
  }

  const message = {
    thread_name: threadName,
    content: [
      `<@${SUSPENSION_NOTIFICATION_MENTION_USER_IDS[0]}>`,
      '',
      `学籍番号：${studentId || '-'}`,
      `Notionリンク：${notionUrl || '-'}`,
      `休会開始日：${suspensionStartDate || '-'}`,
      `休会終了日：${suspensionEndDate || '-'}`,
    ].join('\n'),
    allowed_mentions: {
      parse: [],
      users: [...SUSPENSION_NOTIFICATION_MENTION_USER_IDS],
    },
  };

  if (appliedTagIds.length > 0) {
    message.applied_tags = appliedTagIds;
  }
  return message;
}

/**
 * 休会申請をDiscordのフォーラムチャンネルへ新規投稿する。
 * thread_nameが投稿タイトルになり、wait=trueで保存結果を受け取る。
 */
export async function sendSuspensionDiscordForumNotification(data) {
  const webhookUrl = process.env.SUSPENSION_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      success: false,
      error: 'SUSPENSION_DISCORD_WEBHOOK_URL is not configured',
    };
  }
  if (!isAllowedDiscordWebhookUrl(webhookUrl)) {
    return { success: false, error: 'Suspension Discord webhook URL is invalid' };
  }

  const appliedTagIds = parseDiscordForumTagIds(
    process.env.SUSPENSION_DISCORD_FORUM_TAG_IDS
  );
  if (appliedTagIds === null) {
    return {
      success: false,
      error: 'SUSPENSION_DISCORD_FORUM_TAG_IDS contains an invalid tag ID',
    };
  }

  let message;
  try {
    message = buildSuspensionDiscordForumMessage({ ...data, appliedTagIds });
  } catch (error) {
    return { success: false, error: error.message };
  }

  try {
    const executeUrl = new URL(webhookUrl);
    executeUrl.searchParams.set('wait', 'true');
    const response = await axios.post(executeUrl.toString(), message, {
      timeout: 10000,
    });
    console.log(`✅ Sent suspension forum notification for ${data.studentId}`);
    return {
      success: true,
      messageId: response.data?.id || null,
      threadId: response.data?.channel_id || null,
    };
  } catch (error) {
    console.error(
      `❌ Failed to send suspension forum notification for ${data.studentId}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

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
  sendExaminationResultNotification,
  sendForcedWithdrawalNotification,
  sendForcedWithdrawalStudentNotification,
  sendExtensionAgreementNotification,
  sendSuspensionDiscordForumNotification,
  sendMonthlyStudentListToTutors,
  sendIncompleteStudentListToTutors,
};
