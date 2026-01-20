import { WebSocket } from "ws";
import { prisma } from "../../../shared/lib/prisma";
import { clearPendingNotifications } from "../../notifications/notifications.service";

type ConversationId = string;

const clients: Set<WebSocket> = new Set();
const conversationClients: Map<ConversationId, Set<WebSocket>> = new Map();
const clientConversations: Map<WebSocket, Set<ConversationId>> = new Map();
const clientUserMap: Map<WebSocket, string> = new Map();
// Optimization: Map userId -> Set of WebSockets for O(1) lookup
const userSockets: Map<string, Set<WebSocket>> = new Map();

const addClient = async (ws: WebSocket, userId: string) => {
  clients.add(ws);
  clientConversations.set(ws, new Set());
  clientUserMap.set(ws, userId);

  // Add to userSockets map
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(ws);

  await setUserOnline(userId);
  await broadcastUserStatus(userId, true);

  // Clear any pending notifications when user comes online
  clearPendingNotifications(userId);
};

const removeClient = async (ws: WebSocket) => {
  const userId = clientUserMap.get(ws);
  const conversations = clientConversations.get(ws);

  if (conversations) {
    conversations.forEach((conversationId) => leaveConversation(ws, conversationId));
  }

  clientConversations.delete(ws);
  clientUserMap.delete(ws);
  clients.delete(ws);

  // Remove from userSockets map
  if (userId) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
  }

  if (userId && !isUserOnline(userId)) {
    await setUserOffline(userId);
    await broadcastUserStatus(userId, false);
  }
};

const joinConversation = (ws: WebSocket, conversationId: string) => {
  let room = conversationClients.get(conversationId);
  if (!room) {
    room = new Set();
    conversationClients.set(conversationId, room);
  }
  room.add(ws);

  clientConversations.get(ws)?.add(conversationId);
};

const leaveConversation = (ws: WebSocket, conversationId: string) => {
  const room = conversationClients.get(conversationId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) conversationClients.delete(conversationId);
  }

  clientConversations.get(ws)?.delete(conversationId);
};

const emitNewMessage = async (conversationId: string, message: any) => {
  // Optimization: Only process members who are actually online
  // We get ALL members from DB (needed to check if they are part of the group)

  const { prisma } = require("../../../shared/lib/prisma");

  // 1. Fetch all members with their lastRead status in one go
  // This replaces the need to call getUnreadCount (which fetches member data again)
  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId },
    select: {
      userId: true,
      lastRead: true
    },
  });

  // Filter members to only those who are online
  const onlineMembers = members.filter((member: { userId: string }) => userSockets.has(member.userId));

  if (onlineMembers.length === 0) {
    return; // No one online to notify
  }

  // 2. Calculate unread counts in parallel
  // We can manually run the count query here to avoid the extra overhead of getUnreadCount's internal lookups

  const notifications = await Promise.all(onlineMembers.map(async (member: { userId: string, lastRead: Date | null }) => {
    if (member.userId === message.userId) {
      return { userId: member.userId, type: 'sender' };
    }

    const unreadCount = await prisma.message.count({
      where: {
        conversationId,
        userId: { not: member.userId }, // Don't count own messages
        ...(member.lastRead ? { createdAt: { gt: member.lastRead } } : {})
      }
    });

    return { userId: member.userId, type: 'recipient', unreadCount };
  }));

  // 3. Send to users
  notifications.forEach((note) => {
    if (note.type === 'sender') {
      sendToUser(note.userId, {
        type: "new_message",
        data: message,
      });
    } else {
      sendToUser(note.userId, {
        type: "new_message",
        data: {
          ...message,
          unreadCount: note.unreadCount,
        },
      });
    }
  });
};

const emitTyping = (
  conversationId: string,
  userId: string,
  username: string,
  isTyping: boolean
) => {
  broadcastToConversation(conversationId, {
    type: "typing",
    data: { conversationId, userId, username, isTyping },
  });
};

