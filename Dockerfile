# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY .npmrc ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy prisma schema for client generation
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src/
COPY prisma.config.js ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY .npmrc ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy prisma schema and migrations
COPY prisma ./prisma/
COPY prisma.config.js ./

# Generate Prisma client for production
RUN npx prisma generate

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist/

# Copy static files if any
COPY public ./public/

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
