import test from 'node:test';
import assert from 'node:assert/strict';
import {load,database} from './helpers/services.mjs';
import {username} from '../lib/near-identity.mjs';
import {DomainError} from '../lib/errors.mjs';
import {imageInfo} from '../lib/image-core.mjs';
function social(){
 const {sql,adapter}=database();
 for(const id of ['alice','bob','carol','dave'])sql.prepare('INSERT INTO profiles VALUES(?,?,?,?,?)').run(id,id,id+'.near',Date.now(),'v');
 const f=load('lib/friends.ts',{env:{DB:adapter},DomainError,username},['friendAction','friendsState','socialProfile','friendAllowed']);
 const images=new Map();let g;
 const media=load('lib/media.ts',{env:{BUCKET:{get:async key=>images.get(key)}},DomainError,imageInfo,friendAllowed:f.friendAllowed,groupAllowed:(...a)=>g.groupAllowed(...a),groupImageAllowed:(...a)=>g.groupImageAllowed(...a)},['imageFor']);
 g=load('lib/groups.ts',{env:{DB:adapter},DomainError,username,socialProfile:f.socialProfile,imageFor:media.imageFor},['groupAction','groupsState','groupAllowed','groupImageAllowed']);
 async function friends(a,b){await f.friendAction(a,{action:'request',username:b});const pair=(await f.friendsState(b)).links.find(x=>x.username===a).pair;await f.friendAction(b,{action:'accept',pair});return pair;}
 async function create(){const group=crypto.randomUUID();await g.groupAction('alice',{action:'create',group,title:'Builders'});return group;}
 const act=(id,group,action,extra={})=>g.groupAction(id,{group,action,...extra});
 return {sql,...f,...g,...media,images,friends,create,act};
}
test('profile setup is explicit; requester-only cancellation and recipient-only decline are enforced',async()=>{
 const s=social();assert.equal((await s.friendsState('nobody')).profileRequired,true);
 await s.friendAction('alice',{action:'request',username:'bob'});const pair=(await s.friendsState('alice')).links[0].pair;
 await assert.rejects(s.friendAction('bob',{action:'cancel',pair}));await assert.rejects(s.friendAction('alice',{action:'decline',pair}));
 await s.friendAction('alice',{action:'cancel',pair});assert.equal((await s.friendsState('bob')).links[0].status,'removed');s.sql.close();
});
test('groups require accepted-friend invitations and explicit consent, with no prior-history disclosure',async()=>{
 const s=social(),group=await s.create();
 await assert.rejects(s.act('alice',group,'invite',{username:'bob'}));
 await s.act('alice',group,'send',{id:'before-join-message',text:'Earlier history'});
 await s.friends('alice','bob');await s.act('alice',group,'invite',{username:'bob'});
 assert.equal((await s.groupsState('bob')).groups[0].status,'invited');
 assert.equal((await s.groupsState('bob',group)).messages.length,0);
 await assert.rejects(s.act('bob',group,'send',{id:'no-consent-message',text:'No'}));
 await s.act('bob',group,'accept');assert.equal((await s.groupsState('bob',group)).messages.length,0);
 await s.act('bob',group,'send',{id:'after-join-message',text:'Hello'});
 assert.equal((await s.groupsState('alice',group)).messages.length,2);assert.equal((await s.groupsState('bob',group)).messages[0].body,'Hello');
 await assert.rejects(s.groupsState('carol',group));s.sql.close();
});
test('members cannot manage groups; removal, leaving and closing immediately revoke history and writes',async()=>{
 const s=social(),group=await s.create();await s.friends('alice','bob');await s.act('alice',group,'invite',{username:'bob'});await s.act('bob',group,'accept');
 for(const action of ['rename','invite','remove','close'])await assert.rejects(s.act('bob',group,action,{title:'Hijack',username:'carol',memberId:'alice'}));
 await s.act('alice',group,'remove',{memberId:'bob'});await assert.rejects(s.groupsState('bob',group));
 await s.act('alice',group,'invite',{username:'bob'});await s.act('bob',group,'accept');await s.act('bob',group,'leave');await assert.rejects(s.groupAllowed('bob',group));
 await s.act('alice',group,'close');await assert.rejects(s.groupAllowed('alice',group));assert.equal((await s.groupsState('alice')).groups.length,0);s.sql.close();
});
test('block and profile unlink revoke group messages without allowing a backdoor invite',async()=>{
 const s=social(),group=await s.create(),pair=await s.friends('alice','bob');await s.act('alice',group,'invite',{username:'bob'});await s.act('bob',group,'accept');
 await s.friendAction('bob',{action:'block',pair});await assert.rejects(s.groupAllowed('alice',group));await assert.rejects(s.groupAllowed('bob',group));
 assert.match((await s.groupsState('bob',group)).notice,/blocked/);await s.act('bob',group,'leave');await s.groupAllowed('alice',group);
 await assert.rejects(s.act('alice',group,'invite',{username:'bob'}));s.sql.prepare("DELETE FROM profiles WHERE owner_id='alice'").run();await assert.rejects(s.groupsState('alice',group));s.sql.close();
});
test('group message retries are idempotent, reject changed content, and remain bound to sender/group',async()=>{
 const s=social(),group=await s.create(),input={id:'idempotent-message',text:'Hi <script>text only</script>'};
 await s.act('alice',group,'send',input);await s.act('alice',group,'send',input);assert.equal((await s.groupsState('alice',group)).messages.length,1);
 await assert.rejects(s.act('alice',group,'send',{...input,text:'Changed'}));const other=await s.create();await assert.rejects(s.act('alice',other,'send',input));
 await assert.rejects(s.act('alice',group,'send',{id:'burst-message-123',text:'Too soon'}));s.sql.close();
});
test('group photos are owner-bound for sending, visible only after joining, and revoked on removal',async()=>{
 const s=social(),group=await s.create(),image=crypto.randomUUID();
 s.images.set('porti/'+image,{customMetadata:{owner:'alice',scope:'group',pair:group,createdAt:String(Date.now())}});
 await s.act('alice',group,'send',{id:'photo-before-join',imageId:image,text:'Old photo'});
 await s.friends('alice','bob');await s.act('alice',group,'invite',{username:'bob'});await s.act('bob',group,'accept');
 await assert.rejects(s.imageFor('bob',image));
 s.sql.prepare('UPDATE chat_group_messages SET created_at=?').run(Date.now()-3000);
 await s.act('alice',group,'send',{id:'photo-after-join',imageId:image,text:'Shared now'});await s.imageFor('bob',image);
 await assert.rejects(s.imageFor('bob',image,'group',group));await assert.rejects(s.imageFor('carol',image));
 await s.act('alice',group,'remove',{memberId:'bob'});await assert.rejects(s.imageFor('bob',image));
 await s.act('alice',group,'invite',{username:'bob'});await s.act('bob',group,'accept');await assert.rejects(s.imageFor('bob',image));s.sql.close();
});
test('creation retries are idempotent and group ownership/member limits cannot be bypassed',async()=>{
 const s=social(),group=await s.create();await s.act('alice',group,'create',{title:'Builders'});
 assert.equal((await s.groupsState('alice')).groups.length,1);await assert.rejects(s.act('carol',group,'create',{title:'Take over'}));
 await s.friends('alice','bob');for(let n=0;n<19;n++)s.sql.prepare('INSERT INTO chat_group_members VALUES(?,?,?,?,?)').run(group,'existing-'+n,'invited',0,Date.now());
 await assert.rejects(s.act('alice',group,'invite',{username:'bob'}));
 for(let n=0;n<9;n++)await s.create();await assert.rejects(s.create());s.sql.close();
});
test('membership is rechecked inside the final message query after a preflight race',async()=>{
 const s=social(),group=await s.create();await s.act('alice',group,'send',{id:'visible-before-race',text:'Hello'});
 // A second reader changes membership between preliminary authorization and final SQL.
 const adapter={prepare(q){return {bind(...args){return {async first(){return s.sql.prepare(q).get(...args)||null;},async all(){if(q.includes('SELECT msg.id,msg.body'))s.sql.prepare("UPDATE chat_group_members SET status='removed' WHERE member_id='alice'").run();return {results:s.sql.prepare(q).all(...args)};}};}};}};
 const g=load('lib/groups.ts',{env:{DB:adapter},DomainError,username,socialProfile:s.socialProfile},['groupsState']);
 assert.equal((await g.groupsState('alice',group)).messages.length,0);s.sql.close();
});
