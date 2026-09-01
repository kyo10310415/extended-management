CREATE TABLE IF NOT EXISTS examination_form_sync_state (
  singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id = TRUE),
  last_processed_row INTEGER NOT NULL CHECK (last_processed_row >= 1),
  initialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2026-08-24以前のフォーム回答を新規回答として扱った7件だけを復元する。
-- 審査結果を含む自動更新状態を、処理前の空欄状態へ戻す。
-- 初回基準行が登録される前だけ実行し、将来の正常な延長処理には触れない。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM examination_form_sync_state
     WHERE singleton_id = TRUE
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
 WHERE (student_id, revenue_extension_end_month_1) IN (
   ('OLTS240689-QJ', '2027-06'),
   ('OLTS251265-MR', '2027-07')
 )
   AND COALESCE(examination_result_manual_override_1, FALSE) = FALSE
   AND COALESCE(revenue_extension_completed_1, FALSE) = TRUE
   AND discord_notification_sent_at_1 >= TIMESTAMP '2026-08-24 00:00:00';

UPDATE student_extensions
   SET examination_result_3 = NULL,
       discord_notification_pending_3 = FALSE,
       discord_notification_sent_3 = FALSE,
       discord_notification_result_label_3 = NULL,
       discord_notification_sent_at_3 = NULL,
       executive_check_3 = NULL,
       revenue_extension_pending_3 = FALSE,
       revenue_extension_completed_3 = FALSE,
       revenue_extension_start_month_3 = NULL,
       revenue_extension_end_month_3 = NULL,
       revenue_extension_synced_at_3 = NULL,
       student_extension_notification_pending_3 = FALSE,
       student_extension_notification_sent_3 = FALSE,
       student_extension_notification_sent_at_3 = NULL,
       updated_at = CURRENT_TIMESTAMP
 WHERE (student_id, revenue_extension_end_month_3) IN (
   ('OLTS240378-XV', '2027-03'),
   ('OLTS240466-SG', '2027-06'),
   ('OLTS240499-HK', '2027-04'),
   ('OLTS240513-XU', '2026-09')
 )
   AND COALESCE(examination_result_manual_override_3, FALSE) = FALSE
   AND COALESCE(revenue_extension_completed_3, FALSE) = TRUE
   AND discord_notification_sent_at_3 >= TIMESTAMP '2026-08-24 00:00:00';

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
   AND COALESCE(examination_result_manual_override_4, FALSE) = FALSE
   AND COALESCE(revenue_extension_completed_4, FALSE) = TRUE
   AND revenue_extension_end_month_4 = '2027-03'
   AND discord_notification_sent_at_4 >= TIMESTAMP '2026-08-24 00:00:00';
  END IF;
END $$;
