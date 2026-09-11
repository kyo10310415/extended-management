DO $$
DECLARE
  cycle_number INTEGER;
BEGIN
  FOR cycle_number IN 1..10 LOOP
    EXECUTE format(
      'ALTER TABLE student_extensions
         ADD COLUMN IF NOT EXISTS revenue_extension_amount_%1$s INTEGER',
      cycle_number
    );

    -- 既存の延長処理はすべて22,000円で実行されていたため、再試行用に補完する。
    EXECUTE format(
      'UPDATE student_extensions
          SET revenue_extension_amount_%1$s = 22000
        WHERE revenue_extension_amount_%1$s IS NULL
          AND (COALESCE(revenue_extension_pending_%1$s, FALSE)
            OR COALESCE(revenue_extension_completed_%1$s, FALSE))',
      cycle_number
    );
  END LOOP;
END $$;
