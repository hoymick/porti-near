import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const databaseId = process.env.PORTI_D1_DATABASE_ID;
if (!databaseId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(databaseId) || databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Create the porti-near D1 database, then set PORTI_D1_DATABASE_ID in Cloudflare build variables.');
}
const bucket = process.env.PORTI_R2_BUCKET;
if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid optional R2 bucket name.');
writeFileSync('wrangler.cloudflare.generated.json',JSON.stringify({
  name:'porti-near', main:'./worker/index.ts', compatibility_date:'2026-11-01',
  compatibility_flags:['nodejs_compat'], workers_dev:true, preview_urls:false,
  vars:{PORTI_HOST_MODE:'cloudflare'},
  d1_databases:[{binding:'DB',database_name:'porti-near',database_id:databaseId,migrations_dir:'./drizzle'}],
  ...(bucket?{r2_buckets:[{binding:'BUCKET',bucket_name:bucket}]}:{}),
},null,2)+'\n');
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.cloudflare.config.ts'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
