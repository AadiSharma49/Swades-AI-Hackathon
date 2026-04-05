const SESSION_META_FILE = "session.json";

export type SessionSource = "mic" | "tab";

export type StoredSession = {
  createdAt: string;
  id: string;
  mimeType: string;
  sourceType: SessionSource;
  title: string;
};

export type StoredChunk = {
  chunkId: string;
  file: File;
  fileName: string;
  sessionId: string;
};

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type FileSystemDirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  const storageManager = navigator.storage as StorageManagerWithDirectory;
  if (!storageManager.getDirectory) {
    throw new Error("OPFS is not available in this browser.");
  }

  return storageManager.getDirectory();
}

async function getSessionsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDirectory();
  return root.getDirectoryHandle("reliable-recorder", {
    create: true,
  });
}

async function getSessionDirectory(sessionId: string, create = true): Promise<FileSystemDirectoryHandle> {
  const sessionsDirectory = await getSessionsDirectory();
  return sessionsDirectory.getDirectoryHandle(sessionId, {
    create,
  });
}

async function writeJsonFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  value: unknown,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
}

async function readJsonFile<T>(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<T | null> {
  try {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function safeRemoveEntry(
  directoryHandle: FileSystemDirectoryHandle,
  name: string,
  recursive = false,
): Promise<void> {
  try {
    await directoryHandle.removeEntry(name, {
      recursive,
    });
  } catch {
    return;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  const sessionDirectory = await getSessionDirectory(session.id);
  await writeJsonFile(sessionDirectory, SESSION_META_FILE, session);
}

export async function readSession(sessionId: string): Promise<StoredSession | null> {
  try {
    const sessionDirectory = await getSessionDirectory(sessionId, false);
    return readJsonFile<StoredSession>(sessionDirectory, SESSION_META_FILE);
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<StoredSession[]> {
  const sessionsDirectory = (await getSessionsDirectory()) as FileSystemDirectoryHandleWithEntries;
  const sessionList: StoredSession[] = [];

  for await (const [, entry] of sessionsDirectory.entries()) {
    if (entry.kind !== "directory") {
      continue;
    }

    const meta = await readJsonFile<StoredSession>(
      entry as FileSystemDirectoryHandle,
      SESSION_META_FILE,
    );
    if (meta) {
      sessionList.push(meta);
    }
  }

  return sessionList.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveChunk(
  sessionId: string,
  chunkId: string,
  blob: Blob,
  extension = "webm",
): Promise<string> {
  const sessionDirectory = await getSessionDirectory(sessionId);
  const fileName = `${chunkId}.${extension}`;
  const fileHandle = await sessionDirectory.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  return fileName;
}

export async function readChunk(sessionId: string, fileName: string): Promise<File | null> {
  try {
    const sessionDirectory = await getSessionDirectory(sessionId, false);
    const fileHandle = await sessionDirectory.getFileHandle(fileName);
    return fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function deleteChunk(sessionId: string, fileName: string): Promise<void> {
  try {
    const sessionDirectory = await getSessionDirectory(sessionId, false);
    await safeRemoveEntry(sessionDirectory, fileName);
    const remainingChunks = await listChunks(sessionId);
    if (remainingChunks.length === 0) {
      await safeRemoveEntry(sessionDirectory, SESSION_META_FILE);
      const sessionsDirectory = await getSessionsDirectory();
      await safeRemoveEntry(sessionsDirectory, sessionId, true);
    }
  } catch {
    return;
  }
}

export async function listChunks(sessionId: string): Promise<StoredChunk[]> {
  try {
    const sessionDirectory = (await getSessionDirectory(
      sessionId,
      false,
    )) as FileSystemDirectoryHandleWithEntries;
    const chunks: StoredChunk[] = [];

    for await (const [, entry] of sessionDirectory.entries()) {
      if (entry.kind !== "file" || entry.name === SESSION_META_FILE) {
        continue;
      }

      const file = await (entry as FileSystemFileHandle).getFile();
      const chunkId = entry.name.replace(/\.[^.]+$/, "");
      chunks.push({
        chunkId,
        file,
        fileName: entry.name,
        sessionId,
      });
    }

    return chunks.sort((left, right) => left.fileName.localeCompare(right.fileName));
  } catch {
    return [];
  }
}
