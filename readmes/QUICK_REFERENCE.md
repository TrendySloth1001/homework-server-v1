# 🚀 Quick Reference - homeWork Server

## Start/Stop Commands
```bash
./start.sh          # Start everything (Docker + Server)
./stop.sh           # Stop with options (1=stop, 2=remove, 3=nuke)
npm run dev         # Start server only (if Docker already running)
docker-compose up   # Start Docker services only
```

## Service URLs
- **API**: http://localhost:3001
- **Health**: http://localhost:3001/health
- **Prisma Studio**: http://localhost:5555 (run: `npx prisma studio`)
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## Database Access
```bash
# PostgreSQL
docker exec -it homework_postgres psql -U homework -d homeworkdb

# Redis
docker exec -it homework_redis redis-cli -a redis123

# Prisma Studio (Visual)
npx prisma studio
```

## Common Tasks
```bash
# View server logs
tail -f server.log

# View Docker logs
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f qdrant

# Database migration
npx prisma migrate dev --name change_description

# Reset database
npx prisma migrate reset

# Generate Prisma client
npx prisma generate

# Build TypeScript
npm run build

# Check running containers
docker-compose ps

# Restart a service
docker-compose restart postgres
```

## Credentials
```
PostgreSQL:  homework / homework123 / homeworkdb
Redis:       password: redis123
Qdrant:      No auth (local)
```

## Port Map
```
3001 - Express API
5432 - PostgreSQL
6379 - Redis
6333 - Qdrant (HTTP)
6334 - Qdrant (gRPC)
5555 - Prisma Studio
```

## Troubleshooting
```bash
# Port in use
lsof -ti:3001
kill $(lsof -ti:3001)

# Docker not working
docker-compose down
docker-compose up -d

# Fresh start
./stop.sh    # Option 3 (remove all)
./start.sh   # Full reset
```

## File Locations
- **Config**: `.env`
- **Schema**: `prisma/schema.prisma`
- **Logs**: `server.log`
- **PID**: `server.pid`
- **Docker**: `docker-compose.yml`

## 🆕 Version Management API (NEW)

All AI-generated syllabi are now versioned (v1, v2, v3...). No deletions - full history preserved.

### List All Versions
```bash
GET /api/syllabus/versions?teacherId=T001&subjectName=Physics&className=12&board=CBSE&term=1&academicYear=2024
```

### Get Specific Version
```bash
GET /api/syllabus/version/:syllabusId
```

### Compare Two Versions
```bash
GET /api/syllabus/compare?version1Id=abc123&version2Id=xyz789
```

### Mark Version as Latest
```bash
PATCH /api/syllabus/:syllabusId/set-latest
```

**Version Fields**:
- `version` - Auto-incremented number (1, 2, 3...)
- `isLatest` - Boolean flag (true for active version)
- `parentId` - Links to original syllabus
- `generationJobId` - Links to AI generation job

See `VERSION_TRACKING.md` for full documentation.
