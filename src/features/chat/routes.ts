import { Router } from "express";
import * as conversationController from "./controllers/conversation.controller";
import * as messageController from "./controllers/message.controller";
import * as presenceController from "./controllers/presence.controller";
import * as utilityService from "./services/utility_service";
import { authenticateToken } from "../auth/middleware/auth.middleware";

const app = Router();

// Apply authentication middleware to all chat routes
app.use(authenticateToken);

app.post("/users", async (req, res) => {
  const { username } = req.body ?? {};
  const userId = (req as any).user?.userId; // From JWT token

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "username is required" });
  }

  try {
    // Update existing user with username instead of creating new one
    const user = await utilityService.updateUserWithChatInfo(userId, username.trim());
    return res.status(200).json(user);
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "username is already taken" });
    }
    return res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const users = await utilityService.getAllUsers();
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/users/online", presenceController.getOnlineUsers);

app.get("/users/username/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const user = await utilityService.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get("/users/:userId/status", presenceController.getUserStatus);

app.get("/users/:userId/unread-count", conversationController.getUnreadCount);

app.get("/users/:userId/conversations", conversationController.getUserConversations);

app.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await utilityService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.post("/conversations", conversationController.createConversation);

app.get("/conversations/:conversationId", conversationController.getConversationById);

app.post("/conversations/one-to-one", conversationController.checkOrCreateOneToOne);

app.post("/conversations/:conversationId/members", conversationController.addMembers);

app.delete("/conversations/:conversationId/members/:userId", conversationController.removeMember);

app.patch("/conversations/:conversationId/name", conversationController.updateGroupName);

app.get("/conversations/:conversationId/members", conversationController.getConversationMembers);

app.post("/conversations/:conversationId/clear", conversationController.clearConversation);

app.post("/conversations/:conversationId/leave", conversationController.leaveGroup);

app.patch("/conversations/:conversationId/pin", conversationController.pinConversation);

app.post("/messages", messageController.sendMessage);

app.get("/conversations/:conversationId/messages", messageController.getMessages);

app.post("/messages/:messageId/seen", messageController.markMessageSeen);

app.post("/media/upload", messageController.uploadMedia);

app.post("/messages/media", messageController.sendMediaMessage);

app.get("/conversations/:conversationId/messages/search", messageController.searchMessages);

app.post("/users/status/batch", presenceController.getBatchUserStatus);

app.get("/conversations/:conversationId/members/status", presenceController.getConversationMembersStatus);

export default app;
