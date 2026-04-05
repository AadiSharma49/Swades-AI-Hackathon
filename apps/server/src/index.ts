import { chunks, sessions } from "@my-better-t-app/db";
import { env } from "@my-better-t-app/env/server";
import { serve } from "@hono/node-server";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import { db } from "@my-better-t-app/db";
import { chunksRoute } from "./routes/chunks";

const app = new Hono();
const sessionParamsSchema = z.object({
  id: z.string().uuid(),
});

app.use(logger());
app.use(
  "/*",
  cors({
    allowMethods: ["GET", "POST", "OPTIONS"],
    origin: env.CORS_ORIGIN,
  }),
);

app.route("/api/chunks", chunksRoute);

app.get("/", (c) => {
  return c.json({
    service: "swades-local-chunk-server",
    status: "ok",
  });
});

app.get("/api/sessions", async (c) => {
  const sessionRows = await db.query.sessions.findMany({
    orderBy: [desc(sessions.createdAt)],
  });

  return c.json({
    sessions: sessionRows,
  });
});

app.get("/api/sessions/:id", async (c) => {
  const params = sessionParamsSchema.parse(c.req.param());
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, params.id),
  });

  if (!session) {
    return c.json(
      {
        error: "Session not found",
      },
      404,
    );
  }

  const sessionChunks = await db.query.chunks.findMany({
    orderBy: [desc(chunks.createdAt)],
    where: eq(chunks.sessionId, params.id),
  });

  return c.json({
    ...session,
    chunks: sessionChunks,
  });
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  },
);

export default app;
