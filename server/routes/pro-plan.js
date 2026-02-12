import express from 'express';
import { pool } from '../index.js';
import { fetchStudents } from '../services/notionService.js';

const router = express.Router();

// テーブル存在確認と自動作成
async function ensureProPlanTableExists() {
  try {
    // テーブルが存在するか確認
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pro_plan_data'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('⚠️  pro_plan_data table does not exist. Creating...');
      
      // テーブルを作成
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pro_plan_data (
          id SERIAL PRIMARY KEY,
          student_id VARCHAR(50) UNIQUE NOT NULL,
          pro_plan_start_month VARCHAR(7),
          pro_plan_enabled BOOLEAN DEFAULT FALSE,
          notes TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_pro_plan_student_id ON pro_plan_data(student_id);
        
        CREATE OR REPLACE FUNCTION update_pro_plan_data_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS update_pro_plan_data_timestamp ON pro_plan_data;
        
        CREATE TRIGGER update_pro_plan_data_timestamp
        BEFORE UPDATE ON pro_plan_data
        FOR EACH ROW
        EXECUTE FUNCTION update_pro_plan_data_timestamp();
      `);
      
      console.log('✅ pro_plan_data table created successfully');
    }
  } catch (error) {
    console.error('❌ Error ensuring pro_plan_data table exists:', error);
    throw error;
  }
}

/**
 * GET /api/pro-plan/students
 * 永久会員の生徒一覧を取得（Proプランデータと結合）
 */
router.get('/students', async (req, res) => {
  console.log('📋 GET /api/pro-plan/students - Fetching lifetime members');

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    // Notionから全生徒データを取得
    const allStudents = await fetchStudents();
    console.log(`  Total students from Notion: ${allStudents.length}`);

    // 永久会員のみフィルタ
    const lifetimeMembers = allStudents.filter(s => s.plan === '永久会員');
    console.log(`  Lifetime members (永久会員): ${lifetimeMembers.length}`);

    if (lifetimeMembers.length === 0) {
      return res.json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // 学籍番号リストを取得
    const studentIds = lifetimeMembers.map(s => s.studentId);

    // Proプランデータを一括取得
    let proPlanMap = {};
    try {
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
      const proPlanResult = await pool.query(
        `SELECT * FROM pro_plan_data WHERE student_id IN (${placeholders})`,
        studentIds
      );

      console.log(`  Pro plan records from DB: ${proPlanResult.rows.length}`);

      // Proプランデータをマップに変換
      proPlanResult.rows.forEach(row => {
        proPlanMap[row.student_id] = {
          proPlanStartMonth: row.pro_plan_start_month,
          proPlan: row.pro_plan_enabled,
          notes: row.notes,
          updatedAt: row.updated_at,
        };
      });
    } catch (dbError) {
      console.error('  ⚠️  Error fetching pro plan data from DB:', dbError.message);
      // DBエラーがあってもNotionデータは返す
    }

    // Notionデータとproプランデータを結合
    const enrichedStudents = lifetimeMembers.map(student => ({
      studentId: student.studentId,
      name: student.name,
      tutor: student.tutor,
      plan: student.plan,
      lessonStartDate: student.lessonStartDate,
      status: student.status,
      notionUrl: student.notionUrl,
      proPlanStartMonth: null,
      proPlan: false,
      ...proPlanMap[student.studentId], // Proプランデータをマージ（存在する場合）
    }));

    console.log('  ✅ Successfully enriched lifetime members with pro plan data');

    res.json({
      success: true,
      count: enrichedStudents.length,
      data: enrichedStudents,
    });
  } catch (error) {
    console.error('  ❌ Error fetching pro plan students:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/pro-plan/:studentId
 * 特定の生徒のProプラン管理データを取得
 */
router.get('/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    const result = await pool.query(
      'SELECT * FROM pro_plan_data WHERE student_id = $1',
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const row = result.rows[0];
    
    const data = {
      student_id: row.student_id,
      pro_plan_start_month: row.pro_plan_start_month,
      pro_plan_enabled: row.pro_plan_enabled,
      notes: row.notes,
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching pro plan data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/pro-plan/:studentId
 * 生徒のProプラン管理データを作成または更新
 */
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const { pro_plan_start_month, pro_plan_enabled, notes } = req.body;
  
  console.log('📝 POST /api/pro-plan/:studentId');
  console.log('  学籍番号:', studentId);
  console.log('  データ:', { pro_plan_start_month, pro_plan_enabled, notes });

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    const result = await pool.query(
      `INSERT INTO pro_plan_data (student_id, pro_plan_start_month, pro_plan_enabled, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id)
       DO UPDATE SET
         pro_plan_start_month = EXCLUDED.pro_plan_start_month,
         pro_plan_enabled = EXCLUDED.pro_plan_enabled,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, pro_plan_start_month, pro_plan_enabled, notes]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving pro plan data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/pro-plan/bulk
 * 複数の生徒のProプラン管理データを一括取得
 */
router.post('/bulk', async (req, res) => {
  const { studentIds } = req.body;

  console.log('📦 POST /api/pro-plan/bulk');
  console.log('  生徒数:', studentIds?.length);

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'studentIds must be a non-empty array',
    });
  }

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT * FROM pro_plan_data WHERE student_id IN (${placeholders})`,
      studentIds
    );

    console.log('  取得件数:', result.rows.length);

    // 学籍番号をキーとしたマップに変換
    const proPlanMap = {};
    result.rows.forEach(row => {
      proPlanMap[row.student_id] = {
        student_id: row.student_id,
        pro_plan_start_month: row.pro_plan_start_month,
        pro_plan_enabled: row.pro_plan_enabled,
        notes: row.notes,
        updated_at: row.updated_at,
        created_at: row.created_at,
      };
    });

    console.log('  ✅ 一括取得成功');

    res.json({
      success: true,
      data: proPlanMap,
    });
  } catch (error) {
    console.error('  ❌ 一括取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
