import { fetchStudents } from './notionService.js';
import { fetchSuspensionData } from './sheetsService.js';
import { calculateMonthsElapsed } from '../utils/dateUtils.js';
import cacheService from './cacheService.js';

/**
 * 生徒情報をCSV形式で生成
 */
export async function exportStudentsToCSV() {
  try {
    console.log('📊 Starting CSV export...');

    // キャッシュをクリアして最新データを取得
    console.log('🗑️ Clearing cache to fetch fresh data from Notion...');
    cacheService.delete('notion_students');

    // Notionから生徒データを取得
    const students = await fetchStudents();
    console.log(`✅ Fetched ${students.length} students from Notion`);
    
    // 休会データを取得
    const suspensionData = await fetchSuspensionData();
    console.log(`✅ Fetched suspension data`);

    // CSVヘッダー
    const headers = [
      '生徒様名',
      '学籍番号',
      '経過月数',
      'NotionURL',
      'ステータス',
      '契約プラン',
      'キャラクター名',
      'YTチャンネルID',
      'X ID（@は無し）',
    ];

    // データ行を作成
    const rows = students.map((student, index) => {
      const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
      
      // 休会を引いた調整後の経過月数
      const suspension = suspensionData[student.studentId];
      const adjustedMonths = suspension 
        ? Math.max(0, monthsElapsed - suspension.suspensionMonths)
        : monthsElapsed;
      
      // X IDから@を除去
      let xId = student.xId || '';
      if (xId.startsWith('@')) {
        xId = xId.substring(1);
      }

      // デバッグ: 最初の5件のX IDをログ出力
      if (index < 5) {
        console.log(`Debug CSV row ${index} - Student ${student.studentId}:`);
        console.log(`  monthsElapsed: ${monthsElapsed}, suspensionMonths: ${suspension?.suspensionMonths || 0}, adjustedMonths: ${adjustedMonths}`);
        console.log(`  xId raw: "${student.xId}"`);
        console.log(`  xId processed: "${xId}"`);
      }

      return [
        escapeCSV(student.name || ''),
        escapeCSV(student.studentId || ''),
        adjustedMonths || '',  // 調整後の経過月数を使用
        escapeCSV(student.notionUrl || ''),
        escapeCSV(student.status || ''),
        escapeCSV(student.plan || ''),
        escapeCSV(student.characterName || ''),
        escapeCSV(student.ytChannelId || ''),
        escapeCSV(xId),
      ];
    });

    // CSV文字列を生成
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    console.log(`✅ Generated CSV with ${rows.length} rows`);

    return {
      success: true,
      csvContent,
      rowCount: rows.length,
    };
  } catch (error) {
    console.error('❌ Error generating CSV:', error);
    throw error;
  }
}

/**
 * CSV用に文字列をエスケープ
 */
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // カンマ、ダブルクォート、改行を含む場合はダブルクォートで囲む
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}
