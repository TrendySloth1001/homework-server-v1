#!/bin/bash

# homeWork Server - Docker Compose Setup & Start Script
# This script sets up and starts the entire stack using Docker Compose

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for flags
USE_LOCAL=false
REBUILD=false
for arg in "$@"; do
    case $arg in
        --local)
            USE_LOCAL=true
            ;;
        --rebuild)
            REBUILD=true
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  homeWork Server Setup & Start${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$USE_LOCAL" = true ]; then
    echo -e "${YELLOW}Mode: Local development (server runs on host)${NC}"
else
    echo -e "${YELLOW}Mode: Full Docker (all services containerized)${NC}"
fi
echo ""

# Step 1: Check Docker
echo -e "${YELLOW}[1/6]${NC} Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed${NC}"
    echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker ps &> /dev/null; then
    echo -e "${YELLOW}⏳ Starting Docker Desktop...${NC}"
    open -a Docker
    echo "Waiting for Docker to start (this may take 30 seconds)..."
    for i in {1..30}; do
        if docker ps &> /dev/null 2>&1; then
            echo -e "${GREEN}✓ Docker is running${NC}"
            break
        fi
        sleep 2
        echo -n "."
    done
    echo ""
fi

if ! docker ps &> /dev/null; then
    echo -e "${RED}✗ Docker failed to start${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Step 2: Check environment file
echo -e "${YELLOW}[2/6]${NC} Checking environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file from .env.example${NC}"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Step 3: Stop existing containers
echo -e "${YELLOW}[3/6]${NC} Stopping existing containers..."
docker-compose down > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Cleaned up${NC}"

# Step 4: Build and start services
echo -e "${YELLOW}[4/6]${NC} Starting services..."

if [ "$USE_LOCAL" = true ]; then
    # Local mode: only start infrastructure
    docker-compose up -d postgres redis qdrant minio
else
    # Full Docker mode: start everything
    if [ "$REBUILD" = true ]; then
        echo "Building fresh images..."
        docker-compose build --no-cache homework-server
    fi
    docker-compose up -d
fi

# Wait for infrastructure services to be healthy
echo "⏳ Waiting for infrastructure services..."
sleep 10

# Check infrastructure services
INFRA_OK=true
for service in postgres redis qdrant minio; do
    container_name="homework_${service}"
    if docker ps --filter "name=${container_name}" --filter "status=running" | grep -q "${container_name}"; then
        echo -e "${GREEN}✓ ${service} is running${NC}"
    else
        echo -e "${RED}✗ ${service} failed to start${NC}"
        docker-compose logs ${service}
        INFRA_OK=false
    fi
done

if [ "$INFRA_OK" = false ]; then
    exit 1
fi

# Step 5: Configure MinIO bucket
echo -e "${YELLOW}[5/6]${NC} Configuring MinIO bucket..."
sleep 3

# For local mode, we need node installed to run the bucket script
if [ "$USE_LOCAL" = true ]; then
    if [ -d "node_modules" ]; then
        npx ts-node create-bucket.ts > /dev/null 2>&1 && echo -e "${GREEN}✓ MinIO bucket configured${NC}" || echo -e "${YELLOW}⚠ MinIO bucket may already exist${NC}"
    else
        echo -e "${YELLOW}⚠ Skipping bucket creation (run 'npm install' first for local mode)${NC}"
    fi
else
    # In Docker mode, run bucket creation inside the container after it starts
    echo -e "${YELLOW}⚠ MinIO bucket will be created when server starts${NC}"
fi

# Step 6: Handle local vs Docker mode
echo -e "${YELLOW}[6/6]${NC} Starting application..."

if [ "$USE_LOCAL" = true ]; then
    # Local development mode
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    
    # Generate Prisma client
    npx prisma generate > /dev/null 2>&1
    
    # Run migrations
    echo "Running database migrations..."
    npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init
    
    # Build TypeScript
    npm run build
    
    # Get port from .env
    PORT=$(grep "^PORT=" .env | cut -d '=' -f2 | tr -d '"' || echo "3001")
    
    # Kill any existing process
    if lsof -ti:$PORT > /dev/null 2>&1; then
        kill $(lsof -ti:$PORT) > /dev/null 2>&1 || true
        sleep 2
    fi
    
    # Start locally
    nohup npm run dev > server.log 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > server.pid
    
    echo "⏳ Waiting for server to start..."
    for i in {1..20}; do
        if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
            break
        fi
        sleep 1
        echo -n "."
    done
    echo ""
else
    # Docker mode - run migrations inside container
    echo "⏳ Waiting for backend container to be ready..."
    for i in {1..60}; do
        if docker ps --filter "name=homework_server" --filter "status=running" | grep -q "homework_server"; then
            break
        fi
        sleep 2
        echo -n "."
    done
    echo ""
    
    # Run migrations inside the container
    echo "Running database migrations..."
    docker-compose exec -T homework-server npx prisma migrate deploy 2>/dev/null || \
    docker-compose exec -T homework-server npx prisma migrate dev --name init 2>/dev/null || true
    
    PORT=3001
    
    # Wait for health check
    echo "⏳ Waiting for server health check..."
    for i in {1..30}; do
        if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
            break
        fi
        sleep 2
        echo -n "."
    done
    echo ""
fi

# Final verification
if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   All services are running!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Service Status:${NC}"
    echo "  ✓ PostgreSQL:  localhost:5432"
    echo "  ✓ Redis:       localhost:6379"
    echo "  ✓ Qdrant:      http://localhost:6333"
    echo "  ✓ MinIO:       http://localhost:9000 (Console: 9001)"
    echo "  ✓ App:         http://localhost:$PORT"
    echo ""
    echo -e "${BLUE}Credentials:${NC}"
    echo "  • PostgreSQL:   homework / homework123 / homeworkdb"
    echo "  • Redis:        password: redis123"
    echo "  • Qdrant:       No authentication (local)"
    echo "  • MinIO:        minioadmin / minioadmin123"
    echo ""
    echo -e "${BLUE}Quick Tests:${NC}"
    echo "  • API Health:   curl http://localhost:$PORT/health"
    echo "  • Qdrant UI:    http://localhost:6333/dashboard"
    echo "  • MinIO UI:     http://localhost:9001"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    if [ "$USE_LOCAL" = true ]; then
        echo "  • View logs:      tail -f server.log"
        echo "  • Stop server:    ./stop.sh"
    else
        echo "  • View logs:      docker-compose logs -f homework-server"
        echo "  • Stop all:       docker-compose down"
        echo "  • Rebuild:        docker-compose up -d --build homework-server"
    fi
    echo "  • Database GUI:   npx prisma studio"
    echo "  • Check DB:       docker exec -it homework_postgres psql -U homework -d homeworkdb"
    echo "  • Redis CLI:      docker exec -it homework_redis redis-cli -a redis123"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./start.sh            # Full Docker mode (recommended)"
    echo "  ./start.sh --local    # Local dev mode (server on host)"
    echo "  ./start.sh --rebuild  # Force rebuild the container"
    echo ""
else
    echo -e "${RED}✗ Server failed to start${NC}"
    if [ "$USE_LOCAL" = true ]; then
        echo "Check server.log for details:"
        tail -30 server.log
    else
        echo "Check container logs:"
        docker-compose logs --tail=50 homework-server
    fi
    exit 1
fi
