import { mutate, readWorkspace } from "./workspace";
import { initialPorti, nearRpc } from "./near-services";
import { nearAccountOK } from "./near-core.mjs";
import { verifyNearMessage } from "./near-identity.mjs";
import { DomainError } from "./errors.mjs";
export async function walletRoles(id: string) {
  return (await readWorkspace(id)).state.porti?.walletRoles || {};
}
export async function walletAction(id: string, input: any, origin: string) {
  const role = input.role;
  if (!["main", "agent"].includes(role))
    throw new DomainError("INVALID_ROLE", "Choose main or agent wallet.");
  if (input.action === "wallet-unlink") {
    await mutate(id, (s) => {
      if (s.porti?.walletRoles) delete s.porti.walletRoles[role];
      if (s.porti) delete s.porti.walletChallenge;
    });
    return { message: "Wallet role unlinked." };
  }
  if (input.action === "wallet-challenge") {
    if (!nearAccountOK(input.account))
      throw new DomainError("INVALID_ACCOUNT", "Connect a NEAR wallet first.");
    const roles = await walletRoles(id);
    if (roles[role === "main" ? "agent" : "main"]?.account === input.account)
      throw new DomainError(
        "SAME_WALLET",
        "Use separate main and agent accounts.",
      );
    const expiresAt = Date.now() + 300000,
      c = {
        id: crypto.randomUUID(),
        role,
        account: input.account,
        nonceMode: input.proofMode === "wallet-nonce" ? "wallet-nonce" : "server-nonce",
        expiresAt,
        recipient: new URL(origin).host,
        nonce: btoa(
          String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
        ),
        message: `Link ${input.account} as my ${role} wallet in Porti.\nWorkspace: ${id}\nNetwork: NEAR mainnet\nExpires: ${new Date(expiresAt).toISOString()}\nOwnership proof only. No funds or spending permissions.`,
      };
    if(c.nonceMode === "wallet-nonce")c.message += `\nChallenge nonce: ${c.nonce}`;
    await mutate(id, (s) => {
      s.porti ??= initialPorti();
      s.porti.walletChallenge = c;
    });
    return { challenge: c };
  }
  const c = (await readWorkspace(id)).state.porti?.walletChallenge;
  if (
    !c ||
    c.role !== role ||
    c.expiresAt < Date.now() ||
    !(await verifyNearMessage(c, input.proof))
  )
    throw new DomainError(
      "INVALID_PROOF",
      "Request a new wallet proof and sign it with the selected account.",
    );
  const keys = await nearRpc(id, "query", {
    request_type: "view_access_key_list",
    account_id: c.account,
    finality: "final",
  });
  if (
    !keys.keys?.some(
      (k: any) =>
        k.public_key === input.proof.publicKey &&
        k.access_key?.permission === "FullAccess",
    )
  )
    throw new DomainError(
      "INVALID_KEY",
      "A current full-access key must sign this ownership proof.",
    );
  await mutate(id, (s) => {
    const p = s.porti;
    if (p.walletChallenge?.id !== c.id || c.expiresAt < Date.now())
      throw new DomainError(
        "PROOF_USED",
        "Wallet proof expired or already used.",
      );
    p.walletRoles ??= {};
    if (
      p.walletRoles[role === "main" ? "agent" : "main"]?.account === c.account
    )
      throw new DomainError("SAME_WALLET", "Choose a separate agent account.");
    p.walletRoles[role] = { account: c.account, verifiedAt: Date.now() };
    delete p.walletChallenge;
  });
  return {
    message: `${role === "main" ? "Main" : "Agent"} wallet verified. You control its keys.`,
  };
}
