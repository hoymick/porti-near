import { env } from "cloudflare:workers";
import { username, verifyNearMessage } from "./near-identity.mjs";
import { nearAccountOK } from "./near-core.mjs";
import { initialPorti, nearRpc } from "./near-services";
import { mutate, readWorkspace } from "./workspace";
import { DomainError } from "./errors.mjs";
function db() {
  if (!env.DB)
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Profile storage is not configured.",
      503,
    );
  return env.DB;
}
export async function myProfile(ownerId: string) {
  return db()
    .prepare(
      "SELECT username, wallet, verified_at AS verifiedAt, version FROM profiles WHERE owner_id = ?",
    )
    .bind(ownerId)
    .first();
}
export async function resolveUsername(value: string) {
  let name;
  try {
    name = username(value);
  } catch (e: any) {
    throw new DomainError("INVALID_USERNAME", e.message);
  }
  const p: any = await db()
    .prepare(
      "SELECT username, wallet, verified_at AS verifiedAt, version FROM profiles WHERE username = ?",
    )
    .bind(name)
    .first();
  if (!p)
    throw new DomainError(
      "USERNAME_NOT_FOUND",
      `@${name} has no verified wallet on this platform. Ask for their NEAR address or invite them to link a profile.`,
      404,
    );
  return p;
}
export async function profileChallenge(
  ownerId: string,
  input: any,
  origin: string,
) {
  let name;
  try {
    name = username(input.username);
  } catch (e: any) {
    throw new DomainError("INVALID_USERNAME", e.message);
  }
  if (!nearAccountOK(input.account))
    throw new DomainError(
      "INVALID_ACCOUNT",
      "Connect a NEAR mainnet wallet first.",
    );
  const existing: any = await myProfile(ownerId);
  if (existing && existing.username !== name)
    throw new DomainError(
      "USERNAME_FIXED",
      "This release keeps your claimed username fixed. You can relink its wallet.",
    );
  const taken: any = await db()
    .prepare("SELECT owner_id FROM profiles WHERE username = ? OR wallet = ?")
    .bind(name, input.account)
    .first();
  if (taken && taken.owner_id !== ownerId)
    throw new DomainError(
      "PROFILE_TAKEN",
      "That username or wallet is already linked to a different profile.",
    );
  const nonce = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    ),
    expiresAt = Date.now() + 300000;
  const challenge = {
    id: crypto.randomUUID(),
    username: name,
    account: input.account,
    nonce,
    recipient: new URL(origin).host,
    expiresAt,
    message: `Link @${name} to ${input.account} on Porti.\nNetwork: NEAR mainnet\nWorkspace: ${ownerId}\nExpires: ${new Date(expiresAt).toISOString()}\nThis proves wallet control, does not send funds, and makes this username-to-wallet mapping visible to platform users.`,
  };
  await mutate(ownerId, (s) => {
    s.porti ??= initialPorti();
    s.porti.profileChallenge = challenge;
  });
  return challenge;
}
export async function verifyProfile(ownerId: string, proof: any) {
  const s = (await readWorkspace(ownerId)).state,
    c = s.porti?.profileChallenge;
  if (!c || c.expiresAt < Date.now())
    throw new DomainError(
      "PROFILE_CHALLENGE_EXPIRED",
      "Request a fresh wallet-link proof.",
    );
  if (!(await verifyNearMessage(c, proof)))
    throw new DomainError(
      "PROFILE_SIGNATURE",
      "The wallet ownership signature did not verify.",
    );
  const keys = await nearRpc(ownerId, "query", {
    request_type: "view_access_key_list",
    account_id: c.account,
    finality: "final",
  });
  if (
    !keys.keys?.some(
      (k: any) =>
        k.public_key === proof.publicKey &&
        k.access_key?.permission === "FullAccess",
    )
  )
    throw new DomainError(
      "PROFILE_KEY",
      "Linking requires a signature from a current full-access key for this wallet.",
    );
  const version = crypto.randomUUID();
  try {
    const writes = await db().batch([
      db()
        .prepare(
          `INSERT INTO profiles (username,owner_id,wallet,verified_at,version) SELECT ?,?,?,?,? FROM workspaces WHERE owner_id=? AND json_extract(state,'$.porti.profileChallenge.id')=? AND json_extract(state,'$.porti.profileChallenge.expiresAt')>? ON CONFLICT(owner_id) DO UPDATE SET wallet=excluded.wallet,verified_at=excluded.verified_at,version=excluded.version WHERE profiles.username=excluded.username`,
        )
        .bind(
          c.username,
          ownerId,
          c.account,
          Date.now(),
          version,
          ownerId,
          c.id,
          Date.now(),
        ),
      db()
        .prepare(
          `UPDATE workspaces SET state=json_remove(state,'$.porti.profileChallenge'),revision=revision+1,updated_at=? WHERE owner_id=? AND json_extract(state,'$.porti.profileChallenge.id')=? AND EXISTS(SELECT 1 FROM profiles WHERE owner_id=? AND version=?)`,
        )
        .bind(Date.now(), ownerId, c.id, ownerId, version),
    ]);
    if (writes[0].meta.changes !== 1 || writes[1].meta.changes !== 1)
      throw new DomainError(
        "PROFILE_CHALLENGE_USED",
        "Profile proof expired, was replaced or was already used.",
        409,
      );
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      "PROFILE_TAKEN",
      "That username or wallet is already linked. Refresh your profile.",
      409,
    );
  }
  return myProfile(ownerId);
}
export async function unlinkProfile(ownerId: string) {
  await db().batch([
    db().prepare("DELETE FROM profiles WHERE owner_id=?").bind(ownerId),
    db()
      .prepare(
        "UPDATE workspaces SET state=json_remove(state,'$.porti.profileChallenge'),revision=revision+1,updated_at=? WHERE owner_id=?",
      )
      .bind(Date.now(), ownerId),
  ]);
  return {
    message:
      "Username wallet link removed. Unsubmitted username transfers must be prepared again.",
  };
}
