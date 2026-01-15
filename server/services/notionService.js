import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import cacheService from './cacheService.js';

dotenv.config();

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * Notion データベースから生徒情報を取得（ページネーション対応 + キャッシュ）
 */
export async function fetchStudents() {
  const cacheKey = 'notion_students';
  
  // キャッシュをチェック
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`📦 Returning ${cached.length} students from cache`);
    return cached;
  }

  try {
    let allStudents = [];
    let hasMore = true;
    let startCursor = undefined;

    console.log('🔄 Fetching students from Notion API...');

    // ページネーションで全データを取得
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: 100,
        start_cursor: startCursor,
      });

      const students = response.results.map(page => {
        const properties = page.properties;
        
        return {
          id: page.id,
          studentId: getPropertyValue(properties['学籍番号']),
          name: getPropertyValue(properties['名前']),
          tutor: getPropertyValue(properties['担任Tutor']),
          plan: getPropertyValue(properties['契約プラン']),
          lessonStartDate: getPropertyValue(properties['レッスン開始月']),
          status: getPropertyValue(properties['ステータス']),
          notionUrl: page.url,
        };
      });

      allStudents = allStudents.concat(students);

      hasMore = response.has_more;
      startCursor = response.next_cursor;

      // ログで進捗を表示
      console.log(`📊 Fetched ${allStudents.length} students from Notion...`);
    }

    console.log(`✅ Total students fetched: ${allStudents.length}`);

    const filteredStudents = allStudents.filter(s => s.studentId && s.lessonStartDate);

    // キャッシュに保存（5分間）
    cacheService.set(cacheKey, filteredStudents);

    return filteredStudents;
  } catch (error) {
    console.error('Error fetching from Notion:', error);
    throw error;
  }
}

/**
 * Notionプロパティから値を取得するヘルパー関数
 */
function getPropertyValue(property) {
  if (!property) return null;

  switch (property.type) {
    case 'title':
      return property.title[0]?.plain_text || null;
    case 'rich_text':
      return property.rich_text[0]?.plain_text || null;
    case 'number':
      return property.number;
    case 'select':
      return property.select?.name || null;
    case 'multi_select':
      return property.multi_select.map(s => s.name).join(', ') || null;
    case 'date':
      return property.date?.start || null;
    case 'people':
      return property.people.map(p => p.name).join(', ') || null;
    case 'email':
      return property.email;
    case 'phone_number':
      return property.phone_number;
    case 'url':
      return property.url;
    case 'checkbox':
      return property.checkbox;
    default:
      return null;
  }
}

export default notion;
