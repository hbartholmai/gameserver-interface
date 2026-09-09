# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Werkzeuge für die nativen Module (better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci

COPY . .
RUN npm run build

# Entwicklungsabhängigkeiten entfernen, das gebaute Ergebnis bleibt.
RUN npm prune --omit=dev

# --- Laufzeit ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    GSP_DATA_DIR=/data \
    GSP_WEB_ROOT=/app/packages/web/dist \
    GSP_PORT=8770

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/web/dist ./packages/web/dist

# Das Panel spricht den Docker-Socket an und liest die Bind-Mounts der
# Instanzen. Die Rechte dafür kommen über die Gruppenzuordnung im Compose-File.
VOLUME ["/data"]
EXPOSE 8770

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GSP_PORT||8770)+'/api/auth/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
