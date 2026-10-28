FROM node:22-alpine AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm install --no-audit --no-fund
COPY app/ .
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/bootstrap.mjs ./scripts/bootstrap.mjs
COPY examples/stockroom /opt/stockroom
RUN mkdir -p /data && chown -R node:node /data /app /opt/stockroom
USER node
EXPOSE 3000
CMD ["sh","-c","node scripts/bootstrap.mjs && node server.js"]
