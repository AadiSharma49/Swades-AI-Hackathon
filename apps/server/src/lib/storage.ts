import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@my-better-t-app/env/server";

const UPLOAD_ROOT = path.resolve(env.STORAGE_ROOT, "uploads");

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getSessionUploadDirectory(sessionId: string): string {
  return path.join(UPLOAD_ROOT, sanitizeSegment(sessionId));
}

export function getChunkFilePath(sessionId: string, filename: string): string {
  return path.join(getSessionUploadDirectory(sessionId), sanitizeSegment(filename));
}

export async function ensureUploadDirectories(sessionId: string): Promise<void> {
  await mkdir(getSessionUploadDirectory(sessionId), { recursive: true });
}

export async function chunkFileExists(sessionId: string, filename: string): Promise<boolean> {
  try {
    await access(getChunkFilePath(sessionId, filename));
    return true;
  } catch {
    return false;
  }
}

export async function persistChunkFile(
  sessionId: string,
  filename: string,
  data: Uint8Array,
): Promise<string> {
  await ensureUploadDirectories(sessionId);

  const filePath = getChunkFilePath(sessionId, filename);
  const temporaryPath = `${filePath}.part`;

  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, data);
  await rename(temporaryPath, filePath);

  return filePath;
}
