import { z } from "zod";

/** Manifests describe capabilities; only an owner-reviewed server adapter can execute them. */
export const appManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/),
  name: z.string().min(1).max(60),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1).max(240),
  category: z.enum(["Exchange", "Staking", "Research"]),
  network: z.literal("mainnet"),
  website: z.string().url().refine(u => new URL(u).protocol === "https:" && !new URL(u).username && !new URL(u).password),
  permissions: z.array(z.literal("chain:read")).length(1),
  actions: z.array(z.object({id: z.string().regex(/^[a-z][a-z0-9-]{2,39}$/), label: z.string().min(1).max(80), effect: z.literal("read")} ).strict()).min(1).max(8),
}).strict();
export type PortiAppManifest = z.infer<typeof appManifestSchema>;
export function definePortiApp(manifest: PortiAppManifest): PortiAppManifest {
  const parsed = appManifestSchema.parse(manifest);
  if (new Set(parsed.actions.map(a => a.id)).size !== parsed.actions.length) throw new Error("Duplicate action ID");
  return parsed;
}
/** Uses the current Porti session. Never pass wallet keys or AI credentials. */
export function createPortiAppsClient() {
  async function request(body?: unknown) {
    const response = await fetch("/api/porti/apps", {method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: body ? {"Content-Type":"application/json"} : undefined, body: body ? JSON.stringify(body) : undefined});
    const result: any = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Porti Apps request failed");
    return result;
  }
  return {list: () => request(), run: (appId: string, actionId: string, args: Record<string, unknown> = {}) => request({action:"run", appId, actionId, args}), pin: (appId: string, pinned: boolean) => request({action:"pin", appId, pinned})};
}
