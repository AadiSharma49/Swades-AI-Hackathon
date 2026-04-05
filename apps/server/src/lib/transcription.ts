import { spawn } from "node:child_process";
import path from "node:path";

import { db, chunks, sessions } from "@my-better-t-app/db";
import { asc, eq } from "drizzle-orm";

import { env } from "@my-better-t-app/env/server";

const processingSessions = new Map<string, Promise<void>>();
const scriptPath = path.resolve(process.cwd(), "src", "scripts", "transcribe.py");

function runPythonTranscription(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      env.PYTHON_PATH,
      ["-u", scriptPath, "--file", filePath, "--model", env.WHISPER_MODEL],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Python transcription failed: ${error.message}`));
    });

    child.on("close", (code) => {
      const payloadText = stdout.trim();
      if (payloadText) {
        try {
          const payload = JSON.parse(payloadText) as {
            error?: string;
            ok?: boolean;
            text?: string;
          };

          if (payload.ok) {
            resolve((payload.text ?? "").trim());
            return;
          }

          const stderrMessage = stderr.trim();
          const message =
            payload.error ?? (stderrMessage.length > 0 ? stderrMessage : `Transcription exited with code ${code}`);
          reject(new Error(message));
          return;
        } catch {
          if (code === 0) {
            resolve(payloadText);
            return;
          }
        }
      }

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Transcription exited with code ${code}`));
        return;
      }

      resolve(payloadText);
    });
  });
}

async function rebuildSessionTranscript(sessionId: string): Promise<void> {
  const chunkRows = await db.query.chunks.findMany({
    orderBy: [asc(chunks.createdAt)],
    where: eq(chunks.sessionId, sessionId),
  });

  const transcript = chunkRows
    .map((chunk) => chunk.transcriptText.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  await db
    .update(sessions)
    .set({
      transcript,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

async function processPendingChunks(sessionId: string): Promise<void> {
  const chunkRows = await db.query.chunks.findMany({
    orderBy: [asc(chunks.createdAt)],
    where: eq(chunks.sessionId, sessionId),
  });

  for (const chunk of chunkRows) {
    if (chunk.transcriptText.trim().length > 0) {
      continue;
    }

    const filePath = path.resolve(env.STORAGE_ROOT, "uploads", sessionId, chunk.filename);
    try {
      const transcriptText = await runPythonTranscription(filePath);

      await db
        .update(chunks)
        .set({
          transcriptError: "",
          transcriptText,
          updatedAt: new Date(),
        })
        .where(eq(chunks.id, chunk.id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 4000) : "Unknown transcription error";

      await db
        .update(chunks)
        .set({
          transcriptError: message,
          updatedAt: new Date(),
        })
        .where(eq(chunks.id, chunk.id));

      console.error(`Transcription failed for chunk ${chunk.chunkId}: ${message}`);
    }
  }

  await rebuildSessionTranscript(sessionId);
}

export function scheduleSessionTranscription(sessionId: string): void {
  const existing = processingSessions.get(sessionId) ?? Promise.resolve();
  const next = existing
    .catch(() => undefined)
    .then(() => processPendingChunks(sessionId))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Session transcription queue failed for ${sessionId}: ${message}`);
    })
    .finally(() => {
      if (processingSessions.get(sessionId) === next) {
        processingSessions.delete(sessionId);
      }
    });

  processingSessions.set(sessionId, next);
}
