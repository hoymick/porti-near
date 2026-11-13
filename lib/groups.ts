import {env} from 'cloudflare:workers';
import {DomainError} from './errors.mjs';
import {username} from './near-identity.mjs';
import {socialProfile} from './friends';
import {imageFor} from './media';
const db=()=>{if(!env.DB)throw new DomainError('STORAGE_UNAVAILABLE','Chat storage is not configured.',503);return env.DB;};
const fail=(message:string):never=>{throw new DomainError('GROUP_ACTION',message,403);};
const groupID=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
// Repeated in final SQL reads/writes so revocation cannot race a preflight check.
const access=`EXISTS(SELECT 1 FROM chat_group_members access JOIN profiles self ON self.owner_id=access.member_id JOIN chat_groups ag ON ag.id=access.group_id JOIN profiles owner ON owner.owner_id=ag.owner_id WHERE access.group_id=? AND access.member_id=? AND access.status='active' AND EXISTS(SELECT 1 FROM chat_group_members owning WHERE owning.group_id=ag.id AND owning.member_id=ag.owner_id AND owning.status='active') AND NOT EXISTS(SELECT 1 FROM chat_group_members other JOIN friend_links f ON ((f.a=access.member_id AND f.b=other.member_id) OR (f.b=access.member_id AND f.a=other.member_id)) WHERE other.group_id=access.group_id AND other.status='active' AND f.status='blocked'))`;
async function member(id:string,group:string){
 if(!groupID(group))fail('Choose a group.');
 const row:any=await db().prepare(`SELECT g.*,m.status,m.after_seq FROM chat_groups g JOIN chat_group_members m ON m.group_id=g.id JOIN profiles p ON p.owner_id=m.member_id WHERE g.id=? AND m.member_id=? AND m.status IN ('active','invited')`).bind(group,id).first();
 if(!row)fail('This group is no longer available to you.');return row;
}
export async function groupAllowed(id:string,group:string){
 if(!groupID(group))fail('Choose a group.');
 const row:any=await db().prepare(`SELECT g.id,m.after_seq FROM chat_groups g JOIN chat_group_members m ON m.group_id=g.id WHERE g.id=? AND m.member_id=? AND ${access}`).bind(group,id,group,id).first();
 if(!row)fail('Group messages are unavailable. Membership changed or a blocked member is present. You can leave the group from its controls.');return row;
}
export async function groupImageAllowed(id:string,image:string,group:string){
 await groupAllowed(id,group);
 const row=await db().prepare(`SELECT msg.id FROM chat_group_messages msg JOIN chat_group_members m ON m.group_id=msg.group_id AND m.member_id=? WHERE msg.group_id=? AND msg.seq>m.after_seq AND msg.created_at>? AND json_valid(msg.body) AND json_extract(msg.body,'$.portiImage')=? AND ${access} LIMIT 1`).bind(id,group,Date.now()-90*86400000,image,group,id).first();
 if(!row)fail('This picture is outside your group history.');
}
export async function groupsState(id:string,group?:string){
 await socialProfile(id);
 const list=await db().prepare(`SELECT g.id,g.title,g.owner_id=? AS isOwner,m.status,g.updated_at AS updatedAt,p.username AS ownerUsername,(SELECT COUNT(*) FROM chat_group_members n WHERE n.group_id=g.id AND n.status='active') AS memberCount FROM chat_groups g JOIN chat_group_members m ON m.group_id=g.id JOIN profiles p ON p.owner_id=g.owner_id WHERE m.member_id=? AND m.status IN ('active','invited') ORDER BY g.updated_at DESC LIMIT 50`).bind(id,id).all();
 if(!group)return {groups:list.results,group:null,members:[],messages:[]};
 const g=await member(id,group);
 if(g.status!=='active')return {groups:list.results,group:null,members:[],messages:[]};
 const members=await db().prepare(`SELECT m.member_id AS memberId,p.username,m.status,m.member_id=? AS isOwner FROM chat_group_members m LEFT JOIN profiles p ON p.owner_id=m.member_id WHERE m.group_id=? AND m.status IN ('active','invited') ORDER BY m.member_id=? DESC,m.updated_at`).bind(g.owner_id,group,g.owner_id).all();
 let messages:any[]=[],notice='';
 try{
  await groupAllowed(id,group);
  const rows=await db().prepare(`SELECT msg.id,msg.body,msg.created_at AS createdAt,msg.sender=? AS mine,p.username FROM chat_group_messages msg JOIN profiles p ON p.owner_id=msg.sender JOIN chat_group_members m ON m.group_id=msg.group_id AND m.member_id=? WHERE msg.group_id=? AND msg.seq>m.after_seq AND msg.created_at>? AND ${access} ORDER BY msg.seq DESC LIMIT 50`).bind(id,id,group,Date.now()-90*86400000,group,id).all();messages=rows.results.reverse();
 }catch(error){if(!(error instanceof DomainError))throw error;notice=error.message;}
 return {groups:list.results,group:{id:group,title:g.title,isOwner:g.owner_id===id},members:members.results,messages,notice};
}
export async function groupAction(id:string,input:any){
 await socialProfile(id);const now=Date.now(),group=String(input.group||'');
 if(input.action==='create'){
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!groupID(group)||title.length<2||title.length>60)fail('Use a group name of 2–60 characters.');
  const result=await db().batch([
   db().prepare(`INSERT OR IGNORE INTO chat_groups(id,owner_id,title,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE owner_id=?) AND (SELECT COUNT(*) FROM chat_groups WHERE owner_id=?)<10`).bind(group,id,title,now,now,id,id),
   db().prepare(`INSERT OR IGNORE INTO chat_group_members(group_id,member_id,status,after_seq,updated_at) SELECT ?,?,'active',0,? WHERE EXISTS(SELECT 1 FROM chat_groups WHERE id=? AND owner_id=? AND title=?)`).bind(group,id,now,group,id,title)
  ]);
  const saved:any=await db().prepare('SELECT owner_id,title FROM chat_groups WHERE id=?').bind(group).first();
  if(!saved||saved.owner_id!==id||saved.title!==title)fail('Group could not be created. You can own up to 10 groups.');
  return {group,message:result[0].meta.changes?'Group created. Invite accepted friends to join.':'Group already created.'};
 }
 const g=await member(id,group);
 if(input.action==='accept'){
  // Invite acceptance starts after the current message sequence, never before it.
  const r=await db().prepare(`UPDATE chat_group_members SET status='active',after_seq=COALESCE((SELECT MAX(seq) FROM chat_group_messages WHERE group_id=?),0),updated_at=? WHERE group_id=? AND member_id=? AND status='invited' AND EXISTS(SELECT 1 FROM profiles WHERE owner_id=?) AND EXISTS(SELECT 1 FROM friend_links WHERE status='accepted' AND ((a=? AND b=?) OR (b=? AND a=?))) AND NOT EXISTS(SELECT 1 FROM chat_group_members other JOIN friend_links f ON ((f.a=? AND f.b=other.member_id) OR (f.b=? AND f.a=other.member_id)) WHERE other.group_id=? AND other.status='active' AND f.status='blocked')`).bind(group,now,group,id,g.owner_id,id,g.owner_id,id,g.owner_id,id,id,group).run();
  if(!r.meta.changes)fail('This invitation changed or a blocked relationship prevents joining.');return {message:'You joined the group.'};
 }
 if(input.action==='leave'||input.action==='decline'){
  if(g.owner_id===id)fail('The group owner can close the group instead of leaving.');
  const r=await db().prepare(`UPDATE chat_group_members SET status='left',updated_at=? WHERE group_id=? AND member_id=? AND status=?`).bind(now,group,id,input.action==='decline'?'invited':'active').run();
  if(!r.meta.changes)fail('Membership changed. Refresh the group.');return {message:input.action==='decline'?'Invitation declined.':'You left the group.'};
 }
 if(input.action==='send'){
  await groupAllowed(id,group);
  let body=input.text;
  if(input.imageId){if(typeof body!=='string'||body.length>1000)fail('Photo captions can contain up to 1,000 characters.');await imageFor(id,input.imageId,'group',group);body=JSON.stringify({portiImage:input.imageId,caption:body});}
  if(typeof body!=='string'||!body.trim()||body.length>2000||typeof input.id!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(input.id))fail('Use a message of 1–2,000 characters.');body=body.trim();
  const r=await db().prepare(`INSERT OR IGNORE INTO chat_group_messages(id,group_id,sender,body,created_at) SELECT ?,?,?,?,? WHERE ${access} AND NOT EXISTS(SELECT 1 FROM chat_group_messages WHERE sender=? AND created_at>?)`).bind(input.id,group,id,body,now,group,id,id,now-2000).run();
  if(!r.meta.changes){const prior:any=await db().prepare('SELECT body FROM chat_group_messages WHERE id=? AND group_id=? AND sender=?').bind(input.id,group,id).first();if(!prior||prior.body!==body)fail('Wait two seconds before sending, or use a new message ID for changed content.');}
  return {message:'Message sent.'};
 }
 if(g.owner_id!==id||g.status!=='active')fail('Only the group owner can manage this group.');
 if(input.action==='invite'){
  let name;try{name=username(input.username);}catch{fail('Enter an exact Porti username.');}
  const other:any=await db().prepare('SELECT owner_id FROM profiles WHERE username=?').bind(name).first();if(!other||other.owner_id===id)fail('Choose an accepted friend.');
  const target=other.owner_id;
  const r=await db().prepare(`INSERT INTO chat_group_members(group_id,member_id,status,after_seq,updated_at) SELECT ?,?,'invited',0,? WHERE EXISTS(SELECT 1 FROM chat_groups WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM chat_group_members owning WHERE owning.group_id=chat_groups.id AND owning.member_id=chat_groups.owner_id AND owning.status='active')) AND EXISTS(SELECT 1 FROM friend_links WHERE status='accepted' AND ((a=? AND b=?) OR (b=? AND a=?))) AND (SELECT COUNT(*) FROM chat_group_members WHERE group_id=? AND status IN ('active','invited'))<20 AND NOT EXISTS(SELECT 1 FROM chat_group_members other JOIN friend_links f ON ((f.a=? AND f.b=other.member_id) OR (f.b=? AND f.a=other.member_id)) WHERE other.group_id=? AND other.status IN ('active','invited') AND f.status='blocked') ON CONFLICT(group_id,member_id) DO UPDATE SET status='invited',updated_at=excluded.updated_at WHERE chat_group_members.status IN ('left','removed')`).bind(group,target,now,group,id,id,target,id,target,group,target,target,group).run();
  if(!r.meta.changes)fail('Invite an accepted friend who is not already a member or blocked. Groups allow up to 20 members including invitations.');return {message:'Group invitation sent.'};
 }
 if(input.action==='remove'){
  const r=await db().prepare(`UPDATE chat_group_members SET status='removed',updated_at=? WHERE group_id=? AND member_id=? AND member_id<>? AND status IN ('active','invited') AND EXISTS(SELECT 1 FROM chat_groups WHERE id=? AND owner_id=?)`).bind(now,group,String(input.memberId||''),id,group,id).run();if(!r.meta.changes)fail('Member changed. Refresh the group.');return {message:'Member removed. Their group access has ended.'};
 }
 if(input.action==='rename'){
  const title=typeof input.title==='string'?input.title.trim():'';if(title.length<2||title.length>60)fail('Use a name of 2–60 characters.');
  await db().prepare('UPDATE chat_groups SET title=?,updated_at=? WHERE id=? AND owner_id=?').bind(title,now,group,id).run();return {message:'Group renamed.'};
 }
 if(input.action==='close'){
  // Keep stored history but revoke every membership, including outstanding invitations.
  await db().prepare(`UPDATE chat_group_members SET status='removed',updated_at=? WHERE group_id=? AND EXISTS(SELECT 1 FROM chat_groups WHERE id=? AND owner_id=?)`).bind(now,group,group,id).run();return {message:'Group closed. All member access has ended.'};
 }
 fail('Unknown group action.');
}
