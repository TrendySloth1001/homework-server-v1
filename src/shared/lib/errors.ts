/**
 * Custom error classes for better error handling and identification
 */

export class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400);
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, identifier?: string) {
        const message = identifier 
            ? `${resource} with identifier '${identifier}' not found`
            : `${resource} not found`;
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

export class DuplicateError extends AppError {
    constructor(resource: string, field?: string) {
        const message = field
            ? `${resource} with this ${field} already exists`
            : `${resource} already exists`;
        super(message, 409);
        this.name = 'DuplicateError';
    }
}

export class DatabaseError extends AppError {
    constructor(message: string, originalError?: Error) {
        super(`Database error: ${message}`, 500);
        this.name = 'DatabaseError';
        if (originalError && originalError.stack) {
            this.stack = originalError.stack;
        }
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
        this.name = 'ConflictError';
    }
}

export class BadRequestError extends AppError {
    constructor(message: string) {
        super(message, 400);
        this.name = 'BadRequestError';
    }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
import { Request, Response, NextFunction } from 'express';

export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
