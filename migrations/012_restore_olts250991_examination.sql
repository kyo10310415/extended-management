CREATE TABLE IF NOT EXISTS data_repair_history (
  repair_id VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2026-08-26の回答を2026-09-01 00:00 JSTに旧同期処理が再利用した
-- OLTS250991-XPの2回目審査だけを未処理状態へ戻す。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM data_repair_history
     WHERE repair_id = '2026-09-02-restore-olts250991-examination'
  ) THEN
    UPDATE student_extensions
       SET examination_result_2 = NULL,
           discord_notification_pending_2 = FALSE,
           discord_notification_sent_2 = FALSE,
           discord_notification_result_label_2 = NULL,
           discord_notification_sent_at_2 = NULL,
           executive_check_2 = NULL,
           revenue_extension_pending_2 = FALSE,
           revenue_extension_completed_2 = FALSE,
           revenue_extension_start_month_2 = NULL,
           revenue_extension_end_month_2 = NULL,
           revenue_extension_synced_at_2 = NULL,
           student_extension_notification_pending_2 = FALSE,
           student_extension_notification_sent_2 = FALSE,
           student_extension_notification_sent_at_2 = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE student_id = 'OLTS250991-XP'
       AND COALESCE(examination_result_manual_override_2, FALSE) = FALSE
       AND COALESCE(discord_notification_sent_2, FALSE) = TRUE
       AND discord_notification_sent_at_2 >= TIMESTAMP '2026-08-31 15:00:00'
       AND discord_notification_sent_at_2 < TIMESTAMP '2026-08-31 15:01:00'
       AND COALESCE(revenue_extension_completed_2, FALSE) = TRUE
       AND revenue_extension_end_month_2 = '2027-07';

    INSERT INTO data_repair_history (repair_id)
    VALUES ('2026-09-02-restore-olts250991-examination')
    ON CONFLICT (repair_id) DO NOTHING;
  END IF;
END $$;
