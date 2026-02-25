import { Hono } from "hono";
import type { UserProfile, CreateUserInput } from "../models/user";

const usersRouter = new Hono();

const users: UserProfile[] = [];

usersRouter.get("/", (c) => {
  return c.json(users);
});

usersRouter.post("/", async (c) => {
  const body = await c.req.json<CreateUserInput>();
  const newUser: UserProfile = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  return c.json(newUser, 201);
});

usersRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const user = users.find((u) => u.id === id);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(user);
});

export { usersRouter };
