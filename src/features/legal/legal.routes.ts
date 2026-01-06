/**
 * Legal Document Routes
 * API endpoints for legal documents (privacy policy, terms, help)
 */

import { Router } from 'express';
import { legalController } from './legal.controller';

const router = Router();

// Public routes - anyone can read legal documents
router.get('/all', legalController.getAllActiveDocuments.bind(legalController));
router.get('/:type', legalController.getActiveDocument.bind(legalController));
router.get('/:type/history', legalController.getDocumentHistory.bind(legalController));

// Admin routes - require authentication and admin role
// Note: Add authentication middleware when implementing admin features
router.post('/', legalController.createDocument.bind(legalController));
router.patch('/:id', legalController.updateDocument.bind(legalController));
router.delete('/:id', legalController.deleteDocument.bind(legalController));

export default router;
