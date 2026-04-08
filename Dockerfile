# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./
COPY .npmrc ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy prisma schema for client generation
COPY prisma ./prisma/
COPY prisma.config.js ./

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim AS production

ARG TARGETARCH

WORKDIR /app

# Install runtime dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY .npmrc ./

# Install production dependencies only
# Force npm to resolve optional native packages for the Linux runtime architecture.
RUN set -eux; \
  RUNTIME_ARCH="${TARGETARCH:-$(dpkg --print-architecture)}"; \
  case "$RUNTIME_ARCH" in \
    amd64) RUNTIME_ARCH="x64" ;; \
    arm64) RUNTIME_ARCH="arm64" ;; \
    *) echo "Unsupported architecture: $RUNTIME_ARCH"; exit 1 ;; \
  esac; \
  npm_config_platform=linux npm_config_arch="$RUNTIME_ARCH" npm ci --omit=dev --include=optional

# Copy prisma schema and migrations (needed for migrations at runtime)
COPY prisma ./prisma/

# Copy generated Prisma client from builder stage (avoids needing devDependencies)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist/

# Copy static files if any
COPY public ./public/

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]
