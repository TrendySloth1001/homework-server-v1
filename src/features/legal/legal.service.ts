/**
 * Legal Document Service
 * Business logic for managing legal documents
 */

import { prisma } from '../../shared/lib/prisma';
import { LegalDocumentType, CreateLegalDocumentInput, UpdateLegalDocumentInput } from './legal.types';

export class LegalService {
  /**
   * Get the active legal document by type
   */
  async getActiveDocument(type: LegalDocumentType) {
    const document = await prisma.legalDocument.findFirst({
      where: {
        type,
        isActive: true,
      },
      orderBy: {
        effectiveDate: 'desc',
      },
    });

    if (!document) {
      throw new Error(`No active ${type} document found`);
    }

    return document;
  }

  /**
   * Get all versions of a document type
   */
  async getDocumentHistory(type: LegalDocumentType) {
    return await prisma.legalDocument.findMany({
      where: { type },
      orderBy: {
        effectiveDate: 'desc',
      },
    });
  }

  /**
   * Get document by ID
   */
  async getDocumentById(id: string) {
    const document = await prisma.legalDocument.findUnique({
      where: { id },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Create a new legal document
   */
  async createDocument(data: CreateLegalDocumentInput) {
    // If this is being set as active, deactivate all other documents of this type
    if (data.version) {
      await prisma.legalDocument.updateMany({
        where: {
          type: data.type,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    return await prisma.legalDocument.create({
      data: {
        ...data,
        effectiveDate: data.effectiveDate || new Date(),
        isActive: true, // New documents are active by default
      },
    });
  }

  /**
   * Update a legal document
   */
  async updateDocument(id: string, data: UpdateLegalDocumentInput) {
    // If activating this document, deactivate all others of same type
    if (data.isActive === true) {
      const document = await this.getDocumentById(id);
      await prisma.legalDocument.updateMany({
        where: {
          type: document.type,
          isActive: true,
          id: { not: id },
        },
        data: {
          isActive: false,
        },
      });
    }

    return await prisma.legalDocument.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a legal document
   */
  async deleteDocument(id: string) {
    return await prisma.legalDocument.delete({
      where: { id },
    });
  }

  /**
   * Get all document types and their active versions
   */
  async getAllActiveDocuments() {
    return await prisma.legalDocument.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        type: 'asc',
      },
    });
  }
}

export const legalService = new LegalService();
