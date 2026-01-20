export interface CreateConversationDTO {
    name?: string;
    creatorId: string;
    memberIds: string[];
    isGroup?: boolean;
}

export interface CreateGroupConversationDTO {
    name: string;
    creatorId: string;
    memberIds: string[];
}

export interface UpdateGroupSettingsDTO {
    name?: string;
    description?: string;
    rules?: string;
    adminOnlyMessaging?: boolean;
    approvalRequired?: boolean;
    allowMemberInvite?: boolean;
    allowMemberSettings?: boolean;
}

export interface CreateInviteLinkDTO {
    conversationId: string;
    createdBy: string;
    maxUses?: number;
    expiresInHours?: number;
}
