import {DomainError} from './errors.mjs';
// Store only Porti state; unrelated data is never exposed or used by this product.
export async function readWorkspace(db,ownerId){
 if(!db)throw new DomainError('STORAGE_UNAVAILABLE','Workspace storage is not configured.',503);
 await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id, state, revision, updated_at) VALUES (?, ?, 0, ?)').bind(ownerId,JSON.stringify({porti:null}),Date.now()).run();
 const row=await db.prepare('SELECT state, revision FROM workspaces WHERE owner_id = ?').bind(ownerId).first();
 if(!row)throw new Error('Workspace initialization failed');const saved=JSON.parse(row.state);
 return{state:{porti:saved.porti??null},revision:row.revision};
}
export async function mutateWorkspace(db,ownerId,change){
 for(let attempt=0;attempt<8;attempt++){
  const{state,revision}=await readWorkspace(db,ownerId);const result=change(state);
  const write=await db.prepare('UPDATE workspaces SET state = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify({porti:state.porti??null}),Date.now(),ownerId,revision).run();
  if(write.meta.changes===1)return{state,result};
 }
 throw new DomainError('WORKSPACE_BUSY','Another update is in progress. Please retry.',409);
}
