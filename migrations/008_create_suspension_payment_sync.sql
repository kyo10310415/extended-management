CREATE TABLE IF NOT EXISTS suspension_payment_sync_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  initialized BOOLEAN NOT NULL DEFAULT false,
  initialized_at TIMESTAMP,
  last_sync_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO suspension_payment_sync_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS suspension_payment_syncs (
  source_key VARCHAR(64) PRIMARY KEY,
  source_row_number INTEGER NOT NULL,
  submitted_at VARCHAR(50),
  student_id VARCHAR(50),
  suspension_start_date VARCHAR(20),
  suspension_end_date VARCHAR(20),
  start_year_month VARCHAR(7),
  end_year_month VARCHAR(7),
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('baseline', 'pending', 'completed', 'failed', 'invalid')),
  target_row_number INTEGER,
  target_range VARCHAR(100),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suspension_payment_syncs_status
  ON suspension_payment_syncs(sync_status, source_row_number);
