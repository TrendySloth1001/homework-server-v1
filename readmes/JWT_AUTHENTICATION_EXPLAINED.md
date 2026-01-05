# JWT Authentication - How It Works Without Database Storage

## ❓ Your Question
**"Are we not storing the JWT token? If so, how are we verifying the user is valid without storing the JWT token?"**

## ✅ Answer: JWT is Stateless (No Database Storage Required)

**We do NOT store JWT tokens in the database.** This is intentional and by design. Here's why:

---

## 🔐 How JWT Verification Works

### 1. **Token Creation (Login/Signup)**

When a user logs in or signs up:

```typescript
// Generate JWT token
const token = jwt.sign(
  {
    userId: 'user123',
    email: 'teacher@example.com',
    role: 'TEACHER'
  },
  JWT_SECRET,  // Secret key from .env
  { expiresIn: '7d' }
);

// Return token to client
return { token, user };
```

**What happens:**
- Payload (userId, email, role) is encoded
- Token is **cryptographically signed** using `JWT_SECRET`
- Token includes expiration timestamp
- Token is sent to client (NOT saved in database)

---

### 2. **Token Storage (Client-Side)**

The client (browser) stores the token:

```javascript
// Frontend stores token in localStorage
localStorage.setItem('jwt_token', token);
```

**Important:** Token is stored on the **client side**, never in your database.

---

### 3. **Token Verification (Every Request)**

When user makes a request to protected endpoint:

```typescript
// Client sends token in Authorization header
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Server verifies token
export async function verifyTokenService(token: string): Promise<JWTPayload> {
  try {
    // jwt.verify() checks:
    // 1. Token signature is valid (matches JWT_SECRET)
    // 2. Token hasn't expired
    // 3. Token structure is correct
    const decoded = jwt.verify(token, config.auth.jwt.secret) as JWTPayload;
    
    // If valid, return payload (userId, email, role)
    return decoded;
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
```

**How verification works WITHOUT database:**
1. **Signature validation**: Token was signed with `JWT_SECRET`. Server uses the same secret to verify the signature hasn't been tampered with.
2. **Expiration check**: Token contains `exp` (expiration) timestamp. `jwt.verify()` automatically checks if token is expired.
3. **Payload extraction**: If valid, extract userId, email, role from token payload.

---

## 🔄 Complete Authentication Flow

```
┌──────────────┐
│   1. LOGIN   │
│ Google OAuth │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 2. SERVER GENERATES JWT                 │
│                                         │
│ token = jwt.sign({                      │
│   userId: 'user123',                    │
│   email: 'user@example.com',            │
│   role: 'TEACHER'                       │
│ }, JWT_SECRET, { expiresIn: '7d' })     │
│                                         │
│ ❌ NOT stored in database               │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. CLIENT RECEIVES & STORES TOKEN       │
│                                         │
│ localStorage.setItem('jwt_token', token)│
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 4. CLIENT SENDS TOKEN IN REQUESTS       │
│                                         │
│ GET /api/syllabi                        │
│ Authorization: Bearer <TOKEN>           │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 5. SERVER VERIFIES TOKEN                │
│                                         │
│ const payload = jwt.verify(             │
│   token,                                │
│   JWT_SECRET  // Same secret used to    │
│ );            // sign the token         │
│                                         │
│ ✅ Valid? Extract userId from payload   │
│ ❌ Invalid? Return 401 Unauthorized     │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 6. ACCESS GRANTED                       │
│                                         │
│ req.user = payload;  // { userId, ... } │
│ Proceed with request                    │
└─────────────────────────────────────────┘
```

---

## 🔑 Why JWT Doesn't Need Database Storage

### 1. **Cryptographic Signature**
- Token is signed with a secret key (`JWT_SECRET`)
- Any tampering with the token breaks the signature
- Server can verify authenticity by recalculating the signature

### 2. **Self-Contained Payload**
- Token contains all necessary user information (userId, email, role)
- No need to look up user info in database for every request
- Reduces database load

### 3. **Built-in Expiration**
- Token includes `exp` (expiration) timestamp
- `jwt.verify()` automatically rejects expired tokens
- No need to track token validity in database

### 4. **Stateless Authentication**
- Server doesn't maintain session state
- Scales horizontally (multiple servers can verify same token)
- Simpler infrastructure

---

## 📊 What IS Stored in Database

While JWT tokens are NOT stored, these ARE stored:

