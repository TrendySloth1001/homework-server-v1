import { WebSocket } from "ws";
import { wsManager } from "../services/websocket_service";
import * as messageService from "../services/message_service";
import * as utilityService from "../services/utility_service";

export const onConnect = async (ws: WebSocket, userId: string) => {
  console.log(`User ${userId} connected`);
  await wsManager.addClient(ws, userId);
  
  wsManager.sendToClient(ws, {
    type: "connected",
    data: { userId, timestamp: new Date().toISOString() },
  });
};

export const onDisconnect = async (ws: WebSocket) => {
  const userId = wsManager.getUserId(ws);
  console.log(`User ${userId} disconnected`);
  await wsManager.removeClient(ws);
};

export const onSendMessage = async (ws: WebSocket, data: {
  conversationId: string;
  userId?: string;
  content: string;
  replyToId?: string;
}) => {
  try {
    const userId = data.userId || wsManager.getUserId(ws);
    if (!userId) {
      throw new Error("User ID not found");
    }

    const { conversationId, content, replyToId } = data;

    if (!content || content.length === 0) {
      throw new Error("Message content cannot be empty");
    }

    console.log(`User ${userId} sending message to conversation ${conversationId}`);

    const message = await messageService.sendMessage({
      conversationId,
      userId,
      content,
      ...(replyToId && { replyToId }),
    });

    console.log(`Message saved with ID ${message.id}, broadcasting to conversation`);

    wsManager.emitNewMessage(conversationId, message);
  } catch (error) {
    console.error("Error sending message:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send message";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};

export const onTyping = async (ws: WebSocket, data: {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}) => {
  try {
    const { conversationId, userId, isTyping } = data;
    if (!conversationId || !userId) {
      throw new Error("Conversation ID and User ID are required");
    }

    const user = await utilityService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    wsManager.emitTyping(conversationId, userId, user.username || userId, isTyping);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to process typing indicator";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};

export const onSeen = async (ws: WebSocket, data: {
  messageId: string;
  userId: string;
  conversationId: string;
}) => {
  try {
    const { messageId, userId, conversationId } = data;
    if (!messageId || !userId || !conversationId) {
      throw new Error("Message ID, User ID, and Conversation ID are required");
    }

    const result = await messageService.markMessageSeen(messageId, userId);

    if (!result.alreadySeen) {
      const user = await utilityService.getUserById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      wsManager.emitSeenUpdate(conversationId, messageId, userId, user.username || userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to mark message as seen";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};

export const onJoinConversation = async (ws: WebSocket, data: {
  conversationId: string;
  userId?: string;
}) => {
  try {
    const userId = data.userId || wsManager.getUserId(ws);
    if (!userId) {
      throw new Error("User ID not found");
    }

    const { conversationId } = data;
    if (!conversationId) {
      throw new Error("Conversation ID is required");
    }

    const isMember = await utilityService.isUserInConversation(conversationId, userId);
    if (!isMember) {
      throw new Error("User is not a member of this conversation");
    }

    wsManager.joinConversation(ws, conversationId);

    const user = await utilityService.getUserById(userId);

    wsManager.broadcastToConversation(conversationId, {
      type: "user_joined",
      data: {
        conversationId,
        userId,
        username: user?.username || "Unknown",
        timestamp: new Date().toISOString(),
      },
    }, ws);

    wsManager.sendToClient(ws, {
      type: "conversation_joined",
      data: { conversationId },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to join conversation";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};

export const onLeaveConversation = async (ws: WebSocket, data: {
  conversationId: string;
  userId?: string;
}) => {
  try {
    const userId = data.userId || wsManager.getUserId(ws);
    if (!userId) {
      throw new Error("User ID not found");
    }

    const { conversationId } = data;
    if (!conversationId) {
      throw new Error("Conversation ID is required");
    }

    const user = await utilityService.getUserById(userId);

    wsManager.broadcastToConversation(conversationId, {
      type: "user_left",
      data: {
        conversationId,
        userId,
        username: user?.username || "Unknown",
        timestamp: new Date().toISOString(),
      },
    }, ws);
    
    wsManager.leaveConversation(ws, conversationId);

    wsManager.sendToClient(ws, {
      type: "conversation_left",
      data: { conversationId },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to leave conversation";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};

export const parseIncomingMessage = (raw: string): any => {
  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      throw new Error("Invalid message format");
    }

    return parsed;
  } catch (error) {
    throw new Error("Invalid JSON");
  }
};

export const handleIncomingMessage = async (ws: WebSocket, raw: string) => {
  try {
    const message = parseIncomingMessage(raw);

    if (!message.data || typeof message.data !== "object") {
      throw new Error("Message data is required");
    }

    switch (message.type) {
      case "join_conversation":
        await onJoinConversation(ws, message.data);
        break;
      case "leave_conversation":
        onLeaveConversation(ws, message.data);
        break;
      case "send_message":
        await onSendMessage(ws, message.data);
        break;
      case "typing":
        await onTyping(ws, message.data);
        break;
      case "seen":
        await onSeen(ws, message.data);
        break;
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unexpected error";
    wsManager.sendToClient(ws, {
      type: "error",
      data: { message: errorMessage },
    });
  }
};
