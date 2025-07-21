# syntax=docker/dockerfile:1.4

# ── Stage 1: build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files & install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev

# Copy Prisma schema and generate client (remove if unused)
COPY prisma ./prisma
RUN npx prisma generate

# Copy source & build
COPY . .
RUN npm run build

# ── Stage 2: run the built app ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install SSH client+server and configure server keep-alive
RUN apk add --no-cache openssh-client openssh-server \
 && sed -i \
      -e 's@^#ClientAliveInterval .*@ClientAliveInterval 60@' \
      -e 's@^#ClientAliveCountMax .*@ClientAliveCountMax 5@' \
      /etc/ssh/sshd_config \
 && mkdir -p /run/sshd

# Create non-root user
RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nextjs -G nodejs

# Prepare home and npm cache dirs
RUN mkdir -p /home/nextjs/.ssh /home/nextjs/.npm \
 && chown -R nextjs:nodejs /home/nextjs

# Copy production artifacts
COPY --from=builder --chown=nextjs:nodejs /app/.next   ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public . /public
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

# Reliable node_modules copy via BuildKit cache + retry
# (requires BuildKit; will cache node_modules for speed/reuse)
RUN --mount=type=cache,id=npm,target=/app/node_modules \
    max=5; i=0; \
    until cp -a /app/node_modules ./node_modules; do \
      i=$((i+1)); \
      if [ "$i" -ge "$max" ]; then echo "node_modules copy failed after $max attempts"; exit 1; fi; \
      echo "copy failed, retry $i/$max…"; sleep 2; \
    done

# Copy Prisma folder if needed at runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# SSH keep-alive in per-user config & startup script
COPY << 'EOF' /app/start.sh
#!/bin/sh
# create user ssh config if absent
if [ ! -f /home/nextjs/.ssh/config ]; then
  cat > /home/nextjs/.ssh/config << 'SSHEOF'
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 5
    TCPKeepAlive yes
SSHEOF
  chown nextjs:nodejs /home/nextjs/.ssh/config
  chmod 600 /home/nextjs/.ssh/config
fi

# background keep-alive pinger
(
  while true; do
    if pgrep ssh >/dev/null 2>&1; then
      ssh -O check -q >/dev/null 2>&1 || true
    fi
    sleep 30
  done
) &

# start SSH daemon (optional) and the app
sshd
exec npm start
EOF

RUN chmod +x /app/start.sh \
 && chown nextjs:nodejs /app/start.sh

# switch to non-root, set env, expose port
USER nextjs
ENV NODE_ENV=production \
    PORT=3030
EXPOSE 3030

CMD ["/app/start.sh"]
