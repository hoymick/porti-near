import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,exportVaultPrivateKey,unlockVault,base58Encode} from '../lib/local-wallet-crypto.mjs';
import {base58Decode} from '../lib/near-identity.mjs';
test('password-confirmed export restores the exact Ed25519 identity without changing the backup',async()=>{
 const password='synthetic-test-password-only';const vault=await createVault(password),before=JSON.stringify(vault);
 const exported=await exportVaultPrivateKey(vault,password);
 assert.ok(exported.startsWith('ed25519:'));
 const secret=base58Decode(exported.slice(8));assert.equal(secret.length,64);
 assert.equal('ed25519:'+base58Encode(secret.subarray(32)),vault.publicKey);
 const prefix=Uint8Array.from([48,46,2,1,0,48,5,6,3,43,101,112,4,34,4,32]);
 const raw=new Uint8Array(48);raw.set(prefix);raw.set(secret.subarray(0,32),16);
 const key=await crypto.subtle.importKey('pkcs8',raw,'Ed25519',false,['sign']),pub=await crypto.subtle.importKey('raw',secret.subarray(32),'Ed25519',false,['verify']);
 const message=new TextEncoder().encode('synthetic export test');
 assert.ok(await crypto.subtle.verify('Ed25519',pub,await crypto.subtle.sign('Ed25519',key,message),message));
 assert.equal(JSON.stringify(vault),before);
 const unlocked=await unlockVault(vault,password);assert.equal(unlocked.extractable,false);
 await assert.rejects(crypto.subtle.exportKey('pkcs8',unlocked));
 secret.fill(0);raw.fill(0);
});
test('wrong passwords and changed identity cannot export a key',async()=>{
 const password='synthetic-test-password-only',vault=await createVault(password);
 await assert.rejects(exportVaultPrivateKey(vault,'different-test-password'),/Incorrect password/);
 const other=await createVault(password);
 await assert.rejects(exportVaultPrivateKey({...vault,account:other.account,publicKey:other.publicKey},password),/Incorrect password/);
});