```typescript
// User table
User {
  id: string              // ✅ Stored (referenced in JWT payload)
  email: string           // ✅ Stored (referenced in JWT payload)
  role: UserRole          // ✅ Stored (referenced in JWT payload)
  googleId: string        // ✅ Stored
  lastLoginAt: DateTime   // ✅ Stored
  // ❌ NO jwtToken field
}

// Teacher/Student tables
Teacher {
  id: string              // ✅ Stored
  userId: string          // ✅ Stored (links to User)
  firstName: string       // ✅ Stored
  // ... other profile data
}
```

---

## 🛡️ Security Features

### 1. **Token Signature**
```typescript
// Token structure: header.payload.signature
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.    // Header (algorithm)
eyJ1c2VySWQiOiJ1c2VyMTIzIiwicm9sZSI6IlRFQUNIRVIifQ.  // Payload (data)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c    // Signature (verification)
```

**Signature = HMACSHA256(header + payload, JWT_SECRET)**

If someone changes the payload, the signature won't match → token is invalid.

### 2. **Expiration Check**
```typescript
// Payload includes expiration
{
  userId: 'user123',
  email: 'user@example.com',
  role: 'TEACHER',
  iat: 1704499200,  // Issued at (timestamp)
  exp: 1705104000   // Expires at (timestamp)
}

// jwt.verify() automatically rejects if Date.now() > exp
```

### 3. **Temporary Token Protection**
```typescript
// In auth.middleware.ts
if (payload.isTemp) {
  throw new UnauthorizedError('Temporary token cannot be used for this endpoint');
}
```

Temporary tokens (OAuth → signup) can't access protected routes.

---

## 🚫 When Tokens Become Invalid

Tokens are rejected in these cases:

1. **Expired**: `exp` timestamp has passed (7 days by default)
2. **Invalid signature**: Token was tampered with
3. **Wrong secret**: JWT_SECRET doesn't match (e.g., server restart with new secret)
4. **Malformed**: Token structure is incorrect
5. **Temporary token**: Used on non-signup endpoints

---

## 🔄 Token Refresh Strategy

### Current Implementation (Simple)
- Tokens valid for 7 days
- User logs in again after expiration
- No refresh tokens

### Future Enhancement (Optional)
You could add refresh tokens stored in database:

```typescript
RefreshToken {
  id: string
  userId: string
  token: string
  expiresAt: DateTime
}
```

But this is **not necessary** for your current use case.

---

## 💡 Key Takeaways

1. ✅ **JWT tokens are NOT stored in database**
2. ✅ **Verification uses cryptographic signature + expiration check**
3. ✅ **Token contains userId, which is used to identify user**
4. ✅ **Client stores token in localStorage**
5. ✅ **Server verifies token on every protected request**
6. ✅ **No database lookup needed for authentication** (only for authorization/data)

---

## 🧪 Example Verification Process

```typescript
// 1. User sends request
GET /api/syllabi
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyMTIzIn0.xyz

// 2. authenticateToken middleware
const token = req.headers.authorization.substring(7);

// 3. Verify token (NO DATABASE CALL)
const payload = jwt.verify(token, JWT_SECRET);
// Returns: { userId: 'user123', email: 'user@example.com', role: 'TEACHER' }

// 4. Attach to request
req.user = payload;

// 5. Controller can now use req.user
const userId = req.user.userId;  // 'user123'
const teacherId = await getTeacherIdFromUserId(userId);  // Database call HERE

// 6. Create syllabus with teacherId
await prisma.syllabus.create({ data: { teacherId, ... } });
```

---

## 🎯 Summary

**Question:** How do we verify users without storing tokens?

**Answer:** 
- JWT tokens are **cryptographically signed** with a secret key
- Verification checks the **signature** (proves token wasn't tampered with)
- Verification checks **expiration** (proves token is still valid)
- Token **payload contains userId**, which identifies the user
- No database storage needed for authentication
- Database only used to fetch additional user/teacher data when needed

This is the **industry standard** for stateless authentication and is used by millions of applications worldwide (Auth0, Firebase, AWS Cognito, etc.).

---

## 📚 Further Reading

- [JWT.io - Introduction to JSON Web Tokens](https://jwt.io/introduction)
- [RFC 7519 - JSON Web Token Standard](https://tools.ietf.org/html/rfc7519)
- [OWASP - JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
