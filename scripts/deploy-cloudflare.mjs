import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(readFileSync('wrangler.cloudflare.generated.json','utf8'));
if(config.name!=='porti-near'||config.vars?.PORTI_HOST_MODE!=='cloudflare'||!config.d1_databases?.[0]?.database_id)throw Error('Run npm run build:cloudflare before deployment.');
function wrangler(args){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
wrangler(['d1','migrations','apply','porti-near','--remote','--config','wrangler.cloudflare.generated.json']);
wrangler(['deploy','--config','dist/server/wrangler.json']);
