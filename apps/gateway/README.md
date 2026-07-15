# UOMP Remote Authorization Gateway

A reference implementation of a UOMP Gateway that exposes a user’s Memory Guard over the network using mTLS + Capability Tokens.

## Responsibilities

- Terminate mutually-authenticated TLS from remote Agents.
- Verify the Capability Token (`profile: "remote"`, audience matches Gateway endpoint).
- Enforce optional `allowedEndpoints` restrictions.
- Forward memory and audit requests to the local Memory Guard.
- Provide a temporary payload upload/download cache (Phase 2).

## Quick start

1. Start the local UOMP Auth + Guard server:

   ```bash
   pnpm --filter @uomp/server start
   # or via systemd-run as in the main README
   ```

2. Generate Gateway mTLS certificates:

   ```bash
   ./scripts/generate-gateway-certs.sh
   ```

   This writes CA, Gateway and client certificates to `~/.uomp/.gateway-certs`.

3. Create a `remote-profile.json` in `~/.uomp` with the client certificate fingerprint in the allowlist:

   ```json
   {
     "profile": "remote",
     "gateway": {
       "endpoint": "https://localhost:9443",
       "tls": { "mtls_required": true },
       "agent_allowlist": [
         "AA:BB:CC:..."
       ]
     }
   }
   ```

   The script prints the client fingerprint after generation.

4. Start the Gateway:

   ```bash
   node apps/gateway/dist/index.js
   ```

   Environment variables:

   - `UOMP_GATEWAY_PORT` — default `9443`
   - `UOMP_GATEWAY_HOST` — default `0.0.0.0`
   - `UOMP_GUARD_URL` — local Guard URL, default `http://127.0.0.1:9374`
   - `UOMP_GATEWAY_CERT`, `UOMP_GATEWAY_KEY`, `UOMP_GATEWAY_CA` — paths to cert files
   - `UOMP_REMOTE_PROFILE` — path to remote profile JSON
   - `UOMP_GATEWAY_AUDIENCE` — override the expected token audience

5. Issue a remote Capability Token and test:

   ```bash
   ./scripts/test-gateway-remote.sh
   ```

   This creates a session, grants a remote token, and fetches memory through the Gateway using mTLS.

## Architecture

```text
┌──────────────┐      mTLS + Bearer token      ┌──────────────┐      local HTTP      ┌──────────────┐
│ Remote Agent │  ───────────────────────────▶  │ UOMP Gateway │  ────────────────▶  │ Memory Guard │
└──────────────┘                                 └──────────────┘                     └──────────────┘
```

The Gateway does **not** hold the Auth Service private key; it only imports the public key to verify tokens issued by the local Auth Service.
