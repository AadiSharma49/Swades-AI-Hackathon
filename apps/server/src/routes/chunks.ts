import { db, chunks, sessions } from "@my-better-t-app/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { chunkFileExists, persistChunkFile } from "../lib/storage";
import { scheduleSessionTranscription } from "../lib/transcription";

const paramsSchema = z.object({
  sessionId: z.string().uuid(),
});

const rawHeaderSchema = z.object({
  chunkId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1).default("audio/webm"),
  sessionId: z.string().uuid(),
  sourceType: z.enum(["mic", "tab"]).default("mic"),
  title: z.string().trim().min(1).max(200),
});

type ParsedUploadPayload = {
  bytes: Uint8Array;
  chunkId: string;
  fileName: string;
  mimeType: string;
  sessionId: string;
  sourceType: "mic" | "tab";
  title: string;
};

async function ensureSession(sessionId: string, title: string, mimeType: string, sourceType: "mic" | "tab") {
  await db
    .insert(sessions)
    .values({
      id: sessionId,
      mimeType,
      sourceType,
      status: "recording",
      title,
    })
    .onConflictDoNothing({
      target: sessions.id,
    });
}

async function parseUploadPayload(request: Request): Promise<ParsedUploadPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionId = formData.get("sessionId");
    const chunkId = formData.get("chunkId");
    const title = formData.get("title");
    const sourceType = formData.get("sourceType");
    const mimeType = formData.get("mimeType");

    if (!(file instanceof File)) {
      throw new Error("Missing audio file");
    }

    const parsed = rawHeaderSchema.parse({
      chunkId,
      fileName: file.name || `${String(chunkId)}.webm`,
      mimeType: mimeType ?? file.type ?? "audio/webm",
      sessionId,
      sourceType,
      title,
    });

    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      ...parsed,
    };
  }

  const parsed = rawHeaderSchema.parse({
    chunkId: request.headers.get("x-chunk-id"),
    fileName: request.headers.get("x-file-name"),
    mimeType: request.headers.get("x-mime-type") ?? "audio/webm",
    sessionId: request.headers.get("x-session-id"),
    sourceType: request.headers.get("x-source-type") ?? "mic",
    title: request.headers.get("x-session-title"),
  });

  return {
    bytes: new Uint8Array(await request.arrayBuffer()),
    ...parsed,
  };
}

export const chunksRoute = new Hono();

chunksRoute.post("/upload", async (c) => {
  try {
    const payload = await parseUploadPayload(c.req.raw);
    const filename = payload.fileName || `${payload.chunkId}.webm`;

    await ensureSession(payload.sessionId, payload.title, payload.mimeType, payload.sourceType);

    const existingChunk = await db.query.chunks.findFirst({
      columns: {
        chunkId: true,
        filename: true,
      },
      where: and(eq(chunks.sessionId, payload.sessionId), eq(chunks.chunkId, payload.chunkId)),
    });

    if (!existingChunk || !(await chunkFileExists(payload.sessionId, existingChunk.filename))) {
      await persistChunkFile(payload.sessionId, filename, payload.bytes);
    }

    await db
      .insert(chunks)
      .values({
        chunkId: payload.chunkId,
        filename,
        mimeType: payload.mimeType,
        sessionId: payload.sessionId,
        sizeBytes: payload.bytes.byteLength,
        status: "uploaded",
        transcriptError: "",
        transcriptText: "",
      })
      .onConflictDoUpdate({
        set: {
          filename,
          mimeType: payload.mimeType,
          sizeBytes: payload.bytes.byteLength,
          status: "uploaded",
          transcriptError: "",
          updatedAt: new Date(),
        },
        target: [chunks.sessionId, chunks.chunkId],
      });

    scheduleSessionTranscription(payload.sessionId);

    return c.json({
      chunkId: payload.chunkId,
      ok: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return c.json(
      {
        error: message,
        ok: false,
      },
      400,
    );
  }
});

chunksRoute.get("/uploaded", async (c) => {
  const parsed = paramsSchema.parse({
    sessionId: c.req.query("sessionId"),
  });

  const uploadedChunks = await db.query.chunks.findMany({
    columns: {
      chunkId: true,
    },
    orderBy: [desc(chunks.createdAt)],
    where: eq(chunks.sessionId, parsed.sessionId),
  });

  return c.json({
    chunkIds: uploadedChunks.map((chunk) => chunk.chunkId),
    ok: true,
  });
});
