import { Request, Response } from "express";
import * as pollService from "../services/poll_service";

// ==================== CREATE POLL ====================

export const createPoll = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const { messageId, question, options, allowMultiple, expiresAt } = req.body;

    if (!userIdOrUndefined) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!messageId || !question || !options) {
      return res.status(400).json({ error: "messageId, question, and options are required" });
    }

    const userId: string = userIdOrUndefined;
    const expiresAtDate = expiresAt ? new Date(expiresAt) : undefined;

    const poll = await pollService.createPoll(
      messageId,
      question,
      options,
      allowMultiple || false,
      userId,
      expiresAtDate
    );

    return res.status(201).json(poll);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create poll";
    const status = message.includes("not found") || message.includes("must have") ? 400 : 
                   message.includes("must be a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== VOTE ON POLL ====================

export const votePoll = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const pollId = req.params.pollId;
    const { optionIndices } = req.body;

    if (!userIdOrUndefined || !pollId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!optionIndices || !Array.isArray(optionIndices)) {
      return res.status(400).json({ error: "optionIndices array is required" });
    }

    const userId: string = userIdOrUndefined;

    const poll = await pollService.votePoll(pollId, userId, optionIndices);

    return res.json(poll);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to vote on poll";
    const status = message.includes("not found") || message.includes("Invalid") || message.includes("expired") ? 400 : 
                   message.includes("must be a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== GET POLL ====================

export const getPoll = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const pollId = req.params.pollId;

    if (!userIdOrUndefined || !pollId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;

    const poll = await pollService.getPoll(pollId, userId);

    return res.json(poll);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get poll";
    const status = message.includes("not found") ? 404 : 
                   message.includes("must be a member") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};

// ==================== DELETE POLL ====================

export const deletePoll = async (req: Request, res: Response) => {
  try {
    const userIdOrUndefined = (req as any).user?.userId;
    const pollId = req.params.pollId;

    if (!userIdOrUndefined || !pollId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId: string = userIdOrUndefined;

    const result = await pollService.deletePoll(pollId, userId);

    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete poll";
    const status = message.includes("not found") ? 404 : 
                   message.includes("Only") ? 403 : 500;
    return res.status(status).json({ error: message });
  }
};
