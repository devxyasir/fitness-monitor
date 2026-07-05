const { Client } = require('pg');
const regions = [
  'ap-southeast-1', // Singapore
  'us-east-1',      // N. Virginia
  'us-west-1',      // N. California
  'eu-central-1',   // Frankfurt
  'ap-south-1',     // Mumbai
  'eu-west-1',      // Ireland
  'sa-east-1',      // São Paulo
  'us-east-2',      // Ohio
  'us-west-2'       // Oregon
];
const username = 'postgres.hsaznkzcmalcejujjpvw';
const password = 'yasir123+123';

async function testRegions() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    console.log(`Testing ${region}...`);
    const client = new Client({
      host,
      port: 6543,
      user: username,
      password: password,
      database: 'postgres',
      ssl: {
        rejectUnauthorized: false
      }
    });
    try {
      await client.connect();
      console.log(`\n======================================================`);
      console.log(`SUCCESS! Connected to region: ${region}`);
      console.log(`Connection string matches IPv4 pooler.`);
      console.log(`Host: ${host}`);
      console.log(`======================================================\n`);
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`FAILED for ${region}: ${err.message}`);
    }
  }
  console.log('All regions failed.');
  process.exit(1);
}
testRegions();
