import { Router } from "express";
import multer from "multer";
import * as conversationController from "./controllers/conversation.controller";
import * as messageController from "./controllers/message.controller";
import * as presenceController from "./controllers/presence.controller";
import * as messageActionsController from "./controllers/message-actions.controller";
import * as groupManagementController from "./controllers/group-management.controller";
import * as groupDiscoveryController from "./controllers/group-discovery.controller";
import * as pollController from "./controllers/poll.controller";
import * as utilityService from "./services/utility.service";
import { authenticateToken } from "../auth/middleware/auth.middleware";

// Configure multer for memory storage (files stored in memory as Buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images, videos, audio, and documents
    const allowedTypes = /image|video|audio|application\/pdf|application\/msword|application\/vnd/;
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, audio, and documents are allowed.'));
    }
  },
});

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

app.get("/users/mutual-followers", async (req, res) => {
  try {
    const userId = (req as any).user?.userId; // From JWT token

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log('[Chat API] Getting mutual followers for user:', userId);
    const mutualUsers = await utilityService.getMutualFollowers(userId);
    console.log('[Chat API] Found mutual followers:', mutualUsers.length, 'users');
    console.log('[Chat API] Sample user:', mutualUsers[0]);
    return res.json(mutualUsers);
  } catch (error) {
    console.error('[Chat] Failed to fetch mutual followers:', error);
    return res.status(500).json({ error: "Failed to fetch mutual followers" });
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

app.get("/conversations/:conversationId/public", conversationController.getPublicGroupInfo);

app.get("/conversations/:conversationId", conversationController.getConversationById);

app.post("/conversations/one-to-one", conversationController.checkOrCreateOneToOne);

app.post("/conversations/group", conversationController.createGroupConversation);

app.delete("/conversations/:conversationId", conversationController.deleteConversation);

app.post("/conversations/:conversationId/members", conversationController.addMembers);

app.delete("/conversations/:conversationId/members/:userId", conversationController.removeMember);

app.patch("/conversations/:conversationId/name", conversationController.updateGroupName);

app.patch("/conversations/:conversationId/avatar", conversationController.updateGroupAvatar);

app.get("/conversations/:conversationId/members", conversationController.getConversationMembers);

app.post("/conversations/:conversationId/clear", conversationController.clearConversation);

app.post("/conversations/:conversationId/leave", conversationController.leaveGroup);

app.patch("/conversations/:conversationId/draft", conversationController.saveDraft);

app.patch("/conversations/:conversationId/pin", conversationController.pinConversation);

app.post("/messages", messageController.sendMessage);

app.get("/conversations/:conversationId/messages", messageController.getMessages);

app.post("/messages/:messageId/seen", messageController.markMessageSeen);

app.post("/media/upload", upload.single('media'), messageController.uploadMedia);

app.post("/conversations/:conversationId/avatar/upload", upload.single('avatar'), conversationController.uploadGroupAvatar);

app.post("/messages/media", messageController.sendMediaMessage);

app.get("/conversations/:conversationId/messages/search", messageController.searchMessages);

app.post("/users/status/batch", presenceController.getBatchUserStatus);

app.get("/conversations/:conversationId/members/status", presenceController.getConversationMembersStatus);


// Reactions
app.post("/messages/:messageId/reactions", messageActionsController.addReaction);
app.delete("/messages/:messageId/reactions/:emoji", messageActionsController.removeReaction);
app.get("/messages/:messageId/reactions", messageActionsController.getReactions);

// Edit message
app.patch("/messages/:messageId", messageActionsController.editMessage);
app.get("/messages/:messageId/history", messageActionsController.getEditHistory);

// Delete message
app.delete("/messages/:messageId/for-me", messageActionsController.deleteForMe);
app.delete("/messages/:messageId/for-everyone", messageActionsController.deleteForEveryone);

// Star message
app.post("/messages/:messageId/star", messageActionsController.starMessage);
app.delete("/messages/:messageId/star", messageActionsController.unstarMessage);
app.get("/conversations/:conversationId/starred", messageActionsController.getStarredMessages);
app.get("/starred", messageActionsController.getStarredMessages); // All starred messages

// Forward message
app.post("/messages/:messageId/forward", messageActionsController.forwardMessage);

// Shared Media (moved before duplicate search route)
app.get("/conversations/:conversationId/media", messageController.getSharedMedia);




// Admin Roles & Permissions
app.patch("/conversations/:conversationId/members/:targetUserId/role", groupManagementController.updateMemberRole);

// Group Settings
app.patch("/conversations/:conversationId/settings", groupManagementController.updateGroupSettings);

// Kick & Ban Members
app.delete("/conversations/:conversationId/members/:targetUserId/kick", groupManagementController.kickMember);
app.post("/conversations/:conversationId/members/:targetUserId/ban", groupManagementController.banMember);
app.delete("/conversations/:conversationId/members/:targetUserId/ban", groupManagementController.unbanMember);

// Invite Links
app.post("/conversations/:conversationId/invite-links", groupManagementController.createInviteLink);
app.get("/conversations/:conversationId/invite-links", groupManagementController.getInviteLinks);
app.delete("/invite-links/:linkId", groupManagementController.revokeInviteLink);
app.post("/join-via-invite", groupManagementController.joinViaInviteLink);

// Join Requests
app.post("/conversations/:conversationId/join-requests", groupManagementController.createJoinRequest);
app.get("/conversations/:conversationId/join-requests", groupManagementController.getJoinRequests);
app.post("/join-requests/:requestId/respond", groupManagementController.respondToJoinRequest);

// Pinned Messages
app.post("/conversations/:conversationId/messages/:messageId/pin", groupManagementController.pinMessage);
app.delete("/conversations/:conversationId/messages/:messageId/pin", groupManagementController.unpinMessage);
app.get("/conversations/:conversationId/pinned-messages", groupManagementController.getPinnedMessages);

// Announcements
app.post("/conversations/:conversationId/announcements", groupManagementController.sendAnnouncement);
app.get("/conversations/:conversationId/announcements", groupManagementController.getAnnouncements);

// Polls
app.post("/polls", pollController.createPoll);
app.get("/polls/:pollId", pollController.getPoll);
app.post("/polls/:pollId/vote", pollController.votePoll);
app.delete("/polls/:pollId", pollController.deletePoll);

// Member List
app.get("/conversations/:conversationId/members", groupManagementController.getGroupMembers);
app.get("/conversations/:conversationId/banned-members", groupManagementController.getBannedMembers);


// Discover Groups
app.get("/groups/discover", groupDiscoveryController.discoverGroupsHandler);
app.get("/groups/search", groupDiscoveryController.searchGroupsHandler);

export default app;
