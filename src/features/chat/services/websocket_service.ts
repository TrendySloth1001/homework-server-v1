import { WebSocket } from "ws";
import { prisma } from "../../../shared/lib/prisma";
import { clearPendingNotifications } from "../../notifications/notifications.service";

type ConversationId = string;

const clients: Set<WebSocket> = new Set();
const conversationClients: Map<ConversationId, Set<WebSocket>> = new Map();
const clientConversations: Map<WebSocket, Set<ConversationId>> = new Map();
const clientUserMap: Map<WebSocket, string> = new Map();

const addClient = async (ws: WebSocket, userId: string) => {
  clients.add(ws);
  clientConversations.set(ws, new Set());
  clientUserMap.set(ws, userId);

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
  // Get all members of the conversation
  const { prisma } = require("../../../shared/lib/prisma");
  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  // Send message with unread count to each member
  for (const member of members) {
    if (member.userId === message.userId) {
      // Sender gets the message without unread count change
      sendToUser(member.userId, {
        type: "new_message",
        data: message,
      });
    } else {
      // Calculate unread count for this specific user
      const { getUnreadCount } = require("./conversation_service");
      const unreadCount = await getUnreadCount(member.userId, conversationId);
      
      sendToUser(member.userId, {
        type: "new_message",
        data: {
          ...message,
          unreadCount, // Include unread count for this conversation
        },
      });
    }
  }
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
  // Get all members of the conversation
  const { prisma } = require("../../../shared/lib/prisma");
  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  // Calculate and send updated unread count to each member
  const { getUnreadCount } = require("./conversation_service");
  
  for (const member of members) {
    const unreadCount = await getUnreadCount(member.userId, conversationId);
    
    sendToUser(member.userId, {
      type: "message_seen",
      data: {
        conversationId,
        messageId,
        userId,
        username,
        seenAt: new Date().toISOString(),
        unreadCount, // Include updated unread count
      },
    });
  }
};

const getUserId = (ws: WebSocket) => clientUserMap.get(ws);

const sendToUser = (userId: string, message: any) => {
  const userClients = Array.from(clientUserMap.entries())
    .filter(([_, uid]) => uid === userId)
    .map(([ws, _]) => ws);

  const packet = JSON.stringify(message);
  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  });
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
  // Find all WebSocket connections for the target user
  const userClients = Array.from(clientUserMap.entries())
    .filter(([_, userId]) => userId === targetUserId)
    .map(([ws, _]) => ws);

  const packet = JSON.stringify({
    type: 'conversation_created',
    data: conversation
  });

  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(packet);
    }
  });
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

const isUserOnline = (userId: string) => [...clientUserMap.values()].includes(userId);

const getOnlineUsers = () => [...new Set(clientUserMap.values())];

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