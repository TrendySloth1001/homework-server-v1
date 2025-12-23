/**
 * Conversation Service
 * Manages conversation history with sliding window (100 messages)
 */

import { prisma } from '../../shared/lib/prisma';
import { embeddingService } from '../../shared/lib/embeddings';
import { cacheService, CacheKeys } from '../../shared/lib/cache';
import { NotFoundError, ValidationError } from '../../shared/lib/errors';
import { config } from '../../shared/config';

/**
 * Message structure
 */
export interface Message {
    id: string;
    conversationId: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    retrievedDocs?: any;
    embedding?: string;
    tokensUsed?: number;
    model?: string;
    temperature?: number;
    sequenceNumber: number;
    createdAt: Date;
}

/**
 * Conversation structure
 */
export interface Conversation {
    id: string;
    userId?: string;
    teacherId?: string;
    studentId?: string;
    title?: string;
    topic?: string;
    sessionType: string;
    contextIds?: any;
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
    lastActiveAt: Date;
    messages?: Message[];
}

/**
 * Create conversation parameters
 */
export interface CreateConversationParams {
    userId?: string;
    teacherId?: string;
    studentId?: string;
    title?: string;
    topic?: string;
    sessionType?: 'chat' | 'tutoring' | 'question-gen' | 'syllabus';
    metadata?: Record<string, any>;
}

/**
 * Add message parameters
 */
export interface AddMessageParams {
    role: 'system' | 'user' | 'assistant';
    content: string;
    retrievedDocs?: any;
    tokensUsed?: number;
    model?: string;
    temperature?: number;
}

/**
 * Conversation Service Class
 */
class ConversationService {
    private readonly MAX_MESSAGES = 100;
    private readonly CACHE_TTL = 300; // 5 minutes

    /**
     * Create a new conversation
     */
    async createConversation(params: CreateConversationParams): Promise<Conversation> {
        const {
            userId,
            teacherId,
            studentId,
            title,
            topic,
            sessionType = 'chat',
            metadata,
        } = params;

        const conversation = await prisma.conversation.create({
            data: {
                ...(userId ? { userId } : {}),
                ...(teacherId ? { teacherId } : {}),
                ...(studentId ? { studentId } : {}),
                ...(title ? { title } : {}),
                ...(topic ? { topic } : {}),
                sessionType,
                ...(metadata ? { metadata } : {}),
            },
        });

        return conversation as Conversation;
    }

    /**
     * Get conversation by ID
     */
    async getConversation(
        conversationId: string,
        userId?: string
    ): Promise<Conversation> {
        // Build where clause with optional user filter
        const where: any = { id: conversationId };
        if (userId) {
            where.OR = [
                { userId },
                { teacherId: userId },
                { studentId: userId },
            ];
        }

        const conversation = await prisma.conversation.findFirst({
            where,
        });

        if (!conversation) {
            throw new NotFoundError('Conversation not found');
        }

        return conversation as Conversation;
    }

    /**
     * Get conversation history with sliding window
     * Returns last N messages (default: 100)
     */
    async getConversationHistory(
        conversationId: string,
        limit: number = 100
    ): Promise<Message[]> {
        // Check cache first
        const cacheKey = `conversation:${conversationId}:history:${limit}`;
        const cached = await cacheService.get<Message[]>(cacheKey);
        if (cached) {
            return cached;
        }

        // Fetch from database
        const messages = await prisma.conversationMessage.findMany({
            where: { conversationId },
            orderBy: { sequenceNumber: 'desc' },
            take: limit,
            select: {
                id: true,
                conversationId: true,
                role: true,
                content: true,
                tokensUsed: true,
                model: true,
                temperature: true,
                sequenceNumber: true,
                createdAt: true,
                retrievedDocs: true,
                embedding: false,
                // embedding is intentionally omitted
            },
        });


        // Reverse to get chronological order
        const chronological = messages.reverse() as Message[];

        // Cache for 5 minutes
        await cacheService.set(cacheKey, chronological, this.CACHE_TTL);

        return chronological;
    }

    /**
     * Add message to conversation
     * Automatically handles sequence numbering and pruning
     */
    async addMessage(
        conversationId: string,
        params: AddMessageParams
    ): Promise<Message> {
        const {
            role,
            content,
            retrievedDocs,
            tokensUsed,
            model,
            temperature,
        } = params;

        if (!content || content.trim().length === 0) {
            throw new ValidationError('Message content cannot be empty');
        }

        // Get current message count for sequence number
        const messageCount = await prisma.conversationMessage.count({
            where: { conversationId },
        });

        const sequenceNumber = messageCount + 1;

        // Generate embedding for the message (async, don't wait)
        let embedding: string | undefined;
        try {
            const embeddingVector = await embeddingService.generateEmbedding(content);
            embedding = JSON.stringify(embeddingVector);
        } catch (error) {
            console.error('Error generating message embedding:', error);
            // Continue without embedding
        }

        // Create message
        const message = await prisma.conversationMessage.create({
            data: {
                conversationId,
                role,
                content,
                sequenceNumber,
                ...(retrievedDocs ? { retrievedDocs } : {}),
                ...(embedding ? { embedding } : {}),
                ...(tokensUsed ? { tokensUsed } : {}),
                ...(model ? { model } : {}),
                ...(temperature ? { temperature } : {}),
            },
        });

        // Update conversation last active timestamp
        await this.updateLastActive(conversationId);

        // Invalidate cache
        await cacheService.deletePattern(`conversation:${conversationId}:*`);

        // Auto-prune if exceeds max messages (async, don't wait)
        this.pruneOldMessages(conversationId).catch((error) => {
            console.error('Error pruning old messages:', error);
        });

        return message as Message;
    }

