# Syllabus Version Tracking

## Overview
The system now supports **multiple AI-generated versions** of the same syllabus. Instead of deleting previous generations, the system preserves all versions for comparison and history.

## What Changed

### Database Schema
Added to `Syllabus` model:
- `version` (Int) - Version number (1, 2, 3, ...)
- `isLatest` (Boolean) - Marks the active version
- `parentId` (String?) - Links to original syllabus
- `generationJobId` (String?) - Links to AI generation job

### Behavior
**Before:**
- Generating same syllabus - Deleted old one
- Lost all previous AI attempts
- No comparison possible

**After:**
- Generating same syllabus - Creates new version
- Preserves all previous versions
- Marks latest as active
- Allows comparison between versions

## API Endpoints

### 1. Get All Versions
```http
GET /api/v1/syllabi/versions
  ?teacherId=teacher-ai-123
  &subjectName=Physics
  &className=Class 10
  &board=CBSE
  &term=Annual
  &academicYear=2025
```

**Response:**
```json
{
  "success": true,
  "message": "Found 3 version(s)",
  "count": 3,
  "data": [
    {
      "id": "syllabus-v3-id",
      "version": 3,
      "isLatest": true,
      "published": false,
      "stage": "draft",
      "generatedBy": "ai",
      "createdAt": "2025-12-18T10:30:00Z",
      "_count": { "units": 5 }
    },
    {
      "id": "syllabus-v2-id",
      "version": 2,
      "isLatest": false,
      "published": false,
      "stage": "draft",
      "generatedBy": "ai",
      "createdAt": "2025-12-18T09:15:00Z",
      "_count": { "units": 4 }
    },
    {
      "id": "syllabus-v1-id",
      "version": 1,
      "isLatest": false,
      "published": true,
      "stage": "published",
      "generatedBy": "ai",
      "createdAt": "2025-12-18T08:00:00Z",
      "_count": { "units": 5 }
    }
  ]
}
```

### 2. Get Specific Version (Full Details)
```http
GET /api/v1/syllabi/version/:syllabusId?teacherId=teacher-ai-123
```

**Response:** Full syllabus with units and topics

### 3. Compare Two Versions
```http
GET /api/v1/syllabi/compare
  ?version1=syllabus-v1-id
  &version2=syllabus-v3-id
  &teacherId=teacher-ai-123
```

**Response:**
```json
{
  "success": true,
  "message": "Version comparison completed",
  "data": {
    "version1": {
      "id": "v1-id",
      "version": 1,
      "createdAt": "2025-12-18T08:00:00Z",
      "unitsCount": 5,
      "topicsCount": 20
    },
    "version2": {
      "id": "v3-id",
      "version": 3,
      "createdAt": "2025-12-18T10:30:00Z",
      "unitsCount": 5,
      "topicsCount": 23
    },
    "differences": {
      "objectives": true,
      "overview": false,
      "prerequisites": true,
      "assessmentMethods": false,
      "resources": true,
      "unitsChanged": false
    },
    "fullData": {
      "version1": { /* full syllabus */ },
      "version2": { /* full syllabus */ }
    }
  }
}
```

### 4. Mark Version as Latest
```http
PATCH /api/v1/syllabi/:syllabusId/set-latest?teacherId=teacher-ai-123
```

Makes a specific version the "active" one. Updates `isLatest` flag.

## Workflow Example

### Teacher generates syllabus (Version 1):
```bash
POST /api/v1/syllabi/generate
{
  "teacherId": "teacher-ai-123",
  "subjectName": "Physics",
  "className": "Class 10",
  "board": "CBSE",
  "term": "Annual",
  "academicYear": "2025"
}
```
→ Creates **Version 1** (isLatest: true)

### Teacher not satisfied, regenerates (Version 2):
```bash
# Same request again
POST /api/v1/syllabi/generate
{ /* same params */ }
```
→ Creates **Version 2** (isLatest: true)
→ Version 1 still exists (isLatest: false)

### Teacher compares versions:
```bash
GET /api/v1/syllabi/versions?teacherId=xxx&...
# Returns both versions

GET /api/v1/syllabi/compare?version1=v1-id&version2=v2-id&teacherId=xxx
# Shows differences
```

### Teacher prefers Version 1, switches back:
```bash
PATCH /api/v1/syllabi/v1-id/set-latest?teacherId=xxx
```
→ Version 1 (isLatest: true)
→ Version 2 (isLatest: false)

## Console Logs (Dev Mode)

When generating:
```
[Queue/DEV] Previous versions found!
[Queue/DEV] - Latest version: 2
[Queue/DEV] - New version will be: 3
[Queue/DEV] - Marking previous versions as not latest...
[Queue] Creating version 3 of syllabus (preserving all previous versions)
[Queue/DEV] Previous versions preserved and marked as historical
```

First generation:
```
[Queue/DEV] First version - no previous syllabi found
[Queue] Creating first version of syllabus
```

## Benefits

- **Never lose AI generations** - All attempts preserved
- **Compare quality** - See which AI generation was better
- **Rollback capability** - Switch to any previous version
- **Audit trail** - Track when each version was created
- **A/B testing** - Test different prompts/descriptions
- **Incremental improvements** - Build on previous versions

## Database Queries

Get latest version only:
```typescript
const latest = await prisma.syllabus.findFirst({
  where: {
    teacherId,
    subjectName,
    className,
    board,
    term,
    academicYear,
    isLatest: true
  }
});
```

Get all versions:
```typescript
const versions = await prisma.syllabus.findMany({
  where: {
    teacherId,
    subjectName,
    className,
    board,
    term,
    academicYear
  },
  orderBy: { version: 'desc' }
});
```

## Migration Notes

Existing syllabi will have:
- `version: 1` (default)
- `isLatest: true` (default)
- `parentId: null`
- `generationJobId: null`

New generations will increment version numbers automatically.
