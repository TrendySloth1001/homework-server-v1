import { prisma } from "../../../shared/lib/prisma";
import crypto from "crypto";
import { wsManager } from './websocket.service';

// ==================== INVITE LINKS ====================

/**
 * Creates a new invite link for a group.
 */
export const createInviteLink = async (
    conversationId: string,
    createdBy: string,
    maxUses?: number,
    expiresInHours?: number
) => {
    const member = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: createdBy } },
    });

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation || !conversation.isGroup) {
        throw new Error("Group not found");
    }

    if (!member) {
        throw new Error("You are not a member of this group");
    }

    // Check permissions
    const canCreateInvite =
        member.role === "admin" ||
        member.role === "moderator" ||
        (member.role === "member" && conversation.allowMemberInvite);

    if (!canCreateInvite) {
        throw new Error("You don't have permission to create invite links");
    }

    const code = crypto.randomBytes(8).toString("hex");
    const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        : null;

    const inviteLink = await prisma.groupInviteLink.create({
        data: {
            conversationId,
            code,
            createdBy,
            maxUses: maxUses || null,
            expiresAt,
        },
    });

    return inviteLink;
};

/**
 * Gets all invite links for a group.
 */
export const getInviteLinks = async (conversationId: string, userId: string) => {
    const member = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
        throw new Error("Only admins and moderators can view invite links");
    }

    const links = await prisma.groupInviteLink.findMany({
        where: { conversationId },
        include: {
            creator: {
                select: { id: true, displayName: true, username: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return links;
};

/**
 * Revokes an invite link.
 */
export const revokeInviteLink = async (
    linkId: string,
    userId: string
) => {
    const link = await prisma.groupInviteLink.findUnique({
        where: { id: linkId },
    });

    if (!link) {
        throw new Error("Invite link not found");
    }

    const member = await prisma.chatConversationMember.findUnique({
        where: {
            conversationId_userId: { conversationId: link.conversationId, userId },
        },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
        throw new Error("Only admins and moderators can revoke invite links");
    }

    await prisma.groupInviteLink.update({
        where: { id: linkId },
        data: { isActive: false },
    });

    return { success: true, message: "Invite link revoked" };
};

/**
 * Joins a group via an invite link.
 */
export const joinViaInviteLink = async (code: string, userId: string) => {
    const link = await prisma.groupInviteLink.findUnique({
        where: { code },
        include: { conversation: true },
    });

    if (!link || !link.isActive) {
        throw new Error("Invalid or inactive invite link");
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
        throw new Error("Invite link has expired");
    }

    if (link.maxUses && link.usedCount >= link.maxUses) {
        throw new Error("Invite link has reached maximum uses");
    }

    // Check if already a member
    const existingMember = await prisma.chatConversationMember.findUnique({
        where: {
            conversationId_userId: { conversationId: link.conversationId, userId },
        },
    });

    if (existingMember) {
        if (existingMember.isBanned) {
            throw new Error("You are banned from this group");
        }
        throw new Error("You are already a member of this group");
    }

    // If approval required, create join request instead
    if (link.conversation.approvalRequired) {
        const existingRequest = await prisma.groupJoinRequest.findUnique({
            where: {
                conversationId_userId: { conversationId: link.conversationId, userId },
            },
        });

        if (existingRequest) {
            if (existingRequest.status === "pending") {
                throw new Error("You already have a pending join request");
            }
        }

        const joinRequest = await prisma.groupJoinRequest.create({
            data: {
                conversationId: link.conversationId,
                userId,
                message: `Joining via invite link: ${code}`,
            },
        });

        return { requiresApproval: true, request: joinRequest };
    }

    // Join directly
    const member = await prisma.chatConversationMember.create({
        data: {
            conversationId: link.conversationId,
            userId,
            role: "member",
        },
        include: {
            user: {
                select: { id: true, displayName: true, avatarUrl: true, username: true },
            },
        },
    });

    // Increment usage count atomically to ALL avoid race conditions
    await prisma.groupInviteLink.update({
        where: { id: link.id },
        data: { usedCount: { increment: 1 } },
    });

    // Create system message
    await prisma.message.create({
        data: {
            conversationId: link.conversationId,
            userId,
            content: `${member.user.displayName} joined via invite link`,
            messageType: "system_user_joined",
        },
    });

    return { requiresApproval: false, member };
};

// ==================== JOIN REQUESTS ====================

/**
 * Creates a request to join a group.
 */
export const createJoinRequest = async (
    conversationId: string,
    userId: string,
    message?: string
) => {
    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation || !conversation.isGroup) {
        throw new Error("Group not found");
    }

    // If user is the creator, add them directly as admin
    if (conversation.createdBy === userId) {
        // ... (Implementation preserved from original)
        // For brevity, assuming creator join case logic is consistent
        const existingMember = await prisma.chatConversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });
        if (existingMember) throw new Error("You are already a member");

        // Add creator as admin member
        const newMember = await prisma.chatConversationMember.create({
            data: { conversationId, userId, role: 'admin' },
            include: { user: { select: { id: true, displayName: true, avatarUrl: true, username: true } } }
        });

        // Broadcast new conversation to the creator via WebSocket
        const fullConversation = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: true } }, creator: true }
        });
        if (fullConversation) wsManager.broadcastNewConversation(fullConversation, userId);

        return {
            id: 'creator-join',
            conversationId,
            userId,
            status: 'approved',
            requiresApproval: false,
            message: 'Creator added as admin',
            user: newMember.user,
            createdAt: new Date()
        };
    }

    // If group doesn't require approval, directly add user as member
    if (!conversation.approvalRequired) {
        const existingMember = await prisma.chatConversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });

        if (existingMember) {
            if (existingMember.isBanned) throw new Error("You are banned from this group");
            throw new Error("You are already a member");
        }

        const newMember = await prisma.chatConversationMember.create({
            data: { conversationId, userId, role: 'member' },
            include: { user: { select: { id: true, displayName: true, avatarUrl: true, username: true } } }
        });

        const fullConversation = await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: true } }, creator: true }
        });
        if (fullConversation) wsManager.broadcastNewConversation(fullConversation, userId);

        return {
            id: 'direct-join',
            conversationId,
            userId,
            status: 'approved',
            requiresApproval: false,
            message: 'Joined public group directly',
            user: newMember.user,
            createdAt: new Date()
        };
    }

    const existingMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (existingMember) {
        if (existingMember.isBanned) throw new Error("You are banned from this group");
        throw new Error("You are already a member");
    }

    const existingRequest = await prisma.groupJoinRequest.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (existingRequest) {
        if (existingRequest.status === "pending") {
            throw new Error("You already have a pending join request");
        } else if (existingRequest.status === "approved") {
            await prisma.groupJoinRequest.delete({ where: { id: existingRequest.id } });
            await prisma.chatConversationMember.create({ data: { conversationId, userId, role: 'member' } });
            throw new Error("You are already a member");
        } else if (existingRequest.status === "rejected") {
            await prisma.groupJoinRequest.delete({ where: { id: existingRequest.id } });
        }
    }

    const request = await prisma.groupJoinRequest.create({
        data: {
            conversationId,
            userId,
            message: message || null,
        },
        include: {
            user: {
                select: { id: true, displayName: true, avatarUrl: true, username: true },
            },
        },
    });

    return { ...request, requiresApproval: true };
};

