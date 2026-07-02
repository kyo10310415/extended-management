import express from 'express';
import { pool } from '../index.js';
import { fetchStudents } from '../services/notionService.js';
import { fetchSuspensionData } from '../services/sheetsService.js';
import { calculateMonthsElapsed } from '../utils/dateUtils.js';
import {
  fetchAdvancedHearingStudents,
  fetchAdvancedExaminationStudents,
  fetchProStartDates,
  calculateProPlanMonths,
  hearingMonth,
  examMonth,
  enrichStudentsWithProPlanMonths,
} from '../services/proPlanExternalService.js';

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
          promotion_reviewed BOOLEAN DEFAULT FALSE,
          pro_plan_status VARCHAR(20) DEFAULT '',
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
    } else {
      // テーブルが存在する場合、新しいカラムを追加（存在しない場合のみ）
      try {
        await pool.query(`
          DO $$ 
          BEGIN
            -- promotion_reviewed カラムを追加
            IF NOT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'pro_plan_data' AND column_name = 'promotion_reviewed'
            ) THEN
              ALTER TABLE pro_plan_data ADD COLUMN promotion_reviewed BOOLEAN DEFAULT FALSE;
            END IF;
            
            -- pro_plan_status カラムを追加
            IF NOT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'pro_plan_data' AND column_name = 'pro_plan_status'
            ) THEN
              ALTER TABLE pro_plan_data ADD COLUMN pro_plan_status VARCHAR(20) DEFAULT '';
            END IF;
            
            -- 古い pro_plan_enabled カラムのデータを pro_plan_status に移行
            IF EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_name = 'pro_plan_data' AND column_name = 'pro_plan_enabled'
            ) THEN
              UPDATE pro_plan_data 
              SET pro_plan_status = CASE 
                WHEN pro_plan_enabled = true THEN '確定'
                ELSE ''
              END
              WHERE pro_plan_status = '' OR pro_plan_status IS NULL;
            END IF;
          END $$;
        `);
        console.log('✅ pro_plan_data columns updated successfully');
      } catch (updateError) {
        console.log('⚠️  Column update warning (may already exist):', updateError.message);
      }
    }
  } catch (error) {
    console.error('❌ Error ensuring pro_plan_data table exists:', error);
    throw error;
  }
}

/**
 * GET /api/pro-plan/students
 * 永久会員 + 生徒プランで17ヶ月以上の生徒一覧を取得（Proプランデータと結合）
 */
