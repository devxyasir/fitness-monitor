const { Client } = require('pg');

const connStr = 'postgresql://postgres.hsaznkzcmalcejujjpvw:yasir123%2B123@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function testConnection() {
  console.log(`Connecting to: ${connStr}`);
  const client = new Client({
    connectionString: connStr,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('SUCCESS! Connected to Supabase!');
    const res = await client.query('SELECT NOW()');
    console.log('QueryResult:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('CONNECTION FAILED:', err);
  }
}

testConnection();
