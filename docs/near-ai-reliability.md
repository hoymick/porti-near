# NEAR AI Cloud reliability

Text chat, image descriptions and key verification use `lib/near-ai.mjs` with the
same fixed NEAR AI Cloud endpoint and the workspace's existing model/key. There
is no fallback provider, model substitution or extra credential requirement.

Each inference has a 45-second attempt timeout, a 60-second total budget and at
most one retry. Transient network failures and HTTP 429/500/502/503/504 can retry.
`Retry-After` seconds or HTTP dates are respected; waits over three seconds are
returned as actionable errors rather than blocking chat. Ambiguous timeouts,
access/credit/model errors and invalid/empty successful responses never retry.
An inference retry may incur provider usage; the cap prevents retry storms.

Safe error codes distinguish access (`AI_ACCESS`), balance or budget
(`AI_CREDITS`), throttling (`AI_RATE_LIMIT`), capacity (`AI_BUSY`), model selection
(`AI_MODEL`), rejected requests (`AI_REQUEST`), network (`AI_NETWORK`), timeout
(`AI_TIMEOUT`) and unusable responses (`AI_RESPONSE`/`AI_EMPTY_RESPONSE`). Raw
provider text, headers, credentials and prompts are never included in errors or
logs. Existing API error logs contain only a request ID, code and HTTP status.
Historical generic errors do not prove which provider condition occurred.

Only HTTP inference is retried. Tools are executed once after a usable response;
wallet approvals and submission are never inside the retry boundary. If the
final explanation fails after real result cards were produced, those cards are
saved with a visible explanation failure, and replaying that request ID returns
the same saved reply without rerunning tools. Failures release the chat lock.

Verify with `node --test tests/near-ai.test.mjs`, then the repository's test,
TypeScript and production build checks. For a live smoke check, send a harmless
plain-text question through the signed-in mini chat. A successful smoke check
does not establish uninterrupted provider availability or prove image support.
