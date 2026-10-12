const { neon } = require('@neondatabase/serverless');
// This won't work without the right connection string
async function test() {
  const sql = neon('postgresql://neondb_owner:npg_FHh8jWXTe2bx@ep-calm-truth-b2u9rplh-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require');
  const r = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'Error%' LIMIT 5`;
  console.log('Tables:', r);
}
test().catch(e => console.error('Error:', e.message));
