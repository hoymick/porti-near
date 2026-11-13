# Friends and private group chats

Open **Social & Alerts → Friends**. Claim a Porti username and verify your wallet in Profile first. Another person needs their own NEAR-wallet session and profile. If an operator additionally enables Cloudflare Access, that edge policy must also admit them. GitHub collaborator access grants no app identity or access.

## Direct conversations

Send a request to an exact @username. The recipient can accept or decline; the requester can cancel. Only accepted friends can send or read direct messages. Removing or blocking a friendship revokes direct-message and picture access. Unblocking does not restore a friendship. Removed requests have a 24-hour cooldown. A repeated send after a network timeout uses the same message ID and cannot create a duplicate with different text.

## Groups

Choose **Group chats**, enter a name, then create a group. The owner invites accepted friends by @username. Invitations require explicit acceptance. Groups allow 20 memberships, including pending invitations; an account can own 10 groups. Only the owner can invite, rename, remove members or close the group. Members can leave; invitees can decline. Closing retains stored records but revokes every membership and invitation.

New and rejoining members see only messages sent after they joined, using a stored message-sequence boundary. Removed members and nonmembers cannot read messages or private pictures. A blocked relationship with another active member prevents the affected user's group-message access until they leave or the owner removes the conflicting membership. Group controls remain available to resolve this.

The interface polls while visible every 10 seconds. It shows the latest 50 messages from the last 90 days. This is a visible-history window, not a promise that underlying records have been deleted. Messages and photographs are server-stored, not end-to-end encrypted. Picture sharing requires the existing private R2 `BUCKET` binding; missing storage produces a setup error. No paid storage is enabled by this update.

## Deployment and verification

The additive migration `0006_pretty_alex_wilder.sql` creates group, membership and message tables. Existing direct messages, profiles, wallets and earlier migrations are preserved. The Cloudflare deployment script applies pending D1 migrations before publishing. Never create group tables during a request or edit previously applied migrations.

Regression tests use isolated SQLite databases and synthetic accounts. They cover invitation consent, membership and message isolation, role-controlled request actions, idempotent sends, blocking, profile unlinking, leaving/removal, picture permissions and a membership-revocation race. These tests do not establish real two-user acceptance or any configured edge policy. Owner and friend must complete live sign-in, request acceptance, messaging and blocking checks separately.
