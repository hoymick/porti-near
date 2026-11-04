import {initialState,recover,assertAccounting,DomainError} from './engine.mjs';
export async function readWorkspace(db,ownerId){
 if(!db)throw new DomainError('STORAGE_UNAVAILABLE','Workspace storage is not configured.',503);
 const now=Date.now();
 await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id, state, revision, updated_at) VALUES (?, ?, 0, ?)').bind(ownerId,JSON.stringify(initialState(now)),now).run();
 const row=await db.prepare('SELECT state, revision FROM workspaces WHERE owner_id = ?').bind(ownerId).first();
 if(!row)throw new Error('Workspace initialization failed');return{state:JSON.parse(row.state),revision:row.revision};
}
export async function mutateWorkspace(db,ownerId,change){
 for(let attempt=0;attempt<8;attempt++){
   const{state,revision}=await readWorkspace(db,ownerId);recover(state);const result=change(state);assertAccounting(state);
   const write=await db.prepare('UPDATE workspaces SET state = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(state),Date.now(),ownerId,revision).run();
   if(write.meta.changes===1)return{state,result};
 }
 throw new DomainError('WORKSPACE_BUSY','Another update is in progress. Please retry.',409);
}
