const { Pool } = require('pg');

// Build a robust connection string with sane fallbacks so the app
// still works when DATABASE_URL is not explicitly provided.
const buildConnectionString = () => {
  const urlFromEnv = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  if (urlFromEnv) return urlFromEnv;

  const user = process.env.DB_USER || 'yuno';
  const password = process.env.DB_PASSWORD || 'yunopassword';
  const host = process.env.DB_HOST || 'postgres';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'yuno';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

const connectionString = buildConnectionString();

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 연결 테스트 함수
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('Database connected at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

// 쿼리 헬퍼 함수
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

// 트랜잭션 헬퍼
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};
