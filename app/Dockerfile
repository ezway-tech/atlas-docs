FROM node:22-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm install --no-audit --no-fund
COPY app/ .
COPY app/src/library /core
COPY scripts /scripts
COPY guides /guides
COPY README.md AGENTS.md /
ENV ATLAS_CORE_PATH=/core/index.mjs ATLAS_DOCS_MIGRATE_YES=1
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data HOSTNAME=0.0.0.0 PORT=3000 ATLAS_CORE_PATH=/app/core/index.mjs ATLAS_DOCS_MIGRATE_YES=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /scripts/setup/bootstrap.mjs ./scripts/bootstrap.mjs
COPY --from=build /scripts/setup/seed-demo.mjs ./scripts/seed-demo.mjs
COPY --from=build /core ./core
COPY examples/little-cafe /examples/little-cafe
RUN mkdir -p /data && chown -R node:node /data /app /examples/little-cafe
USER node
EXPOSE 3000
CMD ["sh","-c","node scripts/bootstrap.mjs && node server.js"]
