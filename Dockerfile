# ── Stage 1: build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files & install dependencies
COPY package.json package-lock.json ./
# If you use pnpm: COPY pnpm-lock.yaml .; RUN npm install -g pnpm; RUN pnpm install
RUN npm ci --legacy-peer-deps

# Copy Prisma schema (if used) and generate client
# If you don't have prisma in production, remove these two lines.
COPY prisma ./prisma
RUN npx prisma generate

# Copy everything else & build
COPY . .
RUN npm run build

# ── Stage 2: run the built app ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install OpenSSH client for SSH functionality
RUN apk add --no-cache openssh-client

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs

# Create SSH directory and set permissions
RUN mkdir -p /home/nextjs/.ssh \
 && chown nextjs:nodejs /home/nextjs/.ssh \
 && chmod 700 /home/nextjs/.ssh

# Configure SSH keep-alive settings globally
RUN printf 'Host *\n    ServerAliveInterval 60\n    ServerAliveCountMax 3\n    TCPKeepAlive yes\n    ClientAliveInterval 60\n    ClientAliveCountMax 3\n' \
    > /etc/ssh/ssh_config

# Make sure /app is owned by nextjs, and npm cache is owned by nextjs
RUN chown nextjs:nodejs /app \
 && mkdir -p /home/nextjs/.npm \
 && chown nextjs:nodejs /home/nextjs/.npm

# Copy only production-ready artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# If you rely on prisma at runtime, also copy prisma folder
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Create the startup script in-image via RUN-heredoc
RUN cat << 'EOF' > /app/start.sh
#!/bin/sh

# Function to keep SSH connections alive
setup_ssh_keepalive() {
    if [ ! -f /home/nextjs/.ssh/config ]; then
        cat > /home/nextjs/.ssh/config << 'SSHEOF'
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    TCPKeepAlive yes
SSHEOF
        chmod 600 /home/nextjs/.ssh/config
    fi
}

# Set up SSH keep-alive
setup_ssh_keepalive

# Background loop to ping existing SSH connections every 30s
(
    while true; do
        if pgrep ssh > /dev/null 2>&1; then
            ssh -O check -q > /dev/null 2>&1 || true
        fi
        sleep 30
    done
) &

# Start the Next.js application
exec npm start
EOF
RUN chmod +x /app/start.sh && chown nextjs:nodejs /app/start.sh

# Switch to non-root user
USER nextjs

# Expose Next.js default port (3000). You can override via env if needed.
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Start with our custom script
CMD ["/app/start.sh"]
