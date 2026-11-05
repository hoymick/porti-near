import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, SignJWT, createLocalJWKSet} from 'jose';
import {accessIdentity, identityRequest, standaloneRequest} from '../lib/cloudflare-access.mjs';
import {load} from './helpers/services.mjs';
const env={PORTI_HOST_MODE:'cloudflare',PORTI_ACCESS_TEAM_DOMAIN:'https://porti-test.cloudflareaccess.com',PORTI_ACCESS_AUD:'a'.repeat(64)};
const keys=await generateKeyPair('RS256'), jwk=await exportJWK(keys.publicKey);
const resolver=createLocalJWKSet({keys:[{...jwk,kid:'test-key',alg:'RS256'}]});
async function token(changes={}) {return new SignJWT({email:'owner@example.com',...changes}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('owner-sub').setIssuer(env.PORTI_ACCESS_TEAM_DOMAIN).setAudience(env.PORTI_ACCESS_AUD).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);}
const request=jwt=>new Request('https://porti.example/api/porti',{headers:{'Cf-Access-Jwt-Assertion':jwt,'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'attacker@example.com','oai-authenticated-user-full-name':'Forged'}});
test('standalone owner identity is taken from verified Access claims; forged hosting headers are removed',async()=>{
 const req=request(await token()), user=await accessIdentity(req,env,resolver);
 assert.deepEqual(user,{userId:'cf-access:owner-sub',email:'owner@example.com'});
 const safe=await standaloneRequest(req,env,resolver);
 assert.equal(safe.headers.get('oai-authenticated-user-id'),user.userId);
 assert.equal(safe.headers.get('oai-authenticated-user-full-name'),null);
 assert.equal(safe.headers.get('Cf-Access-Jwt-Assertion'),null);
});
test('Access rejects expired, wrong-audience, wrong-issuer and incorrectly signed tokens',async()=>{
 for(const claims of [{exp:1},{aud:'wrong'},{iss:'https://evil.example'}]){
  const jwt=await new SignJWT({sub:'owner-sub',email:'owner@example.com',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,iss:env.PORTI_ACCESS_TEAM_DOMAIN,aud:env.PORTI_ACCESS_AUD,...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(keys.privateKey);
  assert.equal((await standaloneRequest(request(jwt),env,resolver)).status,401);
 }
 const other=await generateKeyPair('RS256');
 const jwt=await new SignJWT({email:'owner@example.com'}).setSubject('owner-sub').setIssuer(env.PORTI_ACCESS_TEAM_DOMAIN).setAudience(env.PORTI_ACCESS_AUD).setIssuedAt().setExpirationTime('5m').setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(other.privateKey);
 assert.equal((await standaloneRequest(request(jwt),env,resolver)).status,401);
});
test('missing setup and forged identity alone cannot open the standalone app',async()=>{
 const req=new Request('https://porti.example/',{headers:{'oai-authenticated-user-id':'attacker'}});
 assert.equal((await standaloneRequest(req,{PORTI_HOST_MODE:'cloudflare'})).status,503);
 assert.equal((await standaloneRequest(req,env,resolver)).status,401);
 assert.equal((await standaloneRequest(req,{...env,PORTI_ACCESS_TEAM_DOMAIN:'https://attacker.example'})).status,503);
});
test('hosted Sites requests retain their existing identity path; standalone login routes do not redirect off-site',async()=>{
 const original=request('not-used');assert.equal(await standaloneRequest(original,{}),original);
 const jwt=await token();
 for(const path of ['/signin-with-chatgpt?return_to=https://evil.example','/signout-with-chatgpt']){
  const r=await standaloneRequest(new Request('https://porti.example'+path,{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env,resolver);
  assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).origin,'https://porti.example');
 }
});
test('maintenance is disabled at both gateway and route, without invoking the cross-workspace runner',async()=>{
 assert.equal((await standaloneRequest(new Request('https://porti.example/api/porti/telegram/run'),env)).status,403);
 let calls=0;
 const route=load('app/api/porti/telegram/run/route.ts',{env,runTelegram:async()=>{calls++},sameOrigin:()=>{},readJSON:async()=>({action:'run'}),errorResponse:()=>Response.json({error:true},{status:500})},['GET','POST']);
 assert.equal((await route.GET()).status,403);
 assert.equal((await route.POST(new Request('https://porti.example/api/porti/telegram/%72un',{method:'POST'}))).status,403);
 assert.equal(calls,0);
});
