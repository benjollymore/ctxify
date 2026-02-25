export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function fetchUsers(): Promise<UserProfile[]> {
  const response = await fetch(`${API_URL}/api/users`);
  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchUserById(id: string): Promise<UserProfile> {
  const response = await fetch(`${API_URL}/api/users/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user ${id}: ${response.statusText}`);
  }
  return response.json();
}
