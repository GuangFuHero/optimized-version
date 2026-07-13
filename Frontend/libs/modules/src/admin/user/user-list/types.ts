export type UserRoleId = 'admin' | 'agency' | 'ngo' | 'volunteer';

export type UserListStatus = 'active' | 'pending' | 'suspended';

export interface UserRoleOption {
  id: UserRoleId;
  label: string;
}

export interface UserListRow {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: UserRoleId;
  status: UserListStatus;
  lastActiveAt: string;
  pendingReview?: boolean;
}
