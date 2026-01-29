-- Notionから取得した生徒データのキャッシュテーブル
CREATE TABLE IF NOT EXISTS notion_students_cache (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100),
  tutor VARCHAR(100),
  plan VARCHAR(50),
  lesson_start_date DATE,
  status VARCHAR(50),
  character_name VARCHAR(100),
  yt_channel_id VARCHAR(100),
  x_id VARCHAR(100),
  notion_url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_notion_students_student_id ON notion_students_cache(student_id);
CREATE INDEX IF NOT EXISTS idx_notion_students_status ON notion_students_cache(status);
CREATE INDEX IF NOT EXISTS idx_notion_students_tutor ON notion_students_cache(tutor);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_notion_students_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_notion_students_cache_timestamp ON notion_students_cache;
CREATE TRIGGER update_notion_students_cache_timestamp
  BEFORE UPDATE ON notion_students_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_notion_students_cache_timestamp();
