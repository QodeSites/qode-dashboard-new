# --- Build Stage ---
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Configure SSH Keepalive
RUN mkdir -p ~/.ssh && \
    echo "ServerAliveInterval 60" >> ~/.ssh/config && \
    echo "ServerAliveCountMax 10" >> ~/.ssh/config

# Install Prisma CLI globally (optional, useful if migrations needed)
RUN npm install -g prisma

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install --legacy-peer-deps

# Copy the entire project
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy only the production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy build output and necessary files from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma

# Expose the correct port (you use 4000)
EXPOSE 4000

# Start the Next.js app
CMD ["npm", "run", "start"]