const emitSeenUpdate = async (
  conversationId: string,
  messageId: string,
  userId: string,
  username: string
) => {
  // Optimization: Filter for online members similar to emitNewMessage
  const { prisma } = require("../../../shared/lib/prisma");

  // 1. Fetch members and lastRead in one go
  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId },
    select: { userId: true, lastRead: true },
  });

  const onlineMembers = members.filter((member: { userId: string }) => userSockets.has(member.userId));

  if (onlineMembers.length === 0) return;

  // 2. Calculate unread counts in parallel
  const updates = await Promise.all(onlineMembers.map(async (member: { userId: string, lastRead: Date | null }) => {
    const unreadCount = await prisma.message.count({
      where: {
        conversationId,
        userId: { not: member.userId },
        ...(member.lastRead ? { createdAt: { gt: member.lastRead } } : {})
      }
    });
    return { userId: member.userId, unreadCount };
  }));

  // 3. Broadcast updates
  updates.forEach((update) => {
    sendToUser(update.userId, {
      type: "message_seen",
      data: {
        conversationId,
        messageId,
        userId,
        username,
        seenAt: new Date().toISOString(),
        unreadCount: update.unreadCount,
      },
    });
  });
};

const getUserId = (ws: WebSocket) => clientUserMap.get(ws);

const sendToUser = (userId: string, message: any) => {
  // Optimization: O(1) lookup instead of O(C) filter scan
  const sockets = userSockets.get(userId);

  if (sockets) {
    const packet = JSON.stringify(message);
    sockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(packet);
      }
    });
  }
};

const send = (ws: WebSocket, message: any) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const sendToClient = (ws: WebSocket, message: any) => send(ws, message);

const broadcastToConversation = (
  conversationId: string,
  event: any,
  excludeWs?: WebSocket
) => {
  const members = conversationClients.get(conversationId);
  if (!members) return;

  const packet = JSON.stringify(event);
  members.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  });
};

const broadcastNewConversation = (conversation: any, targetUserId: string) => {
  // Optimization: use userSockets map
  const userClients = userSockets.get(targetUserId);

  if (userClients) {
    const packet = JSON.stringify({
      type: 'conversation_created',
      data: conversation
    });

    userClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(packet);
      }
    });
  }
};

const setUserOnline = async (userId: string) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastActiveAt: new Date() },
    });
  } catch (err) {
    console.error("setUserOnline error:", err);
  }
};

const setUserOffline = async (userId: string) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, lastActiveAt: new Date() },
    });
  } catch (err) {
    console.error("setUserOffline error:", err);
  }
};

const updateLastActive = async () => {
  const userIds = [...new Set(clientUserMap.values())];
  if (userIds.length === 0) return;

  try {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { lastActiveAt: new Date() },
    });
  } catch (err) {
    console.error("updateLastActive error:", err);
  }
};

const broadcastUserStatus = async (userId: string, isOnline: boolean) => {
  try {
    const convs = await prisma.chatConversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, lastActiveAt: true },
    });

    const eventString = JSON.stringify({
      type: "user_status",
      data: {
        userId,
        username: user?.username,
        isOnline,
        lastActiveAt: user?.lastActiveAt?.toISOString(),
      },
    });

    const uniqueSockets = new Set<WebSocket>();

    for (const c of convs) {
      const clients = conversationClients.get(c.conversationId);
      if (clients) {
        clients.forEach((ws) => uniqueSockets.add(ws));
      }
    }

    uniqueSockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(eventString);
      }
    });

  } catch (err) {
    console.error("broadcastUserStatus error:", err);
  }
};

const isUserOnline = (userId: string) => userSockets.has(userId);

const getOnlineUsers = () => [...userSockets.keys()];

const getUsersOnlineStatus = (userIds: string[]) =>
  prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, isOnline: true, lastActiveAt: true },
  });

const shutdown = () => clearInterval(lastActiveInterval);

const lastActiveInterval = setInterval(() => updateLastActive(), 30000);

export const wsManager = {
  addClient,
  removeClient,
  joinConversation,
  leaveConversation,
  emitNewMessage,
  emitTyping,
  emitSeenUpdate,
  getUserId,
  sendToClient,
  sendToUser,
  broadcastToConversation,
  broadcastNewConversation,
  isUserOnline,
  getOnlineUsers,
  getUsersOnlineStatus,
  shutdown,
};