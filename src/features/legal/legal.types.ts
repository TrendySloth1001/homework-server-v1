/**
 * Legal Document Types
 * Type definitions for privacy policy, terms, and help content
 */

export enum LegalDocumentType {
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  TERMS_OF_SERVICE = 'TERMS_OF_SERVICE',
  HELP_CENTER = 'HELP_CENTER',
  FAQ = 'FAQ',
  ABOUT_US = 'ABOUT_US'
}

export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  title: string;
  content: string;
  version: string;
  isActive: boolean;
  effectiveDate: Date;
  author?: string;
  summary?: string;
  lastReviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLegalDocumentInput {
  type: LegalDocumentType;
  title: string;
  content: string;
  version?: string;
  effectiveDate?: Date;
  author?: string;
  summary?: string;
}

export interface UpdateLegalDocumentInput {
  title?: string;
  content?: string;
  version?: string;
  isActive?: boolean;
  effectiveDate?: Date;
  author?: string;
  summary?: string;
  lastReviewedAt?: Date;
}
