import { prisma } from "../../../shared/lib/prisma";

interface DiscoverableGroup {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  isPublic: boolean;
  approvalRequired: boolean;
  createdBy: string;
  creator: {
    displayName: string;
    avatarUrl: string | null;
    username: string | null;
  };
  isMember: boolean;
  hasRequestedJoin: boolean;
}

export const discoverGroups = async (
  userId: string,
  category?: string,
  search?: string,
  limit: number = 20,
  offset: number = 0
): Promise<DiscoverableGroup[]> => {
  // Build where clause
  const whereClause: any = {
    isGroup: true,
    // Only show groups that don't require approval OR are public
    OR: [
      { approvalRequired: false },
      { approvalRequired: true } // We'll filter by membership later
    ]
  };

  // Add search filter
  if (search) {
    whereClause.AND = [
      {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      }
    ];
  }

  // Fetch groups with member count
  const groups = await prisma.chatConversation.findMany({
    where: whereClause,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              username: true
            }
          }
        }
      },
      creator: {
        select: {
          displayName: true,
          avatarUrl: true,
          username: true
        }
      },
      joinRequests: {
        where: {
          userId,
          status: 'pending'
        }
      }
    },
    take: limit,
    skip: offset,
    orderBy: [
      { createdAt: 'desc' }
    ]
  });

  // Filter by category if specified
  let filteredGroups = groups;
  if (category === 'teachers') {
    // Filter groups created by teachers
    const teacherIds = await prisma.teacherProfile.findMany({
      select: { userId: true }
    });
    const teacherUserIds = new Set(teacherIds.map(t => t.userId));
    filteredGroups = groups.filter(g => teacherUserIds.has(g.createdBy));
  }

  // Map to discoverable format
  return filteredGroups.map(group => {
    const isMember = group.members.some(m => m.userId === userId);
    const hasRequestedJoin = group.joinRequests.length > 0;

    return {
      id: group.id,
      name: group.name || 'Unnamed Group',
      description: group.description,
      avatarUrl: group.avatarUrl,
      memberCount: group.members.length,
      isPublic: !group.approvalRequired,
      approvalRequired: group.approvalRequired || false,
      createdBy: group.createdBy,
      creator: {
        displayName: group.creator?.displayName || 'Unknown',
        avatarUrl: group.creator?.avatarUrl || null,
        username: group.creator?.username || null
      },
      isMember,
      hasRequestedJoin
    };
  });
};

export const searchGroups = async (
  userId: string,
  query: string,
  limit: number = 20
): Promise<DiscoverableGroup[]> => {
  return discoverGroups(userId, undefined, query, limit, 0);
};
