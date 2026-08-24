import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import cookieParser from 'cookie-parser';
const { Pool } = pkg;

// SSO Authentication Middleware
import ssoAuthMiddleware from './middleware/sso-auth-middleware.js';

// Routes
import notionRoutes from './routes/notion.js';
import studentsRoutes from './routes/students.js';
import sheetsRoutes from './routes/sheets.js';
import notificationsRoutes from './routes/notifications.js';
import proPlanRoutes from './routes/pro-plan.js';
import kpiExportRoutes from './routes/kpi-export.js';
import kpiSnapshotsRoutes from './routes/kpi-snapshots.js';

// Background services
import { 
  initializeDataPreload, 
  initializeAutomaticExaminationResultSync,
  scheduleDailyUpdate,
  scheduleAutomaticExaminationResultSync,
  scheduleSuspensionEndNotifications,
  scheduleMonthlyStudentListNotifications,
  scheduleIncompleteListNotifications,
  scheduleMonthlyKPIExport,
  scheduleMonthlyKPISnapshot
} from './services/backgroundService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// SSO Authentication (must be before routes)
app.use(ssoAuthMiddleware);

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes
app.use('/api/notion', notionRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/pro-plan', proPlanRoutes);
app.use('/api/kpi-export', kpiExportRoutes);
app.use('/api/kpi-snapshots', kpiSnapshotsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Initialize database tables
async function initDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS student_extensions (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) UNIQUE NOT NULL,
      
      -- 1回目（4ヶ月目・5ヶ月目用）
      extension_certainty_1 VARCHAR(20),
      hearing_status_1 BOOLEAN DEFAULT false,
      examination_result_1 VARCHAR(50),
      examination_result_manual_override_1 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_sent_1 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_pending_1 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_result_label_1 VARCHAR(20),
      discord_notification_sent_at_1 TIMESTAMP,
      notes_1 TEXT,
      
      -- 2回目（10ヶ月目・11ヶ月目用）
      extension_certainty_2 VARCHAR(20),
      hearing_status_2 BOOLEAN DEFAULT false,
      examination_result_2 VARCHAR(50),
      examination_result_manual_override_2 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_sent_2 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_pending_2 BOOLEAN NOT NULL DEFAULT false,
      discord_notification_result_label_2 VARCHAR(20),
      discord_notification_sent_at_2 TIMESTAMP,
      notes_2 TEXT,
      
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_student_id ON student_extensions(student_id);
  `;

  // 既存テーブルに新しいカラムを追加するマイグレーション
  const migrationQuery = `
    -- 1回目のカラム追加（存在しない場合のみ）
    DO $$
    DECLARE
      cycle_number INTEGER;
    BEGIN
      -- 既存のカラムを_1にリネーム
      IF EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'student_extensions' 
                 AND column_name = 'extension_certainty'
                 AND column_name NOT LIKE '%_1') THEN
        ALTER TABLE student_extensions 
          RENAME COLUMN extension_certainty TO extension_certainty_1;
        ALTER TABLE student_extensions 
          RENAME COLUMN hearing_status TO hearing_status_1;
        ALTER TABLE student_extensions 
          RENAME COLUMN examination_result TO examination_result_1;
        ALTER TABLE student_extensions 
          RENAME COLUMN notes TO notes_1;
      END IF;

      -- 2回目のカラム追加
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'student_extensions' 
                     AND column_name = 'extension_certainty_2') THEN
        ALTER TABLE student_extensions 
          ADD COLUMN extension_certainty_2 VARCHAR(20),
          ADD COLUMN hearing_status_2 BOOLEAN DEFAULT false,
          ADD COLUMN examination_result_2 VARCHAR(50),
          ADD COLUMN notes_2 TEXT;
      END IF;

      -- 3回目（Proプラン用）のカラム追加
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'student_extensions' 
                     AND column_name = 'extension_certainty_3') THEN
        ALTER TABLE student_extensions 
          ADD COLUMN extension_certainty_3 VARCHAR(20),
          ADD COLUMN hearing_status_3 BOOLEAN DEFAULT false,
          ADD COLUMN examination_result_3 VARCHAR(50),
          ADD COLUMN notes_3 TEXT;
      END IF;

      -- 4回目（PROプラン継続4か月目ヒアリング）のカラム追加
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'student_extensions' 
                     AND column_name = 'extension_certainty_4') THEN
        ALTER TABLE student_extensions 
          ADD COLUMN extension_certainty_4 VARCHAR(20),
          ADD COLUMN hearing_status_4 BOOLEAN DEFAULT false,
          ADD COLUMN examination_result_4 VARCHAR(50),
          ADD COLUMN notes_4 TEXT;
      END IF;

      -- 5回目（PROプラン継続10か月目ヒアリング）のカラム追加
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'student_extensions' 
                     AND column_name = 'extension_certainty_5') THEN
        ALTER TABLE student_extensions 
          ADD COLUMN extension_certainty_5 VARCHAR(20),
          ADD COLUMN hearing_status_5 BOOLEAN DEFAULT false,
          ADD COLUMN examination_result_5 VARCHAR(50),
          ADD COLUMN notes_5 TEXT;
      END IF;

      -- 6回目（PROプラン継続16か月目ヒアリング）のカラム追加
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'student_extensions' 
                     AND column_name = 'extension_certainty_6') THEN
        ALTER TABLE student_extensions 
          ADD COLUMN extension_certainty_6 VARCHAR(20),
          ADD COLUMN hearing_status_6 BOOLEAN DEFAULT false,
          ADD COLUMN examination_result_6 VARCHAR(50),
          ADD COLUMN notes_6 TEXT;
      END IF;

      -- 7〜10回目（画面上で選択可能な将来サイクル）のカラム追加
      FOR cycle_number IN 7..10 LOOP
        EXECUTE format(
          'ALTER TABLE student_extensions
             ADD COLUMN IF NOT EXISTS extension_certainty_%1$s VARCHAR(20),
             ADD COLUMN IF NOT EXISTS hearing_status_%1$s BOOLEAN DEFAULT false,
             ADD COLUMN IF NOT EXISTS examination_result_%1$s VARCHAR(50),
             ADD COLUMN IF NOT EXISTS notes_%1$s TEXT',
          cycle_number
        );
      END LOOP;

      -- 手動編集ロックを全サイクルに追加。
      -- 初回追加時のみ、既存の審査結果は手入力済みとして保護する。
      FOR cycle_number IN 1..10 LOOP
        IF NOT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_name = 'student_extensions'
             AND column_name = 'examination_result_manual_override_' || cycle_number
        ) THEN
          EXECUTE format(
            'ALTER TABLE student_extensions
               ADD COLUMN examination_result_manual_override_%1$s BOOLEAN NOT NULL DEFAULT false',
            cycle_number
          );
          EXECUTE format(
            'UPDATE student_extensions
                SET examination_result_manual_override_%1$s = true
              WHERE NULLIF(BTRIM(examination_result_%1$s), '''') IS NOT NULL',
            cycle_number
          );
        END IF;

        -- Discord通知状態。既存レコードは送信待ちにせず、導入後の「延長」遷移だけを通知する。
        EXECUTE format(
          'ALTER TABLE student_extensions
             ADD COLUMN IF NOT EXISTS discord_notification_sent_%1$s BOOLEAN NOT NULL DEFAULT false,
             ADD COLUMN IF NOT EXISTS discord_notification_pending_%1$s BOOLEAN NOT NULL DEFAULT false,
             ADD COLUMN IF NOT EXISTS discord_notification_result_label_%1$s VARCHAR(20),
             ADD COLUMN IF NOT EXISTS discord_notification_sent_at_%1$s TIMESTAMP',
          cycle_number
        );
      END LOOP;
    END $$;
  `;

  try {
    await pool.query(createTableQuery);
    await pool.query(migrationQuery);

    // KPI月次スナップショットテーブルの作成
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_monthly_snapshots (
        id SERIAL PRIMARY KEY,
        year_month VARCHAR(7) NOT NULL,           -- 例: '2026-05'
        month_label VARCHAR(20) NOT NULL,         -- 例: '2026年05月'
        snapshot_data JSONB NOT NULL,             -- 全体KPI（examination/extension/withdrawal/remaining/rates）
        tutor_data JSONB DEFAULT '[]'::jsonb,     -- Tutor別KPI配列
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year_month)
      );
      CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_year_month ON kpi_monthly_snapshots(year_month);
    `);

    console.log('✅ Database tables initialized and migrated');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  
  // データベース初期化
  await initDatabase();
  
  // バックグラウンドでデータをプリロード（起動時に即座に取得）
  console.log('📊 Starting data preload...');
  await initializeDataPreload();

  // 審査結果は起動時に一度同期し、以降はページ表示と切り離して30分ごとに更新
  await initializeAutomaticExaminationResultSync();
  
  // 定期更新スケジュールを設定
  scheduleDailyUpdate(); // 毎日 AM 2:00 JST
  scheduleAutomaticExaminationResultSync(); // 毎時00分・30分
  scheduleSuspensionEndNotifications(); // 毎月15日 AM 9:00 JST
  scheduleMonthlyStudentListNotifications(); // 毎月1日 AM 9:00 JST
  scheduleIncompleteListNotifications(); // 毎月20日 AM 9:00 JST
  scheduleMonthlyKPIExport(); // 毎月末日 PM 11:00 JST
  scheduleMonthlyKPISnapshot(); // 毎月1日 AM 2:00 JST（前月分スナップショット自動保存）
  console.log('✅ Server initialization completed');
});

export default app;