/**
 * Gets pending join requests for a group.
 */
export const getJoinRequests = async (conversationId: string, userId: string) => {
    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        select: { createdBy: true },
    });

    const isCreator = conversation?.createdBy === userId;

    if (!isCreator) {
        const member = await prisma.chatConversationMember.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
        });

        if (!member || (member.role !== "admin" && member.role !== "moderator")) {
            throw new Error("Only the creator, admins and moderators can view join requests");
        }
    }

    const requests = await prisma.groupJoinRequest.findMany({
        where: { conversationId, status: "pending" },
        include: {
            user: {
                select: { id: true, displayName: true, avatarUrl: true, username: true },
            },
        },
        orderBy: { createdAt: "asc" },
    });

    return requests;
};

/**
 * Responds to a join request (approve/reject).
 */
export const respondToJoinRequest = async (
    requestId: string,
    respondedBy: string,
    approve: boolean
) => {
    const request = await prisma.groupJoinRequest.findUnique({
        where: { id: requestId },
        include: { user: true },
    });

    if (!request) {
        throw new Error("Join request not found");
    }

    if (request.status !== "pending") {
        throw new Error("This request has already been responded to");
    }

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: request.conversationId },
        select: { createdBy: true },
    });

    const isCreator = conversation?.createdBy === respondedBy;

    if (!isCreator) {
        const member = await prisma.chatConversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId: request.conversationId,
                    userId: respondedBy,
                },
            },
        });

        if (!member || (member.role !== "admin" && member.role !== "moderator")) {
            throw new Error("Only the creator, admins and moderators can respond to join requests");
        }
    }

    const updatedRequest = await prisma.groupJoinRequest.update({
        where: { id: requestId },
        data: {
            status: approve ? "approved" : "rejected",
            respondedBy,
            respondedAt: new Date(),
        },
    });

    if (approve) {
        const newMember = await prisma.chatConversationMember.create({
            data: {
                conversationId: request.conversationId,
                userId: request.userId,
                role: "member",
            },
            include: {
                user: {
                    select: { id: true, displayName: true, avatarUrl: true },
                },
            },
        });

        // Create system message
        await prisma.message.create({
            data: {
                conversationId: request.conversationId,
                userId: respondedBy,
                content: `${request.user.displayName} joined the group`,
                messageType: "system_user_joined",
            },
        });

        return { success: true, approved: true, member: newMember };
    }

    return { success: true, approved: false };
};
