# UOMP Remote Authorization Gateway

Reference implementation of the UOMP Gateway that exposes a user's Memory Guard over the network using mTLS + Capability Tokens, with optional Cloudflare Tunnel for zero-config public access.

## Quick start — one command

```bash
uomp gateway start
```

This starts the Gateway with a Cloudflare Tunnel, auto-exposing a public URL:

```
═══ Public Gateway URL ═══
  https://xxx.trycloudflare.com
export UOMP_BASE_URL="https://xxx.trycloudflare.com"
```

No public IP or port forwarding required.

## How it works

```text
                    Cloudflare Tunnel               local HTTPS
┌──────────────┐   ┌──────────────────┐   ┌──────────────┐   ┌──────────────┐
│ Remote Agent │──►│ trycloudflare.com│──►│ UOMP Gateway │──►│ Memory Guard │
│ (DO / SaaS)  │   │ (auto-tunnel)    │   │   :9443      │   │   :9374      │
└──────────────┘   └──────────────────┘   └──────────────┘   └──────────────┘
```

The Gateway does **not** hold the Auth Service private key; it only imports the public key to verify tokens issued by the local Auth Service.

## CLI commands

```bash
uomp gateway start              # Gateway + Cloudflare Tunnel (recommended)
uomp gateway start --no-tunnel  # Gateway only, no tunnel
uomp gateway status             # Check if Gateway is running
```

## Manual mode (without CLI)

1. Start the local UOMP Auth + Guard server:

   ```bash
   pnpm --filter @uomp/server start
   ```

2. Generate Gateway mTLS certificates:

   ```bash
   ./scripts/generate-gateway-certs.sh
   ```

3. Start the Gateway with tunnel:

   ```bash
   UOMP_GATEWAY_TUNNEL=true node apps/gateway/dist/index.js
   ```

   Or without tunnel:

   ```bash
   node apps/gateway/dist/index.js
   ```

4. Create a remote-profile.json:

   ```json
   {
     "profile": "remote",
     "gateway": {
       "endpoint": "https://localhost:9443",
       "tls": { "mtls_required": false },
       "agent_allowlist": []
     }
   }
   ```

5. Issue a remote token and test:

   ```bash
   ./scripts/test-gateway-remote.sh
   ```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UOMP_GATEWAY_PORT` | `9443` | Gateway HTTPS port |
| `UOMP_GATEWAY_HOST` | `0.0.0.0` | Bind address |
| `UOMP_GATEWAY_TUNNEL` | `false` | Auto-start Cloudflare Tunnel |
| `UOMP_GUARD_URL` | `http://127.0.0.1:9374` | Local Guard URL |
| `UOMP_GATEWAY_CERT` | `~/.uomp/.gateway-certs/gateway.crt` | TLS cert path |
| `UOMP_GATEWAY_KEY` | `~/.uomp/.gateway-certs/gateway.key` | TLS key path |
| `UOMP_GATEWAY_CA` | `~/.uomp/.gateway-certs/ca.crt` | CA cert path |
| `UOMP_REMOTE_PROFILE` | `~/.uomp/remote-profile.json` | Profile path |
| `UOMP_GATEWAY_AUDIENCE` | auto / from profile | Expected token audience |

## Deployed Agent

A public Stock Analyst instance is running at:

```
https://uomp-stock-analyst-mvblm.ondigitalocean.app
```

Users start their Gateway with `uomp gateway start`, authorize, then paste their token into the DO Agent's web UI — or call the API directly.
