import { prisma } from "../../../shared/lib/prisma";

// ==================== CREATE POLL ====================

export const createPoll = async (
  messageId: string,
  question: string,
  options: string[],
  allowMultiple: boolean,
  createdBy: string,
  expiresAt?: Date
) => {
  if (!question || question.trim().length === 0) {
    throw new Error("Poll question is required");
  }

  if (!options || options.length < 2) {
    throw new Error("Poll must have at least 2 options");
  }

  if (options.length > 10) {
    throw new Error("Poll cannot have more than 10 options");
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  // Check if user is a member of the conversation
  const member = await prisma.chatConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId: createdBy,
      },
    },
  });

  if (!member) {
    throw new Error("You must be a member of this conversation to create polls");
  }

  const poll = await prisma.poll.create({
    data: {
      messageId,
      question: question.trim(),
      options,
      allowMultiple,
      createdBy,
      ...(expiresAt && { expiresAt }),
    },
    include: {
      creator: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      votes: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  return poll;
};

// ==================== VOTE ON POLL ====================

export const votePoll = async (
  pollId: string,
  userId: string,
  optionIndices: number[]
) => {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      message: true,
      votes: true,
    },
  });

  if (!poll) {
    throw new Error("Poll not found");
  }

  // Check if poll has expired
  if (poll.expiresAt && new Date() > poll.expiresAt) {
    throw new Error("This poll has expired");
  }

  // Validate option indices
  for (const index of optionIndices) {
    if (index < 0 || index >= poll.options.length) {
      throw new Error(`Invalid option index: ${index}`);
    }
  }

  // Check if multiple votes allowed
  if (!poll.allowMultiple && optionIndices.length > 1) {
    throw new Error("This poll does not allow multiple selections");
  }

  // Check if user is a member of the conversation
  const member = await prisma.chatConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: poll.message.conversationId,
        userId,
      },
    },
  });

  if (!member) {
    throw new Error("You must be a member of this conversation to vote");
  }

  // Remove existing votes if changing vote
  await prisma.pollVote.deleteMany({
    where: {
      pollId,
      userId,
    },
  });

  // Create new votes
  const votes = await prisma.pollVote.createMany({
    data: optionIndices.map((optionIndex) => ({
      pollId,
      userId,
      optionIndex,
    })),
  });

  // Return updated poll with votes
  const updatedPoll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      creator: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      votes: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  return updatedPoll;
};

// ==================== GET POLL ====================

export const getPoll = async (pollId: string, userId: string) => {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      message: true,
      creator: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      votes: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!poll) {
    throw new Error("Poll not found");
  }

  // Check if user is a member of the conversation
  const member = await prisma.chatConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: poll.message.conversationId,
        userId,
      },
    },
  });

  if (!member) {
    throw new Error("You must be a member of this conversation to view this poll");
  }

  return poll;
};

// ==================== DELETE POLL ====================

export const deletePoll = async (pollId: string, userId: string) => {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { message: true },
  });

  if (!poll) {
    throw new Error("Poll not found");
  }

  // Check if user is creator or admin/moderator
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: poll.message.conversationId },
  });

  const isCreator = conversation?.createdBy === userId;
  const isPollCreator = poll.createdBy === userId;

  if (!isCreator && !isPollCreator) {
    const member = await prisma.chatConversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: poll.message.conversationId,
          userId,
        },
      },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
      throw new Error("Only the poll creator, group creator, admins and moderators can delete polls");
    }
  }

  await prisma.poll.delete({
    where: { id: pollId },
  });

  return { success: true, message: "Poll deleted successfully" };
};
