// Message payload types
export interface MessagePayload {
  id: string;
  conversationId: string;
  userId: string;
  username: string;
  content: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  createdAt: string;
}

export interface SeenByInfo {
  userId: string;
  username: string;
  seenAt: string;
}

export interface MessageWithSeen extends MessagePayload {
  seenBy: SeenByInfo[];
}

// Incoming WebSocket message types
export type IncomingClientMessage =
  | {
      type: "join_conversation";
      data: {
        conversationId: string;
        userId: string;
      };
    }
  | {
      type: "leave_conversation";
      data: {
        conversationId: string;
      };
    }
  | {
      type: "send_message";
      data: {
        conversationId: string;
        userId: string;
        content: string;
      };
    }
  | {
      type: "typing";
      data: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
      };
    }
  | {
      type: "seen";
      data: {
        messageId: string;
        userId: string;
        conversationId: string;
      };
    };

// Outgoing WebSocket message types
export type ServerMessage =
  | {
      type: "connected";
      data: {
        userId: string;
        timestamp: string;
      };
    }
  | {
      type: "conversation_joined";
      data: {
        conversationId: string;
      };
    }
  | {
      type: "conversation_left";
      data: {
        conversationId: string;
      };
    }
  | {
      type: "new_message";
      data: MessagePayload;
    }
  | {
      type: "typing";
      data: {
        conversationId: string;
        userId: string;
        username: string;
        isTyping: boolean;
      };
    }
  | {
      type: "message_seen";
      data: {
        conversationId: string;
        messageId: string;
        userId: string;
        username: string;
        seenAt: string;
      };
    }
  | {
      type: "error";
      data: {
        message: string;
      };
    };

// Legacy types for backward compatibility (if needed)
export interface ChatMessagePayload {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}
