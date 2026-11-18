# The authoritative game server. Build from the repository root (it needs the game's own src/js):
#   docker build -f server/Dockerfile -t bin-rocket-sky-server .
FROM node:22.23.4-bookworm-slim
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/js /app/src/js
COPY server/index.mjs server/delta.mjs ./
COPY server/sim ./sim
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]
