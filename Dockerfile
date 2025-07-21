# ── Stage 1: build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files & install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy Prisma schema (if used) and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy everything else & build
COPY . .
RUN npm run build


# ── Stage 2: run the built app ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# 1) Install SSH client
# 2) Create non-root user/group
RUN apk add --no-cache openssh-client \
 && addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# Prepare SSH directory for nextjs user
RUN mkdir -p /home/nextjs/.ssh \
 && chown nextjs:nodejs /home/nextjs/.ssh \
 && chmod 700 /home/nextjs/.ssh

# Global SSH keep-alive defaults
RUN printf "Host *\n    ServerAliveInterval 60\n    ServerAliveCountMax 5\n    TCPKeepAlive yes\n" \
    > /etc/ssh/ssh_config

# Ensure /app and npm cache are writable by nextjs
RUN chown nextjs:nodejs /app \
 && mkdir -p /home/nextjs/.npm \
 && chown nextjs:nodejs /home/nextjs/.npm

# Copy built artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Inline creation of the startup script inside the image
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh

# Function to keep SSH connections alive
setup_ssh_keepalive() {
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
}

# Set up SSH keep-alive
setup_ssh_keepalive

# Background “health-check” to ping any open SSH connections
(
    while true; do
        if pgrep ssh > /dev/null 2>&1; then
            ssh -O check -q >/dev/null 2>&1 || true
        fi
        sleep 30
    done
) &

# Launch Next.js
exec npm start
EOF

# Make the script executable and owned by nextjs
RUN chmod +x /app/start.sh \
 && chown nextjs:nodejs /app/start.sh

# Switch to non-root user
USER nextjs

# Environment & port
ENV NODE_ENV=production
ENV PORT=3030
EXPOSE 3030

# Start the app
CMD ["/app/start.sh"]