    /**
     * Auto-prune old messages to maintain sliding window
     * Keeps only last MAX_MESSAGES messages
     */
    async pruneOldMessages(conversationId: string): Promise<void> {
        const messageCount = await prisma.conversationMessage.count({
            where: { conversationId },
        });

        if (messageCount > this.MAX_MESSAGES) {
            const excessCount = messageCount - this.MAX_MESSAGES;

            // Get IDs of oldest messages to delete
            const oldMessages = await prisma.conversationMessage.findMany({
                where: { conversationId },
                orderBy: { sequenceNumber: 'asc' },
                take: excessCount,
                select: { id: true },
            });

            if (oldMessages.length > 0) {
                await prisma.conversationMessage.deleteMany({
                    where: { id: { in: oldMessages.map((m) => m.id) } },
                });

                console.log(`✅ Pruned ${oldMessages.length} old messages from conversation ${conversationId}`);
            }
        }
    }

    /**
     * Update conversation last active timestamp
     */
    async updateLastActive(conversationId: string): Promise<void> {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastActiveAt: new Date() },
        });
    }

    /**
     * Update conversation metadata
     */
    async updateConversation(
        conversationId: string,
        updates: {
            title?: string;
            topic?: string;
            metadata?: Record<string, any>;
        }
    ): Promise<Conversation> {
        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                ...(updates.title ? { title: updates.title } : {}),
                ...(updates.topic ? { topic: updates.topic } : {}),
                ...(updates.metadata ? { metadata: updates.metadata } : {}),
                updatedAt: new Date(),
            },
        });

        // Invalidate cache
        await cacheService.deletePattern(`conversation:${conversationId}:*`);

        return conversation as Conversation;
    }

    /**
     * Get all conversations for a user
     */
    async getUserConversations(
        userId: string,
        options?: {
            sessionType?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<Conversation[]> {
        const { sessionType, limit = 50, offset = 0 } = options || {};

        const where: any = {
            OR: [
                { userId },
                { teacherId: userId },
                { studentId: userId },
            ],
        };

        if (sessionType) {
            where.sessionType = sessionType;
        }

        const conversations = await prisma.conversation.findMany({
            where,
            orderBy: { lastActiveAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                messages: {
                    orderBy: { sequenceNumber: 'desc' },
                    take: 1, // Include last message for preview
                },
            },
        });

        return conversations as Conversation[];
    }

    /**
     * Get all conversations for a specific teacher
     */
    async getTeacherConversations(
        teacherId: string,
        options?: {
            sessionType?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<Conversation[]> {
        const { sessionType, limit = 50, offset = 0 } = options || {};

        const where: any = {
            teacherId,
        };

        if (sessionType) {
            where.sessionType = sessionType;
        }

        const conversations = await prisma.conversation.findMany({
            where,
            orderBy: { lastActiveAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                title: true,
                topic: true,
                sessionType: true,
                lastActiveAt: true,
                createdAt: true,

                messages: {
                    orderBy: { sequenceNumber: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        role: true,
                        content: true,
                        sequenceNumber: true,
                        createdAt: true,
                        // embedding intentionally excluded
                    },
                },
            },
        });


        return conversations as Conversation[];
    }

    /**
     * Delete conversation and all its messages
     */
    async deleteConversation(
        conversationId: string,
        userId?: string
    ): Promise<void> {
        // Verify ownership if userId provided
        if (userId) {
            await this.getConversation(conversationId, userId);
        }

        await prisma.conversation.delete({
            where: { id: conversationId },
        });

        // Clear cache
        await cacheService.deletePattern(`conversation:${conversationId}:*`);

        console.log(`✅ Deleted conversation ${conversationId}`);
    }

    /**
     * Cleanup old conversations (older than X days)
     * Maintenance operation
     */
    async cleanupOldConversations(daysOld: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await prisma.conversation.deleteMany({
            where: {
                lastActiveAt: { lt: cutoffDate },
            },
        });

        console.log(`✅ Cleaned up ${result.count} old conversations`);
        return result.count;
    }

    /**
     * Get conversation statistics
     */
    async getConversationStats(conversationId: string): Promise<{
        messageCount: number;
        totalTokens: number;
        averageTokensPerMessage: number;
        duration: number; // in minutes
    }> {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    select: { tokensUsed: true, createdAt: true },
                },
            },
        });

        if (!conversation) {
            throw new NotFoundError('Conversation not found');
        }

        const messageCount = conversation.messages.length;
        const totalTokens = conversation.messages.reduce(
            (sum, msg) => sum + (msg.tokensUsed || 0),
            0
        );
        const averageTokensPerMessage = messageCount > 0 ? totalTokens / messageCount : 0;

        // Calculate duration in minutes
        const firstMessage = conversation.messages[0];
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const duration = firstMessage && lastMessage
            ? (lastMessage.createdAt.getTime() - firstMessage.createdAt.getTime()) / 1000 / 60
            : 0;

        return {
            messageCount,
            totalTokens,
            averageTokensPerMessage,
            duration,
        };
    }

    /**
     * Search conversations by content
     */
    async searchConversations(
        userId: string,
        searchQuery: string,
        limit: number = 20
    ): Promise<Conversation[]> {
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { userId },
                    { teacherId: userId },
                    { studentId: userId },
                ],
                AND: {
                    OR: [
                        { title: { contains: searchQuery, mode: 'insensitive' } },
                        { topic: { contains: searchQuery, mode: 'insensitive' } },
                    ],
                },
            },
            orderBy: { lastActiveAt: 'desc' },
            take: limit,
            include: {
                messages: {
                    orderBy: { sequenceNumber: 'desc' },
                    take: 1,
                },
            },
        });

        return conversations as Conversation[];
    }
}

// Export singleton instance
export const conversationService = new ConversationService();
