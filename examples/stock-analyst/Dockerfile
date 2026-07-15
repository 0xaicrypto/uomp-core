FROM node:22-slim

WORKDIR /app

# Copy repo root files needed for workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/core/src/ packages/core/src/
COPY packages/core/tsconfig.json packages/core/
COPY packages/sdk/package.json packages/sdk/
COPY packages/sdk/src/ packages/sdk/src/
COPY packages/sdk/tsconfig.json packages/sdk/
COPY examples/stock-analyst/package.json examples/stock-analyst/

RUN corepack enable && pnpm install --frozen-lockfile

COPY examples/stock-analyst/ examples/stock-analyst/
COPY packages/core/src/ packages/core/src/
COPY packages/sdk/src/ packages/sdk/src/
COPY scripts/generate-gateway-certs.sh scripts/

RUN corepack enable && pnpm build 2>/dev/null; true

EXPOSE 3080

# Generate client cert on startup, print fingerprint
CMD ["sh", "-c", "bash scripts/generate-gateway-certs.sh 2>/dev/null; echo '=== Agent Fingerprint ==='; openssl x509 -in ~/.uomp/.gateway-certs/client.crt -noout -fingerprint -sha256 2>/dev/null || true; echo '========================'; node examples/stock-analyst/server.js"]
