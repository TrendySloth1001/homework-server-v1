/**
 * Avatar Routes
 * API routes for avatar management
 */

import { Router } from 'express';
import multer from 'multer';
import * as avatarController from './avatar.controller';
import { authenticateToken } from '../auth/middleware/auth.middleware';

// Configure multer for avatar uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatars'));
    }
  },
});

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get predefined avatars
router.get('/predefined', avatarController.getPredefinedAvatars);

// Get user's custom avatars
router.get('/my-avatars', avatarController.getUserAvatars);

// Upload custom avatar
router.post('/upload', upload.single('avatar'), avatarController.uploadCustomAvatar);

// Set avatar (predefined or custom)
router.post('/set', avatarController.setAvatar);

// Remove avatar
router.delete('/', avatarController.removeAvatar);

export default router;
