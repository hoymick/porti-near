import {createRemoteJWKSet, jwtVerify} from 'jose';

const resolvers = new Map();
function accessConfig(env) {
  const domain = typeof env.PORTI_ACCESS_TEAM_DOMAIN === 'string'
    ? env.PORTI_ACCESS_TEAM_DOMAIN.trim().replace(/\/(?:cdn-cgi\/access\/certs)?$/, '')
    : '';
  const audience = typeof env.PORTI_ACCESS_AUD === 'string' ? env.PORTI_ACCESS_AUD.trim() : '';
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(domain)) {
    throw new Error('PORTI_ACCESS_TEAM_DOMAIN is missing or invalid.');
  }
  if (!/^[a-f0-9]{64}$/.test(audience)) {
    throw new Error('PORTI_ACCESS_AUD is missing or invalid.');
  }
  return {issuer:domain, audience};
}
export async function accessIdentity(request, env, resolver) {
  const config = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new Error('Cloudflare Access login required.');
  if (!resolver) {
    resolver = resolvers.get(config.issuer);
    if (!resolver) {
      resolver = createRemoteJWKSet(new URL(config.issuer + '/cdn-cgi/access/certs'), {timeoutDuration:5000, cooldownDuration:30000});
      if (resolvers.size >= 4) resolvers.clear();
      resolvers.set(config.issuer, resolver);
    }
  }
  const {payload} = await jwtVerify(token, resolver, {
    issuer:config.issuer, audience:config.audience, algorithms:['RS256'],
    requiredClaims:['exp','iat','sub','email'], clockTolerance:5,
  });
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254 ||
      payload.iat > Math.floor(Date.now()/1000)+5) throw new Error('Invalid Access identity.');
  return {userId:'cf-access:'+payload.sub, email:payload.email};
}
export function identityRequest(request, identity) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('oai-') || name.startsWith('x-porti-')) headers.delete(name);
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.set('oai-authenticated-user-id', identity.userId);
  headers.set('oai-authenticated-user-email', identity.email);
  return new Request(request, {headers});
}
export async function standaloneRequest(request, env, resolver) {
  if (env.PORTI_HOST_MODE !== 'cloudflare') return request;
  // The hosted maintenance API runs across workspaces. Disable it here until an
  // independently authorized scheduler is implemented; browser login is not runner authorization.
  const path = new URL(request.url).pathname;
  if (path.replace(/\/+$/, '') === '/api/porti/telegram/run') {
    return Response.json({error:{code:'RUNNER_DISABLED',message:'Standalone background runner is not configured.'}}, {status:403});
  }
  try {
    accessConfig(env);
  } catch (error) {
    return new Response('Porti setup required: ' + error.message, {status:503,headers:{'Cache-Control':'no-store'}});
  }
  try {
    const identity = await accessIdentity(request, env, resolver);
    if (path === '/signin-with-chatgpt') return Response.redirect(new URL('/',request.url),303);
    if (path === '/signout-with-chatgpt') return Response.redirect(new URL('/cdn-cgi/access/logout',request.url),303);
    return identityRequest(request, identity);
  } catch {
    return new Response('Sign in through Cloudflare Access to open Porti.', {status:401,headers:{'Cache-Control':'no-store'}});
  }
}
