# Syllabus API - Authentication Update

## Important Changes

### Authentication Required
All syllabus routes now require JWT authentication. Users must be logged in to access any syllabus endpoints.

### Automatic Teacher ID Resolution
When creating a syllabus, you **no longer need to send `teacherId` in the request body**. The backend automatically resolves it from the authenticated user's JWT token.

## Updated API Example

### Before (Old - Will Fail):
```json
POST /api/syllabi
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "teacherId": "teacher123",  // ❌ Don't send this
  "subjectName": "Mathematics",
  "className": "10",
  "board": "CBSE",
  "term": "Term 1",
  "academicYear": "2025-2026"
}
```

### After (New - Correct):
```json
POST /api/syllabi
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "subjectName": "Mathematics",
  "className": "10",
  "board": "CBSE",
  "term": "Term 1",
  "academicYear": "2025-2026"
}
```

The backend extracts `userId` from the JWT token and automatically looks up the corresponding `teacherId`.

## Frontend Implementation

```javascript
// ✅ Correct way to create syllabus
async function createSyllabus(syllabusData) {
  const token = localStorage.getItem('jwt_token');
  
  const response = await fetch('http://localhost:3000/api/syllabi', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // No teacherId needed!
      subjectName: syllabusData.subject,
      className: syllabusData.class,
      board: syllabusData.board,
      term: syllabusData.term,
      academicYear: syllabusData.year,
      overview: syllabusData.overview,
      objectives: syllabusData.objectives
    })
  });

  return await response.json();
}
```

## Protected Routes

The following routes now require authentication:

- ✅ `POST /api/syllabi` - Create syllabus (Teachers only)
- ✅ `GET /api/syllabi` - List syllabi
- ✅ `GET /api/syllabi/:id` - Get single syllabus
- ✅ `PATCH /api/syllabi/:id` - Update syllabus (Teachers only)
- ✅ `DELETE /api/syllabi/:id` - Delete syllabus (Teachers only)
- ✅ `PATCH /api/syllabi/:id/archive` - Archive (Teachers only)
- ✅ `PATCH /api/syllabi/:id/publish` - Publish (Teachers only)

## Error Handling

### No JWT Token:
```json
{
  "success": false,
  "message": "No token provided"
}
```

### Not a Teacher:
```json
{
  "success": false,
  "message": "User is not a teacher"
}
```

### Teacher Profile Missing:
```json
{
  "success": false,
  "message": "Teacher profile not found"
}
```

## Testing with Postman

1. Login with Google OAuth
2. Copy JWT token from response
3. Set environment variable `jwt_token`
4. Make syllabus requests without `teacherId` field
5. Token is automatically sent via `Authorization: Bearer {{jwt_token}}`
