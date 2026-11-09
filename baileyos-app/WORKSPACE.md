# Shared conversation prototype

This screen is for review. It is not a live Gemini or Grok connection, and opening the route does not make it private or online for members.

## Blocker

Map profiles do not grant steward. Signal Ark's browser role check is a different database and is not used here. This branch adds `steward_grants`, which the server reads only after Auth validates the access token. Members cannot write that table. The table is not on the hosted project yet. Until it is applied, a failed lookup keeps this workspace closed. The local fixture token is rejected when `NODE_ENV` is `production`, even if `BAILEYOS_SESSION_AUTH=fixture` is set. Activation, rollback, and the ordinary-login split are in `STEWARD.md`. Do not treat this route as live.

## Local review

From `baileyos-app`:

```
BAILEYOS_SESSION_AUTH=fixture npm run dev
```

Open `http://127.0.0.1:3000/workspace` on your own machine. Choose “Use local fixture steward”. That cookie is not a credential for the hosted site. Do not deploy this env var.

The banner must keep reading: Prototype — simulated responses; no live Gemini or Grok connection.

## What a steward can do

Add a labeled note. Ask for one Gemini or one Grok turn. That request does not call a provider. Grant runs one simulated reply using the shared history that was just approved. Reject drops the request. Approve this exact text stores that snapshot for export. Retrieve returns those same words. A changed reply cannot be exported under the old approval.

Models may dissent. A reply cannot grant a role.
