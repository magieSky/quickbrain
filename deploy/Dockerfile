# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only what server + shared need
COPY shared/ ./shared/
COPY server/package.json ./server/package.json
COPY server/ ./server/

# Install server deps. --install-links forces npm to copy file: deps instead
# of symlinking, so they survive in the final image without source tree.
WORKDIR /app/server
RUN npm install --omit=dev --no-audit --no-fund --install-links

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/server/node_modules /app/server/node_modules
COPY --from=deps /app/shared /app/shared
COPY --from=deps /app/server /app/server

WORKDIR /app/server
ENV NODE_PATH=/app/server/node_modules
EXPOSE 7421
CMD ["node", "src/index.js"]
