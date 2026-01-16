import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

// Routes
import notionRoutes from './routes/notion.js';
import studentsRoutes from './routes/students.js';

// Background services
import { initializeDataPreload, scheduleDailyUpdate } from './services/backgroundService.js';

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

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes
app.use('/api/notion', notionRoutes);
app.use('/api/students', studentsRoutes);

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
      notes_1 TEXT,
      
      -- 2回目（10ヶ月目・11ヶ月目用）
      extension_certainty_2 VARCHAR(20),
      hearing_status_2 BOOLEAN DEFAULT false,
      examination_result_2 VARCHAR(50),
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
    END $$;
  `;

  try {
    await pool.query(createTableQuery);
    await pool.query(migrationQuery);
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
  
  // 定期更新スケジュールを設定（毎日 AM 2:00 JST）
  scheduleDailyUpdate();
  
  console.log('✅ Server initialization completed');
});

export default app;
