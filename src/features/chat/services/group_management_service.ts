import { prisma } from "../../../shared/lib/prisma";
import crypto from "crypto";

// ==================== ADMIN ROLES & PERMISSIONS ====================

export const updateMemberRole = async (
  conversationId: string,
  targetUserId: string,
  newRole: "admin" | "moderator" | "member",
  requestingUserId: string
) => {
  // Check if requesting user is admin
  const requestingMember = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: requestingUserId } },
  });

  if (!requestingMember || requestingMember.role !== "admin") {
    throw new Error("Only admins can change member roles");
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

export const updateGroupSettings = async (
  conversationId: string,
  userId: string,
  settings: {
    name?: string;
    description?: string;
    rules?: string;
    adminOnlyMessaging?: boolean;
    approvalRequired?: boolean;
    allowMemberInvite?: boolean;
    allowMemberSettings?: boolean;
  }
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

// ==================== INVITE LINKS ====================

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

  // Increment usage count
  await prisma.groupInviteLink.update({
    where: { id: link.id },
    data: { usedCount: link.usedCount + 1 },
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

  if (!conversation.approvalRequired) {
    throw new Error("This group does not require approval to join");
  }

  const existingMember = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (existingMember) {
    if (existingMember.isBanned) {
      throw new Error("You are banned from this group");
    }
    throw new Error("You are already a member");
  }

  const existingRequest = await prisma.groupJoinRequest.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (existingRequest && existingRequest.status === "pending") {
    throw new Error("You already have a pending join request");
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

  return request;
};

export const getJoinRequests = async (conversationId: string, userId: string) => {
  console.log("🔍 getJoinRequests called with:", { conversationId, userId });
  
  // Check if user is creator
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true },
  });

  console.log("📌 Conversation found:", conversation);
  const isCreator = conversation?.createdBy === userId;
  console.log("👤 Is creator?", isCreator);

  if (!isCreator) {
    const member = await prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    console.log("👥 Member record:", member);

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
      console.log("❌ Permission denied - not creator, admin, or moderator");
      throw new Error("Only the creator, admins and moderators can view join requests");
    }
    console.log("✅ Permission granted - user is admin/moderator");
  } else {
    console.log("✅ Permission granted - user is creator");
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

  // Check if user is creator
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

// ==================== PINNED MESSAGES ====================

export const pinMessage = async (
  conversationId: string,
  messageId: string,
  pinnedBy: string
) => {
  // Check if user is creator
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true },
  });

  const isCreator = conversation?.createdBy === pinnedBy;

  if (!isCreator) {
    const member = await prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: pinnedBy } },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
      throw new Error("Only the creator, admins and moderators can pin messages");
    }
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message || message.conversationId !== conversationId) {
    throw new Error("Message not found in this conversation");
  }

  const existingPin = await prisma.pinnedMessage.findUnique({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  if (existingPin) {
    throw new Error("Message is already pinned");
  }

  const pinnedMessage = await prisma.pinnedMessage.create({
    data: {
      conversationId,
      messageId,
      pinnedBy,
    },
    include: {
      message: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  return pinnedMessage;
};

export const unpinMessage = async (
  conversationId: string,
  messageId: string,
  userId: string
) => {
  // Check if user is creator
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
      throw new Error("Only the creator, admins and moderators can unpin messages");
    }
  }

  const pinnedMessage = await prisma.pinnedMessage.findUnique({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  if (!pinnedMessage) {
    throw new Error("Message is not pinned");
  }

  await prisma.pinnedMessage.delete({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  return { success: true, message: "Message unpinned successfully" };
};

export const getPinnedMessages = async (conversationId: string, userId: string) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member) {
    throw new Error("You are not a member of this conversation");
  }

  const pinnedMessages = await prisma.pinnedMessage.findMany({
    where: { conversationId },
    include: {
      message: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
      user: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: { pinnedAt: "desc" },
  });

  return pinnedMessages;
};

// ==================== ANNOUNCEMENTS ====================

export const sendAnnouncement = async (
  conversationId: string,
  userId: string,
  content: string
) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member || (member.role !== "admin" && member.role !== "moderator")) {
    throw new Error("Only admins and moderators can send announcements");
  }

  const announcement = await prisma.message.create({
    data: {
      conversationId,
      userId,
      content,
      messageType: "announcement",
      isAnnouncement: true,
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return announcement;
};

export const getAnnouncements = async (conversationId: string, userId: string) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member) {
    throw new Error("You are not a member of this conversation");
  }

  const announcements = await prisma.message.findMany({
    where: { conversationId, isAnnouncement: true },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return announcements;
};

// ==================== MEMBER LIST ====================

export const getGroupMembers = async (
  conversationId: string,
  userId: string,
  search?: string
) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member) {
    throw new Error("You are not a member of this conversation");
  }

  const whereClause: any = {
    conversationId,
    isBanned: false,
  };

  if (search) {
    whereClause.user = {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const members = await prisma.chatConversationMember.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          username: true,
          isOnline: true,
          lastActiveAt: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  return members;
};

export const getBannedMembers = async (conversationId: string, userId: string) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member || member.role !== "admin") {
    throw new Error("Only admins can view banned members");
  }

  const bannedMembers = await prisma.chatConversationMember.findMany({
    where: { conversationId, isBanned: true },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true, username: true },
      },
      banner: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: { bannedAt: "desc" },
  });

  return bannedMembers;
};
