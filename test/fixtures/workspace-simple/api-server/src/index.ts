import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { usersRouter } from "./routes/users";

const app = new Hono();

app.route("/api/users", usersRouter);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});

export default app;
