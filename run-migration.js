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
    console.log('🔄 Running migration 004_create_notion_students_cache.sql...');
    
    const sql = readFileSync(
      path.join(__dirname, 'migrations', '004_create_notion_students_cache.sql'),
      'utf8'
    );
    
    await pool.query(sql);
    
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
