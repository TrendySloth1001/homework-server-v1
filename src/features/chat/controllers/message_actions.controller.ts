import { Request, Response } from "express";
import * as reactionService from "../services/message_reactions_service";
import * as editService from "../services/message_edit_service";
import * as deleteService from "../services/message_delete_service";
import * as starService from "../services/message_star_service";
import * as actionsService from "../services/message_actions_service";

// ==================== REACTIONS ====================

export const addReaction = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;
    const { emoji } = req.body;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    if (!emoji || typeof emoji !== "string") {
      return res.status(400).json({ error: "Emoji is required" });
    }

    const reaction = await reactionService.addReaction(messageId, userId, emoji);
    return res.json(reaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add reaction";
    const status = message.includes("not found") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const removeReaction = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;
    const emojiParam = req.params.emoji;

    if (!userIdOrUndefined || !messageIdParam || !emojiParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;
    const emoji: string = emojiParam as string;

    const result = await reactionService.removeReaction(messageId, userId, emoji);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove reaction";
    const status = message.includes("not found") ? 404 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getReactions = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const reactions = await reactionService.getMessageReactions(messageId, userId);
    return res.json(reactions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get reactions";
    const status = message.includes("not found") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== EDIT MESSAGE ====================

export const editMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;
    const { content } = req.body;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Content is required" });
    }

    const message = await editService.editMessage(messageId, userId, content);
    return res.json(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit message";
    const status = message.includes("not found") ? 404 :
                   message.includes("only edit your own") ? 403 :
                   message.includes("within") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getEditHistory = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const history = await editService.getMessageEditHistory(messageId, userId);
    return res.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get edit history";
    const status = message.includes("not found") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== DELETE MESSAGE ====================

export const deleteForMe = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const result = await deleteService.deleteMessageForMe(messageId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete message";
    const status = message.includes("not found") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const deleteForEveryone = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const result = await deleteService.deleteMessageForEveryone(messageId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete message";
    const status = message.includes("not found") ? 404 :
                   message.includes("only delete your own") || message.includes("within") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== STAR MESSAGE ====================

export const starMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const result = await starService.starMessage(messageId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to star message";
    const status = message.includes("not found") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const unstarMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    const result = await starService.unstarMessage(messageId, userId);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unstar message";
    return res.status(500).json({ error: message });
  }
};

export const getStarredMessages = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const { conversationId } = req.params;

    if (!userIdOrUndefined) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;

    const messages = conversationId
      ? await starService.getStarredMessages(conversationId as string, userId)
      : await starService.getAllStarredMessages(userId);

    return res.json(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get starred messages";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== FORWARD MESSAGE ====================

export const forwardMessage = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const messageIdParam = req.params.messageId;
    const { conversationIds } = req.body;

    if (!userIdOrUndefined || !messageIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const messageId: string = messageIdParam as string;

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({ error: "conversationIds must be a non-empty array" });
    }

    const result = await actionsService.forwardMessage(messageId, userId, conversationIds);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to forward message";
    const status = message.includes("not found") || message.includes("does not have access") ? 404 :
                   message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== SEARCH MESSAGES ====================

export const searchMessages = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const conversationIdParam = req.params.conversationId;
    const { query, limit, offset } = req.query;

    if (!userIdOrUndefined || !conversationIdParam) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const userId: string = userIdOrUndefined;
    const conversationId: string = conversationIdParam as string;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    const result = await actionsService.searchMessages(
      conversationId,
      userId,
      query,
      limit ? parseInt(limit as string) : 50,
      offset ? parseInt(offset as string) : 0
    );

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search messages";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};
