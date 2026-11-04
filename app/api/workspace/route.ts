import { owner, mutate, publicState, sameOrigin, errorResponse } from '../../../lib/workspace';
import { SERVICES, createTask, updatePolicy, setAgent, funds, DomainError } from '../../../lib/engine.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const id = await owner(); const {state} = await mutate(id, () => null); return Response.json({state: publicState(state), services: SERVICES}, {headers:{'Cache-Control':'no-store'}}); } catch(e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const id = await owner();
    if (Number(request.headers.get('content-length') || 0) > 150000) throw new DomainError('INPUT_TOO_LARGE', 'Request is too large.', 413);
    const raw = await request.text(); if (raw.length > 150000) throw new DomainError('INPUT_TOO_LARGE', 'Request is too large.', 413);
    let input; try { input = JSON.parse(raw); } catch { throw new DomainError('INVALID_JSON', 'Request must be valid JSON.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_REQUEST', 'Request must be an object.');
    const {state, result} = await mutate(id, s => {
      if (input.action === 'create-task') return createTask(s, input);
      if (input.action === 'policy') return updatePolicy(s, input);
      if (input.action === 'agent') return setAgent(s, input.active);
      if (['deposit','withdraw'].includes(input.action)) return funds(s, input.action, input.amount);
      if (input.action === 'delete-task') {
        const task = s.tasks.find((t: any) => t.id === input.taskId);
        if (!task) throw new DomainError('NOT_FOUND','Task not found.',404);
        if (s.jobs.some((j: any) => j.taskId === task.id && j.status === 'reserved')) throw new DomainError('ACTIVE_JOB','Wait for the current reservation to finish or expire.',409);
        task.documents = null; task.output = null; task.status = 'archived'; return null;
      }
      throw new DomainError('INVALID_ACTION','Unknown workspace action.');
    });
    return Response.json({state:publicState(state), result: result && typeof result === 'object' && 'id' in result ? {id:result.id} : null});
  } catch(e) { return errorResponse(e); }
}
