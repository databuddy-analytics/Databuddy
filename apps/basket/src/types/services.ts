export interface WebsiteWithOwner {
  id: string;
  domain: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  ownerId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}