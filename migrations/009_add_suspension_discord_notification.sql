ALTER TABLE suspension_payment_syncs
  ADD COLUMN IF NOT EXISTS student_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notion_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_status_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS discord_notification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (discord_notification_status IN ('pending', 'sent', 'skipped')),
  ADD COLUMN IF NOT EXISTS discord_notification_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS discord_thread_id VARCHAR(30),
  ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(30);

-- この機能の導入前に基準登録・完了していた申請は遡って通知しない。
UPDATE suspension_payment_syncs
   SET payment_status_completed_at = COALESCE(payment_status_completed_at, completed_at),
       discord_notification_status = 'skipped',
       updated_at = CURRENT_TIMESTAMP
 WHERE sync_status IN ('baseline', 'completed')
   AND discord_notification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_suspension_payment_discord_status
  ON suspension_payment_syncs(discord_notification_status, source_row_number);
