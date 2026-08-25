ALTER TABLE forced_withdrawals
  ADD COLUMN IF NOT EXISTS student_discord_notification_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_discord_notification_sent_at TIMESTAMP;
