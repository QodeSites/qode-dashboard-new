# ── Stage 1: build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files & install dependencies
COPY package.json package-lock.json ./
# If you use pnpm: COPY pnpm-lock.yaml .; RUN npm install -g pnpm; RUN pnpm install
RUN npm ci --legacy-peer-deps

# Copy Prisma schema (if used) and generate client
# If you don’t have prisma in production, remove these two lines.
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

# Make sure /app is owned by nextjs, and npm cache is owned by nextjs
RUN chown nextjs:nodejs /app && \
    mkdir -p /home/nextjs/.npm && \
    chown nextjs:nodejs /home/nextjs/.npm

# Copy only production-ready artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# If you rely on prisma at runtime, also copy prisma folder
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nextjs

# Expose Next.js default port (3000). You can override via env if needed.
ENV NODE_ENV=production
ENV PORT=3000
# Add SSH timeout configuration (e.g., 30 seconds)
ENV SSH_TIMEOUT=30
EXPOSE 3000

# Start Next.js
CMD ["npm", "start"]