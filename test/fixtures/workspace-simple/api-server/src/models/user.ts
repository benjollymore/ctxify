export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  avatarUrl?: string;
}
