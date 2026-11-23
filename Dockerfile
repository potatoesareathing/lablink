# ---- Build stage: compile client (Vite) and server (tsc) ----
# Node 24 ships npm 11, matching the toolchain that generated package-lock.json.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# `npm install` honours the lockfile but also resolves platform-specific optional
# dependencies (native/wasm bindings) that a Windows-generated lockfile may omit.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime stage: production dependencies + compiled output only ----
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server/server/src/index.js"]
