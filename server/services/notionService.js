import { Client } from '@notionhq/client';
import nodeFetch from 'node-fetch';
import dotenv from 'dotenv';
import databaseCacheService from './databaseCacheService.js';

dotenv.config();

/**
 * gzip圧縮を無効化したカスタムfetch
 * node-fetch v2 + Node.js v18以降の組み合わせで発生する
 * "Premature close" (ERR_STREAM_PREMATURE_CLOSE) を回避する
 */
function noCompressFetch(url, options = {}) {
  // Accept-Encoding を identity にして gzip/deflate を要求しない
  const headers = { ...(options.headers || {}), 'Accept-Encoding': 'identity' };
  return nodeFetch(url, { ...options, headers, compress: false });
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  fetch: noCompressFetch,
});

const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * 同時並走防止: 進行中の fetchStudentsFromNotion() があれば同じPromiseを返す
 * Dashboard が Promise.all で5エンドポイントを同時に叩いたとき、
 * Notion API への実際のリクエストは1本だけになる
 */
let _inflightFetch = null;

/**
 * Notion データベースから生徒情報を取得（データベースキャッシュ優先）
 */
export async function fetchStudents(forceRefresh = false) {
  // 強制更新でない場合、まずデータベースキャッシュを確認
  if (!forceRefresh) {
    try {
      const lastUpdate = await databaseCacheService.getCacheLastUpdate();
      
      // 最終同期から48時間以内であればデータベースキャッシュを使用
      if (lastUpdate) {
        const cacheAge = Date.now() - new Date(lastUpdate).getTime();
        const fortyEightHours = 48 * 60 * 60 * 1000; // 48時間
        
        if (cacheAge < fortyEightHours) {
          const ageMinutes = Math.floor(cacheAge / 1000 / 60);
          const ageHours = Math.floor(ageMinutes / 60);
          const displayAge = ageHours > 0 
            ? `${ageHours}時間${ageMinutes % 60}分前` 
            : `${ageMinutes}分前`;
          
          console.log(`📦 Using database cache (updated ${displayAge})`);
          const students = await databaseCacheService.getNotionStudents();
          
          if (students && students.length > 0) {
            return students;
          }
        } else {
          const ageHours = Math.floor(cacheAge / 1000 / 60 / 60);
          console.log(`⏰ Cache expired (${ageHours}時間前), fetching fresh data from Notion...`);
        }
      } else {
        console.log(`📭 No cache found, fetching fresh data from Notion...`);
      }
    } catch (error) {
      console.error('⚠️ Error checking database cache, falling back to Notion API:', error);
    }
  }
  
  // データベースキャッシュが無い、または古い場合、Notionから取得
  // 既に進行中のfetchがあれば同じPromiseを共有して Notion API への同時並走を防ぐ
  if (_inflightFetch) {
    console.log('⏳ Notion fetch already in-flight, reusing existing request...');
    return await _inflightFetch;
  }

  console.log('🔄 Fetching fresh data from Notion API...');
  _inflightFetch = fetchStudentsFromNotion().finally(() => {
    _inflightFetch = null; // 完了・エラーのいずれでもリセット
  });
  return await _inflightFetch;
}

/**
 * Notionから直接生徒情報を取得してデータベースに保存
 * Premature close 対策: 最大3回リトライ（exponential backoff）
 */
export async function fetchStudentsFromNotion(retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = [2000, 4000, 8000]; // 2s, 4s, 8s

  try {
    let allStudents = [];
    let hasMore = true;
    let startCursor = undefined;

    console.log('🔄 Fetching students from Notion API...');

    // ページネーションで全データを取得
    let pageCount = 0;
    const maxPages = 50; // 無限ループ防止: 最大50ページ（5000件）
    
    while (hasMore && pageCount < maxPages) {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount}, cursor: ${startCursor || 'initial'}`);
      
      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: 100,
        start_cursor: startCursor,
      });

      const students = response.results.map(page => {
        const properties = page.properties;
        
        const student = {
          id: page.id,
          studentId: getPropertyValue(properties['学籍番号']),
          name: getPropertyValue(properties['名前']),
          tutor: getPropertyValue(properties['担任Tutor']),
          plan: getPropertyValue(properties['契約プラン']),
          lessonStartDate: getPropertyValue(properties['レッスン開始月']),
          status: getPropertyValue(properties['ステータス']),
          characterName: getPropertyValue(properties['キャラクター名']),
          ytChannelId: getPropertyValue(properties['YTチャンネルID']),
          xId: getPropertyValue(properties['X ID（@は無し）']),
          notionUrl: page.url,
        };

        // デバッグ: 最初の3件のX IDをログ出力
        if (allStudents.length < 3 && student.studentId) {
          console.log(`Debug Notion fetch - Student ${student.studentId}:`);
          console.log(`  X ID value:`, student.xId);
        }

        return student;
      });

      allStudents = allStudents.concat(students);

      hasMore = response.has_more;
      startCursor = response.next_cursor;

      // ログで進捗を表示
      console.log(`📊 Page ${pageCount}: fetched ${students.length} students, total: ${allStudents.length}, hasMore: ${hasMore}`);
      
      // 同じカーソルで繰り返している場合は停止
      if (hasMore && !startCursor) {
        console.error('⚠️ Warning: hasMore is true but next_cursor is null. Breaking loop to prevent infinite loop.');
        break;
      }
    }
    
    if (pageCount >= maxPages) {
      console.error(`⚠️ Warning: Reached maximum page limit (${maxPages} pages). Some data may be missing.`);
    }

    console.log(`✅ Total students fetched: ${allStudents.length}`);

    const filteredStudents = allStudents.filter(s => s.studentId && s.lessonStartDate);

    // データベースに保存
    try {
      await databaseCacheService.cacheNotionStudents(filteredStudents);
    } catch (error) {
      console.error('⚠️ Failed to save to database, but continuing with data:', error);
    }

    return filteredStudents;
  } catch (error) {
    console.error(`Error fetching from Notion (attempt ${retryCount + 1}):`, error);

    // Premature close / 接続エラーはリトライ対象
    const isRetryable = 
      error?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
      error?.type === 'system' ||
      error?.message?.includes('Premature close') ||
      error?.message?.includes('ECONNRESET') ||
      error?.message?.includes('socket hang up');

    if (isRetryable && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS[retryCount] || 8000;
      console.log(`🔄 Retrying Notion fetch in ${delay}ms... (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchStudentsFromNotion(retryCount + 1);
    }

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
