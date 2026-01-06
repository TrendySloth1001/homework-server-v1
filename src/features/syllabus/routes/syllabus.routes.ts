import { Router } from 'express';
import { authenticateToken, requireRole } from '../../auth/middleware/auth.middleware';
import { UserRole } from '@prisma/client';
import { 
    createSyllabusHandler,
    updateSyllabusHandler, 
    getAllSyllabusByTeacherIdHandler, 
    getSingleSyllabusHandler,
    deleteSyllabusHandler,
    archiveSyllabusHandler,
    changeSyllabusStageHandler,
    calculateSyllabusCompletionHandler,
    publishSyllabusHandler,
    getSimilarSyllabiHandler,
    getSyllabusVersionsHandler,
    getSyllabusVersionHandler,
    compareSyllabusVersionsHandler,
    setLatestVersionHandler
} from '../syllabus.controller';

const router = Router();

/**
 * Syllabus Routes - /api/syllabi
 * RESTful resource endpoints for syllabus management
 * All routes require authentication
 */

// Apply authentication to all routes
router.use(authenticateToken);

// Collection routes (order matters - specific routes before parameterized ones)
router.get('/teacher/:teacherId', getAllSyllabusByTeacherIdHandler);        // GET /api/syllabi/teacher/:teacherId
router.get('/similar', getSimilarSyllabiHandler);                           // GET /api/syllabi/similar

// CRUD operations - Teachers only
router.post('/', requireRole([UserRole.TEACHER]), createSyllabusHandler);                                    // POST /api/syllabi
router.get('/', getAllSyllabusByTeacherIdHandler);                          // GET /api/syllabi?teacherId=xxx
router.get('/:id', getSingleSyllabusHandler);                               // GET /api/syllabi/:id
router.patch('/:id', requireRole([UserRole.TEACHER]), updateSyllabusHandler);                                // PATCH /api/syllabi/:id
router.delete('/:id', requireRole([UserRole.TEACHER]), deleteSyllabusHandler);                               // DELETE /api/syllabi/:id

// Syllabus management actions - Teachers only
router.patch('/:id/archive', requireRole([UserRole.TEACHER]), archiveSyllabusHandler);                       // PATCH /api/syllabi/:id/archive
router.patch('/:id/stage', requireRole([UserRole.TEACHER]), changeSyllabusStageHandler);                     // PATCH /api/syllabi/:id/stage
router.patch('/:id/publish', requireRole([UserRole.TEACHER]), publishSyllabusHandler);                       // PATCH /api/syllabi/:id/publish
router.post('/:id/completion', calculateSyllabusCompletionHandler);         // POST /api/syllabi/:id/completion

export default router;
