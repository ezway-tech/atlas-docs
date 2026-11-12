FROM node:22-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ .
COPY app/src/library /core
COPY scripts /scripts
COPY guides /guides
COPY README.md AGENTS.md /
COPY CHANGELOG.md /
ENV ATLAS_CORE_PATH=/core/index.mjs ATLAS_DOCS_MIGRATE_YES=1
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    ATLAS_DOCS_INSTALL=docker \
    DATA_DIR=/data \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ATLAS_CORE_PATH=/app/core/index.mjs \
    ATLAS_DOCS_MIGRATE_YES=1 \
    ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /scripts/setup/bootstrap.mjs ./scripts/bootstrap.mjs
COPY --from=build /scripts/setup/seed-demo.mjs ./scripts/seed-demo.mjs
COPY --from=build /scripts/setup/docker-entrypoint.mjs ./scripts/docker-entrypoint.mjs
COPY --from=build /core ./core
COPY examples/little-cafe /examples/little-cafe
# IPC graceful stop: app drain hook preferred; fallback exit if hook never loaded.
RUN node -e "const fs=require('fs');const p='server.js';const s=fs.readFileSync(p,'utf8');if(!s.includes('atlas:shutdown'))fs.writeFileSync(p,\"if(process.send){process.on('disconnect',()=>process.exit(0));process.on('message',m=>{if(m==='atlas:shutdown')setTimeout(()=>process.exit(1),10000).unref?.();})}\\n\"+s);"
RUN mkdir -p /data /upgrade-backups /libraries /atlas-registry \
  && chown -R node:node /data /upgrade-backups /libraries /atlas-registry /app /examples/little-cafe
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","scripts/docker-entrypoint.mjs"]
