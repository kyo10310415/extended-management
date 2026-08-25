CREATE TABLE IF NOT EXISTS forced_withdrawals (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  lesson_start_date DATE NOT NULL,
  forced_withdrawal_date DATE NOT NULL,
  withdrawal_reason VARCHAR(50) NOT NULL,
  months_elapsed INTEGER NOT NULL CHECK (months_elapsed >= 1),
  discord_notification_sent BOOLEAN NOT NULL DEFAULT false,
  discord_notification_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forced_withdrawals_date
  ON forced_withdrawals(forced_withdrawal_date DESC);

CREATE OR REPLACE FUNCTION update_forced_withdrawals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_forced_withdrawals_timestamp ON forced_withdrawals;
CREATE TRIGGER update_forced_withdrawals_timestamp
  BEFORE UPDATE ON forced_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION update_forced_withdrawals_timestamp();
