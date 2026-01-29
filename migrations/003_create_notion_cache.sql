-- Notion生徒データのキャッシュテーブル
CREATE TABLE IF NOT EXISTS notion_students_cache (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  notion_id VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  tutor VARCHAR(255),
  plan VARCHAR(255),
  lesson_start_date VARCHAR(20),
  status VARCHAR(50),
  character_name VARCHAR(255),
  yt_channel_id VARCHAR(255),
  x_id VARCHAR(255),
  notion_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_notion_cache_student_id ON notion_students_cache(student_id);
CREATE INDEX IF NOT EXISTS idx_notion_cache_status ON notion_students_cache(status);
CREATE INDEX IF NOT EXISTS idx_notion_cache_updated_at ON notion_students_cache(updated_at);

-- 最終更新時刻を記録するテーブル
CREATE TABLE IF NOT EXISTS sync_metadata (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) UNIQUE NOT NULL,
  last_sync_at TIMESTAMP,
  sync_status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  records_synced INTEGER DEFAULT 0
);

-- 初期データ
INSERT INTO sync_metadata (sync_type, last_sync_at, sync_status)
VALUES ('notion_students', NULL, 'pending')
ON CONFLICT (sync_type) DO NOTHING;
