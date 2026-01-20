import { prisma } from "../../../shared/lib/prisma";
import { UpdateGroupSettingsDTO } from "../types";

// ==================== ADMIN ROLES & PERMISSIONS ====================

/**
 * Updates a member's role in a group conversation.
 * Only admins or the creator can change roles.
 *
 * @param conversationId - The ID of the conversation
 * @param targetUserId - The ID of the user whose role is being updated
 * @param newRole - The new role ('admin' | 'moderator' | 'member')
 * @param requestingUserId - The ID of the user making the request
 * @throws Error if permissions are insufficient or target user/group is invalid
 */
export const updateMemberRole = async (
    conversationId: string,
    targetUserId: string,
    newRole: "admin" | "moderator" | "member",
    requestingUserId: string
) => {
    // Check if requesting user is admin OR creator
    const requestingMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: requestingUserId } },
        include: { conversation: true },
    });

    // Verify group exists (implicitly done via member check, but good to be safe)
    // If member not found, check if they are creator (though unlikely to not be member)
    if (!requestingMember || (requestingMember.role !== "admin" && requestingMember.conversation.createdBy !== requestingUserId)) {
        throw new Error("Only admins or the group creator can change member roles");
    }

    // Check conversation exists and is a group
    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation || !conversation.isGroup) {
        throw new Error("Conversation not found or not a group");
    }

    // Prevent demoting the creator unless there's another admin
    if (conversation.createdBy === targetUserId && newRole !== "admin") {
        const adminCount = await prisma.chatConversationMember.count({
            where: { conversationId, role: "admin" },
        });

        if (adminCount === 1) {
            throw new Error("Cannot demote the last admin. Promote another member first.");
        }
    }

    const updatedMember = await prisma.chatConversationMember.update({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        data: { role: newRole },
        include: {
            user: {
                select: { id: true, displayName: true, avatarUrl: true, username: true },
            },
        },
    });

    return updatedMember;
};

// ==================== GROUP SETTINGS ====================

/**
 * Updates settings for a group conversation.
 *
 * @param conversationId - The ID of the conversation
 * @param userId - The ID of the user making the request
 * @param settings - The settings to update
 */


export const updateGroupSettings = async (
    conversationId: string,
    userId: string,
    settings: UpdateGroupSettingsDTO
) => {
    const member = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation || !conversation.isGroup) {
        throw new Error("Group not found");
    }

    // Check permissions
    if (!member) {
        throw new Error("You are not a member of this group");
    }

    const isCreator = conversation.createdBy === userId;
    const canEdit =
        isCreator ||
        member.role === "admin" ||
        (member.role === "moderator" && conversation.allowMemberSettings) ||
        (member.role === "member" && conversation.allowMemberSettings);

    if (!canEdit) {
        throw new Error("You don't have permission to change group settings");
    }

    // Only admins and creators can change certain settings
    const restrictedSettings = ["adminOnlyMessaging", "approvalRequired", "allowMemberInvite", "allowMemberSettings"];
    const hasRestrictedChanges = restrictedSettings.some((key) => key in settings);

    if (hasRestrictedChanges && !isCreator && member.role !== "admin") {
        throw new Error("Only admins can change these settings");
    }

    const updatedConversation = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: settings,
    });

    return updatedConversation;
};

// ==================== KICK & BAN MEMBERS ====================

/**
 * Kicks a member from a group.
 */
export const kickMember = async (
    conversationId: string,
    targetUserId: string,
    kickedBy: string
) => {
    const kickingMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: kickedBy } },
    });

    const targetMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        include: { user: true },
    });

    if (!kickingMember || (kickingMember.role !== "admin" && kickingMember.role !== "moderator")) {
        throw new Error("Only admins and moderators can kick members");
    }

    if (!targetMember) {
        throw new Error("Target member not found");
    }

    // Can't kick admins unless you're admin
    if (targetMember.role === "admin" && kickingMember.role !== "admin") {
        throw new Error("Only admins can kick other admins");
    }

    // Can't kick yourself
    if (targetUserId === kickedBy) {
        throw new Error("You cannot kick yourself");
    }

    await prisma.chatConversationMember.delete({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });

    // Create system message
    await prisma.message.create({
        data: {
            conversationId,
            userId: kickedBy,
            content: `${targetMember.user.displayName} was removed from the group`,
            messageType: "system_user_left",
        },
    });

    return { success: true, message: "Member kicked successfully" };
};

/**
 * Bans a member from a group.
 */
export const banMember = async (
    conversationId: string,
    targetUserId: string,
    bannedBy: string,
    reason?: string
) => {
    const banningMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: bannedBy } },
    });

    if (!banningMember || (banningMember.role !== "admin" && banningMember.role !== "moderator")) {
        throw new Error("Only admins and moderators can ban members");
    }

    const targetMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        include: { user: true },
    });

    if (!targetMember) {
        throw new Error("Target member not found");
    }

    if (targetMember.role === "admin" && banningMember.role !== "admin") {
        throw new Error("Only admins can ban other admins");
    }

    if (targetUserId === bannedBy) {
        throw new Error("You cannot ban yourself");
    }

    await prisma.chatConversationMember.update({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        data: {
            isBanned: true,
            bannedAt: new Date(),
            bannedBy: bannedBy,
            banReason: reason || null,
        },
    });

    // Create system message
    await prisma.message.create({
        data: {
            conversationId,
            userId: bannedBy,
            content: `${targetMember.user.displayName} was banned from the group${reason ? `: ${reason}` : ""}`,
            messageType: "system_user_left",
        },
    });

    return { success: true, message: "Member banned successfully" };
};

/**
 * Unbans a member from a group.
 */
export const unbanMember = async (
    conversationId: string,
    targetUserId: string,
    unbannedBy: string
) => {
    const unbanningMember = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: unbannedBy } },
    });

    if (!unbanningMember || unbanningMember.role !== "admin") {
        throw new Error("Only admins can unban members");
    }

    const targetMember = await prisma.chatConversationMember.findFirst({
        where: { conversationId, userId: targetUserId, isBanned: true },
    });

    if (!targetMember) {
        throw new Error("Member not found or not banned");
    }

    await prisma.chatConversationMember.update({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        data: {
            isBanned: false,
            bannedAt: null,
            bannedBy: null,
            banReason: null,
        },
    });

    return { success: true, message: "Member unbanned successfully" };
};
