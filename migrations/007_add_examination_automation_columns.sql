DO $$
DECLARE
  cycle_number INTEGER;
BEGIN
  FOR cycle_number IN 1..10 LOOP
    EXECUTE format(
      'ALTER TABLE student_extensions
         ADD COLUMN IF NOT EXISTS executive_check_%1$s VARCHAR(20),
         ADD COLUMN IF NOT EXISTS revenue_extension_pending_%1$s BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS revenue_extension_completed_%1$s BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS revenue_extension_start_month_%1$s VARCHAR(7),
         ADD COLUMN IF NOT EXISTS revenue_extension_end_month_%1$s VARCHAR(7),
         ADD COLUMN IF NOT EXISTS revenue_extension_synced_at_%1$s TIMESTAMP,
         ADD COLUMN IF NOT EXISTS student_extension_notification_pending_%1$s BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS student_extension_notification_sent_%1$s BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS student_extension_notification_sent_at_%1$s TIMESTAMP',
      cycle_number
    );
  END LOOP;
END $$;
