import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { DomainError } from './errors.mjs';
import { readWorkspace as readStore, mutateWorkspace } from './store.mjs';

export async function owner() {
  const user = await getChatGPTUser();
  if (!user) throw new DomainError('SIGN_IN_REQUIRED', 'Sign in to open your private workspace.', 401);
  return user.userId;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new DomainError('ORIGIN_REJECTED', 'Cross-origin write rejected.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new DomainError('ORIGIN_REJECTED', 'Cross-site write rejected.', 403);
}
export async function readWorkspace(ownerId: string) {
  return readStore(env.DB, ownerId);
}
export async function mutate<T>(ownerId: string, change: (state: any) => T): Promise<{state: any, result: T}> {
  return mutateWorkspace(env.DB, ownerId, change);
}
export function errorResponse(e: any) {
  if (!(e instanceof DomainError)) console.error('Workspace request failed', e?.message);
  return Response.json({ error: { code: e instanceof DomainError ? e.code : 'INTERNAL_ERROR', message: e instanceof DomainError ? e.message : 'The request could not be completed. Please retry.' } }, {status: e instanceof DomainError ? e.status : 500, headers: {'Cache-Control':'no-store'}});
}
