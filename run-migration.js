import { readFileSync } from 'fs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  // DATABASE_URLが設定されていない場合はスキップ
  if (!process.env.DATABASE_URL) {
    console.log('⏩ Skipping migration: DATABASE_URL not set (development environment)');
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const migrationFiles = [
      '004_create_notion_students_cache.sql',
      '005_create_forced_withdrawals.sql',
      '006_add_forced_withdrawal_student_notification.sql',
      '007_add_examination_automation_columns.sql',
      '008_create_suspension_payment_sync.sql',
      '009_add_suspension_discord_notification.sql',
      '010_gate_new_examination_form_responses.sql',
      '011_restore_examination_deploy_race.sql',
    ];

    for (const migrationFile of migrationFiles) {
      console.log(`🔄 Running migration ${migrationFile}...`);
      const sql = readFileSync(
        path.join(__dirname, 'migrations', migrationFile),
        'utf8'
      );
      await pool.query(sql);
    }
    
    console.log('✅ Migration completed successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