router.get('/students', async (req, res) => {
  console.log('📋 GET /api/pro-plan/students - Fetching lifetime members and 17+ month students');

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    // Notionから全生徒データを取得
    const allStudents = await fetchStudents();
    console.log(`  Total students from Notion: ${allStudents.length}`);

    // 休会データを取得
    const suspensionData = await fetchSuspensionData();
    console.log(`  Suspension data count: ${Object.keys(suspensionData).length}`);

    // 永久会員 + 生徒プランで17ヶ月以上の生徒をフィルタ
    const targetStudents = allStudents.filter(s => {
      // 永久会員は常に対象
      if (s.plan === '永久会員') {
        return true;
      }
      
      // 生徒プランで、アクティブな生徒のみ対象
      if (s.plan === '生徒プラン' && s.status === 'アクティブ') {
        // 継続月数を計算
        const monthsElapsed = calculateMonthsElapsed(s.lessonStartDate, 0);
        
        // 休会期間を取得
        const suspension = suspensionData[s.studentId];
        const suspensionMonths = suspension?.suspensionMonths || 0;
        
        // 調整後月数を計算
        const adjustedMonths = Math.max(0, monthsElapsed - suspensionMonths);
        
        // 17ヶ月以上の生徒を対象
        return adjustedMonths >= 17;
      }
      
      return false;
    });
    
    console.log(`  Lifetime members (永久会員): ${allStudents.filter(s => s.plan === '永久会員').length}`);
    console.log(`  Students with 17+ months (生徒プラン): ${targetStudents.filter(s => s.plan === '生徒プラン').length}`);
    console.log(`  Total target students: ${targetStudents.length}`);

    if (targetStudents.length === 0) {
      return res.json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // 学籍番号リストを取得
    const studentIds = targetStudents.map(s => s.studentId);

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
          promotionReviewed: row.promotion_reviewed || false,
          proPlanStatus: row.pro_plan_status || '',
          notes: row.notes,
          updatedAt: row.updated_at,
        };
      });
    } catch (dbError) {
      console.error('  ⚠️  Error fetching pro plan data from DB:', dbError.message);
      // DBエラーがあってもNotionデータは返す
    }

    // Notionデータとproプランデータを結合
    const enrichedStudents = targetStudents.map(student => {
      // 継続月数を計算
      const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate, 0);
      
      // 休会期間を取得
      const suspension = suspensionData[student.studentId];
      const suspensionMonths = suspension?.suspensionMonths || 0;
      const hasSuspensionHistory = suspension?.hasSuspensionHistory || false;
      const suspensionStartDate = suspension?.suspensionStartDate || null;
      
      // 調整後月数を計算
      const adjustedMonths = Math.max(0, monthsElapsed - suspensionMonths);
      
      return {
        studentId: student.studentId,
        name: student.name,
        tutor: student.tutor,
        plan: student.plan,
        lessonStartDate: student.lessonStartDate,
        status: student.status,
        notionUrl: student.notionUrl,
        monthsElapsed,
        adjustedMonths,
        suspensionMonths,
        hasSuspensionHistory,
        suspensionStartDate,
        proPlanStartMonth: null,
        promotionReviewed: false,
        proPlanStatus: '',
        ...proPlanMap[student.studentId], // Proプランデータをマージ（存在する場合）
      };
    });

    console.log('  ✅ Successfully enriched target students with pro plan data');

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
  const { pro_plan_start_month, promotion_reviewed, pro_plan_status, notes } = req.body;
  
  console.log('📝 POST /api/pro-plan/:studentId');
  console.log('  学籍番号:', studentId);
  console.log('  データ:', { pro_plan_start_month, promotion_reviewed, pro_plan_status, notes });

  try {
    // テーブルの存在を確認（存在しない場合は作成）
    await ensureProPlanTableExists();
    
    const result = await pool.query(
      `INSERT INTO pro_plan_data (student_id, pro_plan_start_month, promotion_reviewed, pro_plan_status, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id)
       DO UPDATE SET
         pro_plan_start_month = EXCLUDED.pro_plan_start_month,
         promotion_reviewed = EXCLUDED.promotion_reviewed,
         pro_plan_status = EXCLUDED.pro_plan_status,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, pro_plan_start_month, promotion_reviewed, pro_plan_status, notes]
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
        promotion_reviewed: row.promotion_reviewed || false,
        pro_plan_status: row.pro_plan_status || '',
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

// ─────────────────────────────────────────────────────────────
// PRO プラン 4 回目以降ヒアリング・審査 API
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/pro-plan/advanced-hearing
 * PROプラン継続月数が N 回目ヒアリング対象の生徒一覧を返す。
 *
 * Query params:
 *   round       - 対象回数（4 以上、デフォルト 4）
 *   monthOffset - 月オフセット（-1:前月, 0:今月, 1:翌月、デフォルト 0）
 *
 * 複数回まとめて取得したい場合は round を省略し allRounds=true を渡すと
 * round 4〜10 の全対象を返す（将来拡張用）。
 */
router.get('/advanced-hearing', async (req, res) => {
  const round = parseInt(req.query.round ?? '4', 10);
  const monthOffset = parseInt(req.query.monthOffset ?? '0', 10);

  console.log(`📡 GET /api/pro-plan/advanced-hearing round=${round} monthOffset=${monthOffset}`);

  try {
    // Notion から全生徒取得
    const allStudents = await fetchStudents();

    // 外部 DB から pro_plan_start_date を取得してフィルタ
    const targetStudents = await fetchAdvancedHearingStudents(allStudents, round, monthOffset);

    // student_extensions データ（extension_certainty 等）を結合
    const studentIds = targetStudents.map(s => s.studentId);
    let extensionsMap = {};
    if (studentIds.length > 0) {
      const cycleCol = `extension_certainty_${round}`;
      // 既存の cycle ベースのカラム（cycle=3 が Proプラン相当）を使う
      // 4 回目以降は専用カラムが未作成のため cycle=4 以降はまず取得を試みる
      try {
        const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
        const extResult = await pool.query(
          `SELECT student_id,
                  extension_certainty_4, hearing_status_4,
                  extension_certainty_5, hearing_status_5,
                  extension_certainty_6, hearing_status_6
             FROM student_extensions
            WHERE student_id IN (${placeholders})`,
          studentIds
        );
        extResult.rows.forEach(row => {
          extensionsMap[row.student_id] = row;
        });
      } catch (_e) {
        // カラム未作成の場合は空で続行
        console.warn('[advanced-hearing] student_extensions extra columns not yet created, skipping');
      }
    }

    const enriched = targetStudents.map(s => ({
      ...s,
      extensionData: extensionsMap[s.studentId] ?? null,
    }));

    res.json({
      success: true,
      round,
      targetMonths: hearingMonth(round),
      monthOffset,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    console.error('❌ /api/pro-plan/advanced-hearing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pro-plan/advanced-examination
 * PROプラン継続月数が N 回目審査対象の生徒一覧を返す。
 *
 * Query params:
 *   round       - 対象回数（4 以上、デフォルト 4）
 *   monthOffset - 月オフセット（-1:前月, 0:今月, 1:翌月、デフォルト 0）
 */
router.get('/advanced-examination', async (req, res) => {
  const round = parseInt(req.query.round ?? '4', 10);
  const monthOffset = parseInt(req.query.monthOffset ?? '0', 10);

  console.log(`📡 GET /api/pro-plan/advanced-examination round=${round} monthOffset=${monthOffset}`);

  try {
    const allStudents = await fetchStudents();
    const targetStudents = await fetchAdvancedExaminationStudents(allStudents, round, monthOffset);

    const studentIds = targetStudents.map(s => s.studentId);
    let extensionsMap = {};
    if (studentIds.length > 0) {
      try {
        const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
        const extResult = await pool.query(
          `SELECT student_id,
                  extension_certainty_4, examination_result_4,
                  extension_certainty_5, examination_result_5,
                  extension_certainty_6, examination_result_6
             FROM student_extensions
            WHERE student_id IN (${placeholders})`,
          studentIds
        );
        extResult.rows.forEach(row => {
          extensionsMap[row.student_id] = row;
        });
      } catch (_e) {
        console.warn('[advanced-examination] student_extensions extra columns not yet created, skipping');
      }
    }

    const enriched = targetStudents.map(s => ({
      ...s,
      extensionData: extensionsMap[s.studentId] ?? null,
    }));

    res.json({
      success: true,
      round,
      targetMonths: examMonth(round),
      monthOffset,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    console.error('❌ /api/pro-plan/advanced-examination error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pro-plan/advanced-all
 * 4回目以降の全ヒアリング・審査を月数でグループ化して返す。
 * (フロントエンドで任意の round を表示するためのヘルパー)
 *
 * Query params:
 *   monthOffset - 月オフセット（デフォルト 0）
 *   maxRound    - 最大回数（デフォルト 10）
 */
router.get('/advanced-all', async (req, res) => {
  const monthOffset = parseInt(req.query.monthOffset ?? '0', 10);
  const maxRound   = Math.min(parseInt(req.query.maxRound ?? '10', 10), 20);

  console.log(`📡 GET /api/pro-plan/advanced-all monthOffset=${monthOffset} maxRound=${maxRound}`);

  try {
    const allStudents = await fetchStudents();

    // 全生徒の pro_plan_start_date を一括取得
    const allIds = allStudents.map(s => s.studentId);
    const proStartMap = await fetchProStartDates(allIds);

    // 各生徒の継続月数と round 情報を計算
    const result = [];
    for (const student of allStudents) {
      const { proStartDate } = proStartMap[student.studentId] || {};
      const proPlanMonths = calculateProPlanMonths(proStartDate, monthOffset);
      if (!proPlanMonths) continue;

      // 4回目以降に該当するか確認
      for (let r = 4; r <= maxRound; r++) {
        if (proPlanMonths === hearingMonth(r)) {
          result.push({ ...student, proStartDate: proStartDate || null, proPlanMonths, round: r, type: 'hearing' });
          break;
        }
        if (proPlanMonths === examMonth(r)) {
          result.push({ ...student, proStartDate: proStartDate || null, proPlanMonths, round: r, type: 'examination' });
          break;
        }
      }
    }

    res.json({
      success: true,
      monthOffset,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error('❌ /api/pro-plan/advanced-all error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pro-plan/pro-months/bulk
 * 複数生徒の PROプラン継続月数を一括取得（生徒情報マスタ用）
 *
 * Body: { studentIds: string[] }
 * Response: { success: true, data: { [studentId]: { proStartDate, proPlanMonths } } }
 */
router.post('/pro-months/bulk', async (req, res) => {
  const { studentIds } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ success: false, error: 'studentIds must be a non-empty array' });
  }

  try {
    const proStartMap = await fetchProStartDates(studentIds);

    const data = {};
    studentIds.forEach(id => {
      const { proStartDate } = proStartMap[id] || {};
      data[id] = {
        proStartDate: proStartDate || null,
        proPlanMonths: calculateProPlanMonths(proStartDate, 0),
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ /api/pro-plan/pro-months/bulk error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
