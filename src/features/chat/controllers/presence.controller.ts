import { Request, Response } from "express";
import { prisma } from "../../../shared/lib/prisma";
import { wsManager } from "../services/websocket_service";

export const getUserStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        isOnline: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("Get user status error:", error);
    const message = error instanceof Error ? error.message : "Failed to get user status";
    res.status(500).json({ error: message });
  }
};

export const getBatchUserStatus = async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      res.status(400).json({ error: "userIds array is required" });
      return;
    }

    const users = await wsManager.getUsersOnlineStatus(userIds);
    res.json(users);
  } catch (error) {
    console.error("Get batch user status error:", error);
    const message = error instanceof Error ? error.message : "Failed to get users status";
    res.status(500).json({ error: message });
  }
};

export const getOnlineUsers = async (req: Request, res: Response) => {
  try {
    const onlineUserIds = wsManager.getOnlineUsers();

    const users = await prisma.user.findMany({
      where: { id: { in: onlineUserIds } },
      select: {
        id: true,
        username: true,
        isOnline: true,
        lastActiveAt: true,
      },
    });

    res.json(users);
  } catch (error) {
    console.error("Get online users error:", error);
    const message = error instanceof Error ? error.message : "Failed to get online users";
    res.status(500).json({ error: message });
  }
};

export const getConversationMembersStatus = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }

    const members = await prisma.chatConversationMember.findMany({
      where: { conversationId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            isOnline: true,
            lastActiveAt: true,
          },
        },
      },
    });

    const membersStatus = members.map((m: { user: { id: string; username: string | null; isOnline: boolean; lastActiveAt: Date | null; } }) => m.user);
    res.json(membersStatus);
  } catch (error) {
    console.error("Get conversation members status error:", error);
    const message = error instanceof Error ? error.message : "Failed to get members status";
    res.status(500).json({ error: message });
  }
};
