import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { User, ApiResponse } from '@myapp/shared';

const app = new Hono();

const users: User[] = [];

app.get('/users', (c) => {
  const response: ApiResponse<User[]> = { success: true, data: users };
  return c.json(response);
});

app.post('/users', async (c) => {
  const body = await c.req.json();
  const newUser: User = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    role: body.role ?? 'member',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.push(newUser);
  const response: ApiResponse<User> = { success: true, data: newUser };
  return c.json(response, 201);
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`);
});

export default app;
