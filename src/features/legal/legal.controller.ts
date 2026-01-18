/**
 * Legal Document Controller
 * HTTP request handlers for legal documents
 */

import { Request, Response } from 'express';
import { legalService } from './legal.service';
import { LegalDocumentType } from './legal.types';

export class LegalController {
  /**
   * GET /api/legal/:type
   * Get the active legal document by type
   */
  async getActiveDocument(req: Request, res: Response) {
    try {
      const { type } = req.params;
      
      // Validate document type
      if (!Object.values(LegalDocumentType).includes(type as LegalDocumentType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document type',
        });
      }

      const document = await legalService.getActiveDocument(type as LegalDocumentType);

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      console.error('Get active document error:', error);
      res.status(404).json({
        success: false,
        message: error instanceof Error ? error.message : 'Document not found',
      });
    }
  }

  /**
   * GET /api/legal/:type/history
   * Get all versions of a document type
   */
  async getDocumentHistory(req: Request, res: Response) {
    try {
      const { type } = req.params;
      
      if (!Object.values(LegalDocumentType).includes(type as LegalDocumentType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document type',
        });
      }

      const documents = await legalService.getDocumentHistory(type as LegalDocumentType);

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      console.error('Get document history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve document history',
      });
    }
  }

  /**
   * GET /api/legal/all
   * Get all active documents
   */
  async getAllActiveDocuments(req: Request, res: Response) {
    try {
      const documents = await legalService.getAllActiveDocuments();

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      console.error('Get all documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve documents',
      });
    }
  }

  /**
   * POST /api/legal
   * Create a new legal document (Admin only)
   */
  async createDocument(req: Request, res: Response) {
    try {
      const document = await legalService.createDocument(req.body);

      res.status(201).json({
        success: true,
        data: document,
      });
    } catch (error) {
      console.error('Create document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create document',
      });
    }
  }

  /**
   * PATCH /api/legal/:id
   * Update a legal document (Admin only)
   */
  async updateDocument(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Document ID is required',
        });
      }
      
      const document = await legalService.updateDocument(id as string, req.body);

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      console.error('Update document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update document',
      });
    }
  }

  /**
   * DELETE /api/legal/:id
   * Delete a legal document (Admin only)
   */
  async deleteDocument(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Document ID is required',
        });
      }
      
      await legalService.deleteDocument(id as string);

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete document',
      });
    }
  }
}

export const legalController = new LegalController();
