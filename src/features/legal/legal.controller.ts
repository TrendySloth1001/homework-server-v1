/**
 * Legal Document Controller
 * HTTP request handlers for legal documents
 */

import { Request, Response } from 'express';
import { legalService } from './legal.service';
import { LegalDocumentType } from './legal.types';
import { asyncHandler, ValidationError } from '../../shared/lib/errors';

export class LegalController {
  /**
   * GET /api/legal/:type
   * Get the active legal document by type
   */
  getActiveDocument = asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;
    
    // Validate document type
    if (!Object.values(LegalDocumentType).includes(type as LegalDocumentType)) {
      throw new ValidationError('Invalid document type');
    }

    const document = await legalService.getActiveDocument(type as LegalDocumentType);

    res.json({
      success: true,
      data: document,
    });
  });

  /**
   * GET /api/legal/:type/history
   * Get all versions of a document type
   */
  getDocumentHistory = asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;
    
    if (!Object.values(LegalDocumentType).includes(type as LegalDocumentType)) {
      throw new ValidationError('Invalid document type');
    }

    const documents = await legalService.getDocumentHistory(type as LegalDocumentType);

    res.json({
      success: true,
      data: documents,
    });
  });

  /**
   * GET /api/legal/all
   * Get all active documents
   */
  getAllActiveDocuments = asyncHandler(async (req: Request, res: Response) => {
    const documents = await legalService.getAllActiveDocuments();

    res.json({
      success: true,
      data: documents,
    });
  });

  /**
   * POST /api/legal
   * Create a new legal document (Admin only)
   */
  createDocument = asyncHandler(async (req: Request, res: Response) => {
    const document = await legalService.createDocument(req.body);

    res.status(201).json({
      success: true,
      data: document,
    });
  });

  /**
   * PATCH /api/legal/:id
   * Update a legal document (Admin only)
   */
  updateDocument = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Document ID is required');
    }
    
    const document = await legalService.updateDocument(id, req.body);

    res.json({
      success: true,
      data: document,
    });
  });

  /**
   * DELETE /api/legal/:id
   * Delete a legal document (Admin only)
   */
  deleteDocument = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Document ID is required');
    }
    
    await legalService.deleteDocument(id);

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  });
}

export const legalController = new LegalController();
