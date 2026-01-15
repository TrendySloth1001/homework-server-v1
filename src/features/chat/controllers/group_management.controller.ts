import { Request, Response } from "express";
import * as groupManagementService from "../services/group_management_service";

// ==================== ADMIN ROLES & PERMISSIONS ====================

export const updateMemberRole = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const targetUserIdParam = req.params.targetUserId;
    const { role } = req.body;

    if (!userIdOrUndefined || !conversationIdParam || !targetUserIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const targetUserId: string = targetUserIdParam;

    if (!role || !["admin", "moderator", "member"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const updatedMember = await groupManagementService.updateMemberRole(
      conversationId,
      targetUserId,
      role,
      userId
    );

    return res.json(updatedMember);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update member role";
    const status = message.includes("permission") || message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== GROUP SETTINGS ====================

export const updateGroupSettings = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const updatedConversation = await groupManagementService.updateGroupSettings(
      conversationId,
      userId,
      req.body
    );

    return res.json(updatedConversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update group settings";
    const status = message.includes("permission") || message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== KICK & BAN MEMBERS ====================

export const kickMember = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const targetUserIdParam = req.params.targetUserId;

    if (!userIdOrUndefined || !conversationIdParam || !targetUserIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const targetUserId: string = targetUserIdParam;

    const result = await groupManagementService.kickMember(
      conversationId,
      targetUserId,
      userId
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to kick member";
    const status = message.includes("Only") || message.includes("cannot") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const banMember = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const targetUserIdParam = req.params.targetUserId;
    const { reason } = req.body;

    if (!userIdOrUndefined || !conversationIdParam || !targetUserIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const targetUserId: string = targetUserIdParam;

    const result = await groupManagementService.banMember(
      conversationId,
      targetUserId,
      userId,
      reason
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ban member";
    const status = message.includes("Only") || message.includes("cannot") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const unbanMember = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const targetUserIdParam = req.params.targetUserId;

    if (!userIdOrUndefined || !conversationIdParam || !targetUserIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const targetUserId: string = targetUserIdParam;

    const result = await groupManagementService.unbanMember(
      conversationId,
      targetUserId,
      userId
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unban member";
    const status = message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== INVITE LINKS ====================

export const createInviteLink = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const { maxUses, expiresInHours } = req.body;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const inviteLink = await groupManagementService.createInviteLink(
      conversationId,
      userId,
      maxUses,
      expiresInHours
    );

    return res.json(inviteLink);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invite link";
    const status = message.includes("permission") || message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getInviteLinks = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const links = await groupManagementService.getInviteLinks(conversationId, userId);

    return res.json(links);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get invite links";
    const status = message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const revokeInviteLink = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const linkIdParam = req.params.linkId;

    if (!userIdOrUndefined || !linkIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const linkId: string = linkIdParam;

    const result = await groupManagementService.revokeInviteLink(linkId, userId);

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke invite link";
    const status = message.includes("Only") ? 403 : 404;
    return res.status(status).json({ error: message });
  }
};

export const joinViaInviteLink = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const { code } = req.body;

    if (!userIdOrUndefined) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!code) {
      return res.status(400).json({ error: "Invite code is required" });
    }

    const userId: string = userIdOrUndefined;

    const result = await groupManagementService.joinViaInviteLink(code, userId);

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join via invite link";
    const status = message.includes("Invalid") || message.includes("expired") ? 400 : 
                   message.includes("banned") || message.includes("already") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== JOIN REQUESTS ====================

export const createJoinRequest = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const { message } = req.body;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const request = await groupManagementService.createJoinRequest(
      conversationId,
      userId,
      message
    );

    return res.json(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create join request";
    console.error('[createJoinRequest Controller] Error:', message);
    const status = message.includes("banned") || message.includes("already") ? 403 : 
                   message.includes("not found") || message.includes("does not require") ? 400 : 500;
    console.log('[createJoinRequest Controller] Returning status:', status);
    return res.status(status).json({ error: message });
  }
};

export const getJoinRequests = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const requests = await groupManagementService.getJoinRequests(conversationId, userId);

    return res.json(requests);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get join requests";
    const status = message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const respondToJoinRequest = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const requestIdParam = req.params.requestId;
    const { approve } = req.body;

    if (!userIdOrUndefined || !requestIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (typeof approve !== "boolean") {
      return res.status(400).json({ error: "approve field is required (true/false)" });
    }

    const userId: string = userIdOrUndefined;
    const requestId: string = requestIdParam;

    const result = await groupManagementService.respondToJoinRequest(
      requestId,
      userId,
      approve
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to respond to join request";
    const status = message.includes("Only") ? 403 : 
                   message.includes("not found") || message.includes("already") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== PINNED MESSAGES ====================

export const pinMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !conversationIdParam || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const messageId: string = messageIdParam;

    const pinnedMessage = await groupManagementService.pinMessage(
      conversationId,
      messageId,
      userId
    );

    return res.json(pinnedMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pin message";
    const status = message.includes("Only") ? 403 : 
                   message.includes("not found") || message.includes("already") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
};

export const unpinMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !conversationIdParam || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;
    const messageId: string = messageIdParam;

    const result = await groupManagementService.unpinMessage(
      conversationId,
      messageId,
      userId
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unpin message";
    const status = message.includes("Only") ? 403 : 
                   message.includes("not") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getPinnedMessages = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const pinnedMessages = await groupManagementService.getPinnedMessages(
      conversationId,
      userId
    );

    return res.json(pinnedMessages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get pinned messages";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== ANNOUNCEMENTS ====================

export const sendAnnouncement = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const { content } = req.body;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Content is required" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const announcement = await groupManagementService.sendAnnouncement(
      conversationId,
      userId,
      content
    );

    return res.json(announcement);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send announcement";
    const status = message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getAnnouncements = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const announcements = await groupManagementService.getAnnouncements(
      conversationId,
      userId
    );

    return res.json(announcements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get announcements";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== MEMBER LIST ====================

export const getGroupMembers = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const { search } = req.query;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const members = await groupManagementService.getGroupMembers(
      conversationId,
      userId,
      search as string | undefined
    );

    return res.json(members);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get group members";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getBannedMembers = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam;

    const bannedMembers = await groupManagementService.getBannedMembers(
      conversationId,
      userId
    );

    return res.json(bannedMembers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get banned members";
    const status = message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};
