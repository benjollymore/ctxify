import type { User, ApiResponse } from "@myapp/shared";

const API_BASE = "/api";

export async function getUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users`);
  const json: ApiResponse<User[]> = await res.json();
  if (!json.success) {
    throw new Error(json.error);
  }
  return json.data;
}

export function renderUserList(users: User[]): string {
  return users
    .map((user) => `<div class="user-card">${user.name} (${user.email})</div>`)
    .join("\n");
}
