# ── Stage 1: build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files & install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy Prisma schema (if used) and generate client
# Remove these lines if Prisma is not used
COPY prisma ./prisma
RUN npx prisma generate

# Copy everything else & build
COPY . .
RUN npm run build

# ── Stage 2: run the built app ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs
RUN chown nextjs:nodejs /app

# Copy production-ready artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# If Prisma is used at runtime, copy prisma folder and generate client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
RUN [ -d "./prisma" ] && npx prisma generate || true

# Install production dependencies
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json
RUN npm ci --legacy-peer-deps --production && npm cache clean --force

# Switch to non-root user
USER nextjs

# Expose Next.js default port
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Start Next.js
CMD ["npm", "start"]