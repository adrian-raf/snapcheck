# Mock SNAP server, emulating one provider profile (MOCK_PROFILE).
# Build:  docker build -t snapcheck-mock .
# Run:    docker run --rm -p 4010:4010 -e MOCK_PROFILE=bri -v "$PWD/.keys:/app/.keys:ro" snapcheck-mock
# Create the keys on the host first (npm run keys:ensure): the suite signs with the
# private key, the mock verifies with the public key, so both must see the same pair.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only; no install scripts run.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MOCK_HOST=0.0.0.0 \
    MOCK_PORT=4010 \
    MOCK_PROFILE=default \
    LOG_LEVEL=info

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY profiles ./profiles

# Runs as the unprivileged "node" user; it may create .keys/ when no volume is mounted.
RUN chown node:node /app
USER node

EXPOSE 4010
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.MOCK_PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["node", "bin/snapcheck.mjs", "mock"]
