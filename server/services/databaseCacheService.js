import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * データベースキャッシュサービス
 * Notionから取得したデータをPostgreSQLにキャッシュ
 */
class DatabaseCacheService {
  /**
   * Notionの生徒データをデータベースにキャッシュ
   */
  async cacheNotionStudents(students) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      console.log(`💾 Caching ${students.length} students to database...`);
      
      for (const student of students) {
        await client.query(`
          INSERT INTO notion_students_cache (
            student_id, name, tutor, plan, lesson_start_date,
            status, character_name, yt_channel_id, x_id, notion_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (student_id) 
          DO UPDATE SET
            name = EXCLUDED.name,
            tutor = EXCLUDED.tutor,
            plan = EXCLUDED.plan,
            lesson_start_date = EXCLUDED.lesson_start_date,
            status = EXCLUDED.status,
            character_name = EXCLUDED.character_name,
            yt_channel_id = EXCLUDED.yt_channel_id,
            x_id = EXCLUDED.x_id,
            notion_url = EXCLUDED.notion_url,
            updated_at = CURRENT_TIMESTAMP
        `, [
          student.studentId,
          student.name,
          student.tutor,
          student.plan,
          student.lessonStartDate,
          student.status,
          student.characterName,
          student.ytChannelId,
          student.xId,
          student.notionUrl
        ]);
      }
      
      await client.query('COMMIT');
      console.log(`✅ Successfully cached ${students.length} students to database`);
      
      return { success: true, count: students.length };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error caching students to database:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * データベースキャッシュから生徒データを取得
   */
  async getNotionStudents() {
    try {
      const result = await pool.query(`
        SELECT 
          student_id as "studentId",
          name,
          tutor,
          plan,
          TO_CHAR(lesson_start_date, 'YYYY-MM-DD') as "lessonStartDate",
          status,
          character_name as "characterName",
          yt_channel_id as "ytChannelId",
          x_id as "xId",
          notion_url as "notionUrl",
          updated_at as "updatedAt"
        FROM notion_students_cache
        ORDER BY student_id
      `);
      
      console.log(`📦 Retrieved ${result.rows.length} students from database cache`);
      return result.rows;
    } catch (error) {
      console.error('❌ Error retrieving students from database cache:', error);
      throw error;
    }
  }

  /**
   * キャッシュの最終更新時刻を取得
   */
  async getCacheLastUpdate() {
    try {
      const result = await pool.query(`
        SELECT MAX(updated_at) as last_update
        FROM notion_students_cache
      `);
      
      return result.rows[0]?.last_update || null;
    } catch (error) {
      console.error('❌ Error getting cache last update:', error);
      return null;
    }
  }

  /**
   * キャッシュをクリア
   */
  async clearCache() {
    try {
      await pool.query('TRUNCATE TABLE notion_students_cache');
      console.log('🗑️ Database cache cleared');
      return { success: true };
    } catch (error) {
      console.error('❌ Error clearing database cache:', error);
      throw error;
    }
  }
}

export default new DatabaseCacheService();
