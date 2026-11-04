import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,unlockVault,validateVault,signOwnership,base58Encode,decode64} from '../lib/local-wallet-crypto.mjs';
import {verifyNearMessage,base58Decode} from '../lib/near-identity.mjs';
import {localAccountState,localWalletAdapter,buildLocalSigned,reviewedLocalActions} from '../lib/local-wallet-signing.mjs';
import {SignedTransaction} from 'near-api-js';
const password='test-only-long-unique-password';
const vault=await createVault(password),key=await unlockVault(vault,password);
const input={network:'mainnet',signerId:vault.account,receiverId:'receiver.near',actions:[{type:'Transfer',params:{deposit:'1000000000000000000000'}}]};
const state={active:true,nonce:123456,blockHash:base58Encode(new Uint8Array(32).fill(7))};
test('free wallet backup restores the exact implicit address and rejects wrong password and tampering',async()=>{
 assert.equal(vault.account.length,64);assert.equal(key.extractable,false);assert.deepEqual(Object.keys(vault).sort(),['format','version','network','iterations','createdAt','account','publicKey','salt','iv','ciphertext'].sort());
 assert.equal(validateVault(JSON.parse(JSON.stringify(vault))).account,vault.account);
 assert.equal((await unlockVault(JSON.parse(JSON.stringify(vault)),password)).type,'private');
 await assert.rejects(unlockVault(vault,'incorrect-long-password'));
 await assert.rejects(unlockVault({...vault,createdAt:vault.createdAt+1},password));
 assert.throws(()=>validateVault({...vault,iterations:1}));assert.throws(()=>validateVault({...vault,account:'0'.repeat(64)}));
});
test('local ownership signatures pass the existing server NEP-413 verifier',async()=>{
 const nonce=crypto.getRandomValues(new Uint8Array(32)),message='Porti wallet ownership',recipient='porti.example';const proof=await signOwnership(vault,key,{...input,nonce,message,recipient});
 assert.equal(await verifyNearMessage({account:vault.account,message,recipient,nonce:btoa(String.fromCharCode(...nonce))},proof),true);
 assert.equal(await verifyNearMessage({account:vault.account,message:'changed',recipient,nonce:btoa(String.fromCharCode(...nonce))},proof),false);
});
test('serialized mainnet transaction carries exact receiver, amount, nonce and a valid Ed25519 signature',async()=>{
 const signed=await buildLocalSigned(vault,key,input,state),decoded=SignedTransaction.decode(decode64(signed.encoded));
 assert.equal(decoded.transaction.receiverId,'receiver.near');assert.equal(decoded.transaction.signerId,vault.account);assert.equal(decoded.transaction.nonce,123457n);assert.equal(decoded.transaction.actions[0].transfer.deposit,1000000000000000000000n);
 const digest=await crypto.subtle.digest('SHA-256',decoded.transaction.encode()),pub=await crypto.subtle.importKey('raw',base58Decode(vault.publicKey.slice(8)),'Ed25519',false,['verify']);assert.equal(base58Encode(new Uint8Array(digest)),signed.hash);assert.equal(await crypto.subtle.verify('Ed25519',pub,new Uint8Array(decoded.signature.ed25519Signature.data),digest),true);
 assert.throws(()=>reviewedLocalActions({...input,network:'testnet'},vault));assert.throws(()=>reviewedLocalActions({...input,actions:[{type:'DeleteKey',params:{deposit:'0'}}]},vault));
});
test('activation requires mainnet and the correct full-access key; revoked keys do not become funding prompts',async()=>{
 const rpc=async(method)=>method==='status'?{chain_id:'mainnet'}:{permission:'FullAccess',nonce:state.nonce,block_hash:state.blockHash};assert.equal((await localAccountState(vault,rpc)).active,true);
 const error=name=>Object.assign(Error(),{rpcName:name});assert.equal((await localAccountState(vault,async m=>{if(m==='status')return {chain_id:'mainnet'};throw error('UNKNOWN_ACCOUNT')})).active,false);
 await assert.rejects(localAccountState(vault,async m=>{if(m==='status')return {chain_id:'mainnet'};throw error('UNKNOWN_ACCESS_KEY')}));await assert.rejects(localAccountState(vault,async()=>({chain_id:'testnet'})));
});
test('cancellation does not sign/send; uncertain broadcast retains original hash and blocks a second send',async()=>{
 let pending=null,sends=0,approved=0;const journal={read:async()=>pending,write:async p=>{pending=p}},rpc=async m=>{if(m==='status')return {chain_id:'mainnet'};if(m==='query')return {permission:'FullAccess',nonce:state.nonce,block_hash:state.blockHash};sends++;assert.ok(pending?.hash);throw Error('lost response')};
 const wallet=localWalletAdapter(vault,()=>key,async()=>{approved++},journal,rpc,work=>work());const r=await wallet.signAndSendTransaction(input);assert.equal(r.transaction.hash,pending.hash);assert.equal(sends,1);await assert.rejects(wallet.signAndSendTransaction(input));assert.equal(sends,1);assert.equal(approved,2);
 const cancelled=localWalletAdapter(vault,()=>key,async()=>{throw Error('cancelled')},journal,rpc,work=>work());await assert.rejects(cancelled.signAndSendTransaction(input));assert.equal(sends,1);
 const broken=localWalletAdapter(vault,()=>key,async()=>{}, {read:async()=>null,write:async()=>{throw Error('disk full')}},rpc,work=>work());await assert.rejects(broken.signAndSendTransaction(input));assert.equal(sends,1);
});
test('locking during approval prevents signing, and approval cannot change the frozen transaction',async()=>{
 let locked=false,calls=0;const wallet=localWalletAdapter(vault,()=>{if(locked)throw Error('locked');return key},async()=>{locked=true},{read:async()=>null,write:async()=>{}},async()=>{calls++;},work=>work());await assert.rejects(wallet.signAndSendTransaction(input));assert.equal(calls,0);
 let saved;const request=structuredClone(input);const w=localWalletAdapter(vault,()=>key,async()=>{request.receiverId='different.near'}, {read:async()=>null,write:async p=>{saved=p}},async(m,p)=>{if(m==='status')return {chain_id:'mainnet'};if(m==='query')return {permission:'FullAccess',nonce:state.nonce,block_hash:state.blockHash};const tx=SignedTransaction.decode(decode64(p.signed_tx_base64));assert.equal(tx.transaction.receiverId,'receiver.near');return {transaction:{hash:saved.hash}}},work=>work());await w.signAndSendTransaction(request);
});
