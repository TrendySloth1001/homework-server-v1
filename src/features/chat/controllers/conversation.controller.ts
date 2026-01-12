import { Request, Response } from "express";
import * as conversationService from "../services/conversation_service";

export const createConversation = async (req: Request, res: Response) => {
  try {
    const { name, creatorId, memberIds, isGroup } = req.body;

    if (!creatorId || typeof creatorId !== "string") {
      return res.status(400).json({ error: "creatorId is required" });
    }

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: "memberIds must be an array" });
    }

    if (isGroup && !name) {
      return res.status(400).json({ error: "name is required for group conversations" });
    }

    const conversation = await conversationService.createConversation({
      name,
      creatorId,
      memberIds,
      isGroup: isGroup || false,
    });

    return res.status(201).json(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create conversation";
    return res.status(500).json({ error: message });
  }
};

export const getUserConversations = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const conversations = await conversationService.getUserConversations(userId);
    return res.json(conversations);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch conversations";
    return res.status(500).json({ error: message });
  }
};

export const getConversationById = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const userId = req.query.userId as string;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId query parameter is required" });
    }

    const conversation = await conversationService.getConversationById(conversationId, userId);
    return res.json(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch conversation";
    const status = message.includes("not a member") ? 403 : 404;
    return res.status(status).json({ error: message });
  }
};

export const checkOrCreateOneToOne = async (req: Request, res: Response) => {
  try {
    const userId1 = (req as any).user?.userId; // Current user from JWT
    const { otherUserId } = req.body;

    if (!userId1) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!otherUserId || typeof otherUserId !== "string") {
      return res.status(400).json({ error: "otherUserId is required" });
    }

    const conversation = await conversationService.checkOrCreateOneToOne(userId1, otherUserId);
    return res.json(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get or create conversation";
    return res.status(500).json({ error: message });
  }
};

export const addMembers = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const { userIds, requesterId } = req.body as { userIds: string[]; requesterId: string };

    if (!requesterId || typeof requesterId !== "string") {
      return res.status(400).json({ error: "requesterId is required" });
    }

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }

    const members = await conversationService.addMembers(conversationId, userIds, requesterId);
    return res.status(201).json(members);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add members";
    const status = message.includes("not found") ? 404 : 
                   message.includes("Unauthorized") || message.includes("Cannot add") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const userId = req.params.userId!;
    const { requesterId } = req.body as { requesterId: string };

    if (!requesterId || typeof requesterId !== "string") {
      return res.status(400).json({ error: "requesterId is required" });
    }

    const result = await conversationService.removeMember(conversationId, userId, requesterId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove member";
    const status = message.includes("not found") ? 404 : 
                   message.includes("Unauthorized") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const updateGroupName = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const { name, requesterId } = req.body as { name: string; requesterId: string };

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    if (!requesterId || typeof requesterId !== "string") {
      return res.status(400).json({ error: "requesterId is required" });
    }

    const conversation = await conversationService.updateGroupName(conversationId, name.trim(), requesterId);
    return res.json(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update group name";
    const status = message.includes("not found") ? 404 : 
                   message.includes("not a member") || message.includes("Cannot update") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getConversationMembers = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const requesterId = req.query.requesterId as string;

    if (!requesterId || typeof requesterId !== "string") {
      return res.status(400).json({ error: "requesterId query parameter is required" });
    }

    const members = await conversationService.getConversationMembers(conversationId, requesterId);
    return res.json(members);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch members";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId!;
    const conversationId = req.query.conversationId as string | undefined;

    const count = await conversationService.getUnreadCount(
      userId,
      conversationId || undefined
    );
    return res.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch unread count";
    return res.status(500).json({ error: message });
  }
};

export const clearConversation = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const { userId } = req.body as { userId: string };

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await conversationService.clearConversation(conversationId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear conversation";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const leaveGroup = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const { userId } = req.body as { userId: string };

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await conversationService.leaveGroup(conversationId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to leave group";
    const status = message.includes("not found") ? 404 : 
                   message.includes("Cannot leave") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const pinConversation = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId!;
    const { userId, isPinned } = req.body as { userId: string; isPinned: boolean };

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    if (typeof isPinned !== "boolean") {
      return res.status(400).json({ error: "isPinned must be a boolean" });
    }

    const result = await conversationService.pinConversation(conversationId, userId, isPinned);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pin conversation";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};
