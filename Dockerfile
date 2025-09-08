# Multi-stage Dockerfile for NestJS LiveStream Chat Application

# Stage 1: Base stage
FROM node:22-alpine AS base

# Install dumb-init, MongoDB tools, and netcat for proper signal handling and DB operations
RUN apk add --no-cache dumb-init mongodb-tools netcat-openbsd

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Stage 2: Development stage
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Start the application in development mode with hot reload
CMD ["pnpm", "run", "start:dev"]

# Stage 3: Build stage
FROM base AS builder

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Remove dev dependencies to reduce image size
RUN pnpm prune --prod

# Stage 4: Production runtime stage
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy production dependencies
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy necessary files
COPY --chown=nestjs:nodejs package.json ./
COPY --chown=nestjs:nodejs public ./public
COPY --chown=nestjs:nodejs members-list-final.json ./
COPY --chown=nestjs:nodejs scripts/docker-setup.sh ./scripts/
COPY --chown=nestjs:nodejs src ./src

# Make setup script executable
RUN chmod +x ./scripts/docker-setup.sh

# Create logs directory
RUN mkdir -p /app/logs && chown nestjs:nodejs /app/logs

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e " \
    const http = require('http'); \
    const options = { hostname: 'localhost', port: 3001, path: '/api/health', timeout: 5000 }; \
    const req = http.request(options, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application with setup
CMD ["./scripts/docker-setup.sh", "node", "./dist/main.js"]
