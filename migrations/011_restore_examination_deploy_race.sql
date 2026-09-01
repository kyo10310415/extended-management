CREATE TABLE IF NOT EXISTS data_repair_history (
  repair_id VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2026-09-01 16:00 JSTのデプロイ切替中に、停止前の旧サーバーが
-- 再処理した2件だけを復元する。毎回全migrationを実行する構成のため、
-- repair_idで一度限りに制限し、誤処理時刻と売上終了月でも対象を限定する。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM data_repair_history
     WHERE repair_id = '2026-09-01-examination-deploy-race'
  ) THEN
    UPDATE student_extensions
       SET examination_result_1 = NULL,
           discord_notification_pending_1 = FALSE,
           discord_notification_sent_1 = FALSE,
           discord_notification_result_label_1 = NULL,
           discord_notification_sent_at_1 = NULL,
           executive_check_1 = NULL,
           revenue_extension_pending_1 = FALSE,
           revenue_extension_completed_1 = FALSE,
           revenue_extension_start_month_1 = NULL,
           revenue_extension_end_month_1 = NULL,
           revenue_extension_synced_at_1 = NULL,
           student_extension_notification_pending_1 = FALSE,
           student_extension_notification_sent_1 = FALSE,
           student_extension_notification_sent_at_1 = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE student_id = 'OLTS251265-MR'
       AND examination_result_1 = '延長'
       AND COALESCE(examination_result_manual_override_1, FALSE) = FALSE
       AND COALESCE(discord_notification_sent_1, FALSE) = TRUE
       AND discord_notification_sent_at_1 >= TIMESTAMP '2026-09-01 07:00:00'
       AND discord_notification_sent_at_1 < TIMESTAMP '2026-09-01 07:01:00'
       AND COALESCE(revenue_extension_completed_1, FALSE) = TRUE
       AND revenue_extension_end_month_1 = '2027-07';

    UPDATE student_extensions
       SET examination_result_4 = NULL,
           discord_notification_pending_4 = FALSE,
           discord_notification_sent_4 = FALSE,
           discord_notification_result_label_4 = NULL,
           discord_notification_sent_at_4 = NULL,
           executive_check_4 = NULL,
           revenue_extension_pending_4 = FALSE,
           revenue_extension_completed_4 = FALSE,
           revenue_extension_start_month_4 = NULL,
           revenue_extension_end_month_4 = NULL,
           revenue_extension_synced_at_4 = NULL,
           student_extension_notification_pending_4 = FALSE,
           student_extension_notification_sent_4 = FALSE,
           student_extension_notification_sent_at_4 = NULL,
           updated_at = CURRENT_TIMESTAMP
     WHERE student_id = 'OLPR240124-HO'
       AND examination_result_4 = '延長'
       AND COALESCE(examination_result_manual_override_4, FALSE) = FALSE
       AND COALESCE(discord_notification_sent_4, FALSE) = TRUE
       AND discord_notification_sent_at_4 >= TIMESTAMP '2026-09-01 07:00:00'
       AND discord_notification_sent_at_4 < TIMESTAMP '2026-09-01 07:01:00'
       AND COALESCE(revenue_extension_completed_4, FALSE) = TRUE
       AND revenue_extension_end_month_4 = '2027-03';

    INSERT INTO data_repair_history (repair_id)
    VALUES ('2026-09-01-examination-deploy-race')
    ON CONFLICT (repair_id) DO NOTHING;
  END IF;
END $$;
