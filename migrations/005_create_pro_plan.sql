-- Proプラン管理テーブル
CREATE TABLE IF NOT EXISTS pro_plan_management (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  pro_plan_start_date DATE,
  pro_plan_enabled BOOLEAN DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_pro_plan_student_id ON pro_plan_management(student_id);
CREATE INDEX IF NOT EXISTS idx_pro_plan_enabled ON pro_plan_management(pro_plan_enabled);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_pro_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pro_plan_timestamp ON pro_plan_management;
CREATE TRIGGER update_pro_plan_timestamp
  BEFORE UPDATE ON pro_plan_management
  FOR EACH ROW
  EXECUTE FUNCTION update_pro_plan_timestamp();
