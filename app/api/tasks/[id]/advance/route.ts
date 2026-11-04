import { owner, mutate, publicState, sameOrigin, errorResponse } from '../../../../../lib/workspace';
import { reserveNext, runService, settle, cancel, DomainError } from '../../../../../lib/engine.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  try {
    sameOrigin(request); const ownerId = await owner(); const {id} = await context.params;
    const reserved = await mutate(ownerId, s => reserveNext(s, id));
    const {job, task, created} = reserved.result;
    if (!job || !created) return Response.json({state:publicState(reserved.state), pending:!!job});
    try {
      if (!task.documents) throw new DomainError('INPUT_EXPIRED','Task inputs have been deleted.');
      const output = runService(job.serviceId, task);
      const finished = await mutate(ownerId, s => settle(s, job.id, output));
      return Response.json({state:publicState(finished.state), pending:false});
    } catch (e) {
      const recovered = await mutate(ownerId, s => cancel(s, job.id, 'The service could not complete. Reserved credits were released.'));
      return Response.json({state:publicState(recovered.state), pending:false});
    }
  } catch(e) { return errorResponse(e); }
}
