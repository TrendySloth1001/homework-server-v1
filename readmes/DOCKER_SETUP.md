# homeWork Server - Docker Setup Guide

Complete development environment with PostgreSQL, Redis, and Qdrant Vector Database.

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- Node.js 18+ installed
- macOS (scripts are Mac-optimized, but can be adapted for Linux/Windows)

### One-Command Setup

```bash
./start.sh
```

This script will:
1. ✅ Check Docker is running
2. ✅ Create `.env` from `.env.example` (if needed)
3. ✅ Start PostgreSQL, Redis, and Qdrant containers
4. ✅ Configure database connections
5. ✅ Run Prisma migrations
6. ✅ Build and start the Node.js server

### Stop Services

```bash
./stop.sh
```

Interactive options:
- **Option 1**: Stop containers (keep for quick restart)
- **Option 2**: Remove containers (keep data volumes)
- **Option 3**: Remove everything (fresh start - DESTRUCTIVE)

## 📦 Services

| Service | Port | URL | Credentials |
|---------|------|-----|-------------|
| **App** | 3001 | http://localhost:3001 | - |
| **PostgreSQL** | 5432 | localhost:5432 | homework / homework123 |
| **Redis** | 6379 | localhost:6379 | password: redis123 |
| **Qdrant** | 6333 | http://localhost:6333 | No auth (local) |

## 🗄️ Database Management

### Prisma Studio (Visual Database Editor)
```bash
npx prisma studio
```
Opens at http://localhost:5555

### Direct PostgreSQL Access
```bash
# Connect via Docker
docker exec -it homework_postgres psql -U homework -d homeworkdb

# Common commands
\dt                 # List tables
\d+ Syllabus        # Describe table
SELECT * FROM "Syllabus" LIMIT 5;
```

### Redis CLI
```bash
docker exec -it homework_redis redis-cli -a redis123

# Common commands
KEYS *              # List all keys
GET key_name        # Get value
FLUSHALL            # Clear all data (careful!)
```

### Qdrant Dashboard
Open http://localhost:6333/dashboard in browser for vector database management.

## 🔄 Common Workflows

### Fresh Start (Reset Everything)
```bash
./stop.sh          # Choose option 3 (remove all data)
./start.sh         # Fresh setup
```

### Restart After Code Changes
```bash
# Server auto-restarts with ts-node-dev, but if needed:
kill $(cat server.pid)
npm run dev
```

### Switch from SQLite to PostgreSQL
```bash
# Backup SQLite data (if needed)
cp dev.db dev.db.backup

# Run start script (handles migration automatically)
./start.sh
```

### Database Migrations
```bash
# Create new migration after schema changes
npx prisma migrate dev --name description_of_change

# Apply migrations to production
npx prisma migrate deploy

# Reset database (destructive)
npx prisma migrate reset
```

## 🐳 Docker Commands Reference

### View Running Services
```bash
docker-compose ps
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f qdrant
```

### Restart Single Service
```bash
docker-compose restart postgres
docker-compose restart redis
docker-compose restart qdrant
```

### Stop Single Service
```bash
docker-compose stop postgres
```

### Start Stopped Containers
```bash
docker-compose start
```

## 📊 Data Persistence

Data is stored in Docker volumes:
- `postgres_data` - PostgreSQL database
- `redis_data` - Redis cache
- `qdrant_data` - Vector embeddings

**Volumes persist** even when containers are removed (option 2 in stop.sh).

To completely remove volumes:
```bash
docker-compose down -v
```

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -ti:3001    # or 5432, 6379, 6333

# Kill process
kill $(lsof -ti:3001)
```

### Docker Not Starting
```bash
# Restart Docker Desktop
open -a Docker

# Wait 30 seconds, then retry ./start.sh
```

### Database Connection Errors
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Verify connection
docker exec homework_postgres pg_isready -U homework
```

### Redis Connection Errors
```bash
# Test Redis
docker exec homework_redis redis-cli -a redis123 ping
# Should return: PONG
```

### Qdrant Not Accessible
```bash
# Check health
curl http://localhost:6333/healthz

# View logs
docker-compose logs qdrant
```

### Migration Conflicts (SQLite → PostgreSQL)
The `start.sh` script automatically backs up SQLite migrations. If issues persist:

```bash
# Manual backup
mv prisma/migrations prisma/migrations_backup

# Delete migration lock
rm prisma/migrations/migration_lock.toml

# Re-run migrations
npx prisma migrate dev --name init_postgresql
```

## 🔐 Production Considerations

Before deploying to production:

1. **Change Passwords**: Update all default passwords in `docker-compose.yml`
2. **Enable Authentication**: Configure Qdrant API key
3. **SSL/TLS**: Enable for PostgreSQL connections
4. **Network Security**: Don't expose ports directly, use reverse proxy
5. **Backup Strategy**: Set up automated backups for volumes
6. **Environment Variables**: Use secrets management (AWS Secrets Manager, etc.)

## 📝 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL="postgresql://homework:homework123@localhost:5432/homeworkdb"

# Redis
REDIS_URL="redis://:redis123@localhost:6379"

# Qdrant
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""  # Optional
```

## 🎯 Next Steps

After running `./start.sh`:

1. **Test API**: Import `homeWork_API.postman_collection.json` into Postman
2. **Create Syllabus**: POST to `/api/syllabus`
3. **Generate Questions**: Test AI question generation
4. **Check Qdrant**: Visit http://localhost:6333/dashboard
5. **View Data**: Run `npx prisma studio`

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
