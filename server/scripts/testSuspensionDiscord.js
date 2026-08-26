import dotenv from 'dotenv';
import {
  formatSuspensionForumThreadName,
  sendSuspensionDiscordForumNotification,
} from '../services/discordService.js';

dotenv.config();

if (process.env.SUSPENSION_DISCORD_TEST_CONFIRM !== 'yes') {
  console.error(
    '⛔ Discordテスト投稿は実行されませんでした。'
    + ' SUSPENSION_DISCORD_TEST_CONFIRM=yes を一時指定してください。'
  );
  process.exitCode = 1;
} else {
  const testData = {
    name: process.env.SUSPENSION_DISCORD_TEST_NAME || '【テスト】テスト生徒',
    studentId: process.env.SUSPENSION_DISCORD_TEST_STUDENT_ID || 'TEST-0001',
    notionUrl: process.env.SUSPENSION_DISCORD_TEST_NOTION_URL
      || 'https://www.notion.so/test-suspension-notification',
    suspensionStartDate: process.env.SUSPENSION_DISCORD_TEST_START_DATE || '2026/09/01',
    suspensionEndDate: process.env.SUSPENSION_DISCORD_TEST_END_DATE || '2026/11/30',
  };

  console.log('🧪 Discordフォーラムへ休会テスト投稿を送信します。');
  console.log(`   投稿タイトル: ${formatSuspensionForumThreadName(testData.name)}`);

  const result = await sendSuspensionDiscordForumNotification(testData);
  if (!result.success) {
    console.error(`❌ Discordテスト投稿に失敗しました: ${result.error}`);
    process.exitCode = 1;
  } else {
    console.log('✅ Discordテスト投稿が完了しました。');
    console.log(`   Thread ID: ${result.threadId || '-'}`);
    console.log(`   Message ID: ${result.messageId || '-'}`);
  }
}
