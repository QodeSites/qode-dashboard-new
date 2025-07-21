# ── Stage 1: install all deps & build (with devDependencies) ─────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install everything so we can generate Prisma client
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Generate Prisma client (and engine)
COPY prisma ./prisma
COPY .env ./.env
RUN npx prisma generate

# Build Next.js
COPY . .
RUN npm run build

# ── Stage 2: production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# 1) Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --production

# 2) Pull in the already-generated Prisma client + engine from builder
COPY --from=builder /app/node_modules/@prisma/client     ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma            ./node_modules/.prisma

# 3) Copy build output, Prisma schema (optional), and env
COPY --from=builder --chown=1001:1001 /app/.next       ./.next
COPY --from=builder --chown=1001:1001 /app/public      ./public
COPY --from=builder          /app/prisma               ./prisma
COPY --from=builder          /app/.env                 ./.env

# 4) Healthcheck tooling & non-root user
RUN apk add --no-cache curl \
 && addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nextjs \
 && chown -R nextjs:nodejs /app
USER nextjs

# 5) Runtime config
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl --fail http://localhost:3000 || exit 1

CMD ["npm", "start"]
