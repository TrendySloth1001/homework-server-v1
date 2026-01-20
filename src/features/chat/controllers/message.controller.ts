import { Request, Response } from "express";
import * as messageService from "../services/message.service";
import { wsManager } from "../services/websocket.service";

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const { conversationId, content, replyToId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!conversationId || typeof conversationId !== "string") {
      return res.status(400).json({ error: "conversationId is required" });
    }

    if (!content || typeof content !== "string" || content.length === 0) {
      return res.status(400).json({ error: "content is required and cannot be empty" });
    }

    const message = await messageService.sendMessage({
      conversationId: conversationId as string,
      userId,
      content,
      replyToId,
    });

    console.log(` Broadcasting message ${message.id} to conversation ${conversationId}`);
    wsManager.emitNewMessage(conversationId, message);

    return res.status(201).json(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send message";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const conversationId = req.params.conversationId!;
    const limit = req.query.limit as string | undefined;
    const before = req.query.before as string | undefined;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsedLimit = limit ? parseInt(limit) : undefined;
    const messages = await messageService.getMessages({
      conversationId: conversationId as string,
      userId,
      ...(parsedLimit && { limit: parsedLimit }),
      ...(before && { before }),
    });

    return res.json(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch messages";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const markMessageSeen = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const messageId = req.params.messageId!;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await messageService.markMessageSeen(messageId as string, userId);

    // Broadcast message_seen event to all users in the conversation
    if (!result.alreadySeen && result.conversationId) {
      wsManager.emitSeenUpdate(
        result.conversationId,
        result.messageId,
        result.userId,
        result.username
      );
    }

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark message as seen";
    const status = message.includes("not found") ? 404 :
      message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const uploadMedia = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { conversationId, messageId } = req.body;

    const result = await messageService.uploadMedia({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    }, conversationId, messageId);

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload media";
    return res.status(500).json({ error: message });
  }
};

export const sendMediaMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const { conversationId, content, mediaUrl, mediaType, mediaUrls, mediaTypes, replyToId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!conversationId || typeof conversationId !== "string") {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // Support both single and multiple media
    const hasSingleMedia = mediaUrl && mediaType;
    const hasMultipleMedia = mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0;

    if (!hasSingleMedia && !hasMultipleMedia) {
      return res.status(400).json({ error: "Either mediaUrl/mediaType or mediaUrls/mediaTypes is required" });
    }

    if (hasMultipleMedia && (!mediaTypes || !Array.isArray(mediaTypes) || mediaUrls.length !== mediaTypes.length)) {
      return res.status(400).json({ error: "mediaUrls and mediaTypes must be arrays of the same length" });
    }

    const message = await messageService.sendMediaMessage({
      conversationId: conversationId as string,
      userId,
      content,
      mediaUrl,
      mediaType,
      mediaUrls,
      mediaTypes,
      replyToId,
    });

    console.log(`📤 Broadcasting media message ${message.id} to conversation ${conversationId}`);
    wsManager.emitNewMessage(conversationId, message);

    return res.status(201).json(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send media message";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const searchMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const conversationId = req.params.conversationId!;
    const query = req.query.query as string;
    const limit = req.query.limit as string | undefined;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query parameter is required" });
    }

    const parsedLimit = limit ? parseInt(limit) : undefined;
    const messages = await messageService.searchMessages({
      conversationId: conversationId as string,
      userId,
      query,
      ...(parsedLimit && { limit: parsedLimit }),
    });

    return res.json(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search messages";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

export const getSharedMedia = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token
    const conversationId = req.params.conversationId!;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const media = await messageService.getSharedMedia({
      conversationId: conversationId as string,
      userId,
    });

    return res.json(media);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch shared media";
    const status = message.includes("not a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};
