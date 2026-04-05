"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteChunk,
  listChunks,
  listSessions,
  saveChunk,
  saveSession,
  type SessionSource,
  type StoredSession,
} from "../lib/opfs";
import { UploadQueue, type UploadQueueItem } from "../lib/uploadQueue";
import { getServerUrl } from "../lib/server-url";

const CHUNK_MS = 15_000;
const ACTIVE_SESSION_STORAGE_KEY = "reliable-recorder.active-session";
const RECONCILE_INTERVAL_MS = 15_000;

type RecorderPhase =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "recovering"
  | "error";

type ActiveSessionState = StoredSession & {
  isRecording: boolean;
};

type StartRecordingOptions = {
  source: SessionSource;
  title: string;
};

type UploadedChunkResponse = {
  chunkIds: string[];
  ok: true;
};

function readActiveSessionFromStorage(): ActiveSessionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as ActiveSessionState;
  } catch {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    return null;
  }
}

function writeActiveSessionToStorage(session: ActiveSessionState | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function isMediaRecorderSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

function getRecordingMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "audio/webm";
}

async function getUploadedChunkIds(serverUrl: string, sessionId: string): Promise<Set<string>> {
  const response = await fetch(
    `${serverUrl}/api/chunks/uploaded?sessionId=${encodeURIComponent(sessionId)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch uploaded chunks for session ${sessionId}`);
  }

  const payload = (await response.json()) as UploadedChunkResponse;
  return new Set(payload.chunkIds);
}

export function useRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const [pendingChunkCount, setPendingChunkCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [inFlightCount, setInFlightCount] = useState(0);
  const [uploadedChunkCount, setUploadedChunkCount] = useState(0);
  const [recoveredSessionCount, setRecoveredSessionCount] = useState(0);
  const [lastUploadedChunkId, setLastUploadedChunkId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<number | null>(null);
  const reconciliationRef = useRef<number | null>(null);
  const sessionRef = useRef<ActiveSessionState | null>(null);
  const stopResolverRef = useRef<(() => void) | null>(null);
  const shouldContinueRecordingRef = useRef(false);
  const serverUrl = useMemo(() => getServerUrl(), []);

  const uploadQueueRef = useRef<UploadQueue | null>(null);

  const updatePendingCount = useCallback(async (sessionId: string | null) => {
    if (!sessionId) {
      const sessions = await listSessions();
      const chunkCounts = await Promise.all(
        sessions.map(async (session) => (await listChunks(session.id)).length),
      );
      setPendingChunkCount(chunkCounts.reduce((sum, count) => sum + count, 0));
      return;
    }

    setPendingChunkCount((await listChunks(sessionId)).length);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current !== null) {
      window.clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const uploadChunk = useCallback(
    async (item: UploadQueueItem) => {
      const formData = new FormData();
      formData.set("chunkId", item.chunkId);
      formData.set("file", item.file, item.fileName);
      formData.set("mimeType", item.mimeType);
      formData.set("sessionId", item.sessionId);
      formData.set("sourceType", item.sourceType);
      formData.set("title", item.title);

      const response = await fetch(`${serverUrl}/api/chunks/upload`, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Chunk upload failed");
      }
    },
    [serverUrl],
  );

  const reconcileSession = useCallback(
    async (session: StoredSession) => {
      const uploadedChunkIds = await getUploadedChunkIds(serverUrl, session.id);
      const storedChunks = await listChunks(session.id);

      setError(null);
      setUploadedChunkCount(uploadedChunkIds.size);

      for (const chunk of storedChunks) {
        if (uploadedChunkIds.has(chunk.chunkId)) {
          await deleteChunk(session.id, chunk.fileName);
          continue;
        }

        if (!uploadQueueRef.current?.has(session.id, chunk.chunkId)) {
          uploadQueueRef.current?.enqueue({
            chunkId: chunk.chunkId,
            file: chunk.file,
            fileName: chunk.fileName,
            mimeType: chunk.file.type || session.mimeType,
            sessionId: session.id,
            sourceType: session.sourceType,
            title: session.title,
          });
        }
      }

      await updatePendingCount(sessionRef.current?.id ?? null);
    },
    [serverUrl, updatePendingCount],
  );

  const reconcileAllSessions = useCallback(async () => {
    setPhase((currentPhase) =>
      currentPhase === "recording" || currentPhase === "stopping" ? currentPhase : "recovering",
    );

    try {
      const storedSessions = await listSessions();
      setError(null);
      setRecoveredSessionCount(storedSessions.length);

      for (const session of storedSessions) {
        await reconcileSession(session);
      }

      if (sessionRef.current?.isRecording) {
        setPhase("recording");
      } else {
        setPhase("idle");
      }
    } catch (reconciliationError) {
      setError(
        reconciliationError instanceof Error
          ? reconciliationError.message
          : "Recovery reconciliation failed",
      );
      setPhase("error");
    }
  }, [reconcileSession]);

  const stopRecording = useCallback(async () => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder) {
      return;
    }

    setPhase("stopping");
    shouldContinueRecordingRef.current = false;
    clearTimer();

    const stopped = new Promise<void>((resolve) => {
      stopResolverRef.current = resolve;
    });

    const currentSession = sessionRef.current;
    if (currentSession) {
      const stoppedSession = {
        ...currentSession,
        isRecording: false,
      };
      sessionRef.current = stoppedSession;
      setActiveSession(stoppedSession);
      writeActiveSessionToStorage(stoppedSession);
    }

    activeRecorder.stop();
    await stopped;
    await reconcileAllSessions();
  }, [clearTimer, reconcileAllSessions]);

  const buildRecorder = useCallback(
    (audioOnlyStream: MediaStream, session: ActiveSessionState): MediaRecorder => {
      const recorder = new MediaRecorder(audioOnlyStream, {
        mimeType: session.mimeType,
      });

      recorder.ondataavailable = async (event) => {
        if (!event.data.size || !sessionRef.current) {
          return;
        }

        const currentSession = sessionRef.current;
        const chunkId = crypto.randomUUID();
        const extension = currentSession.mimeType.includes("mp4") ? "mp4" : "webm";
        const fileName = await saveChunk(currentSession.id, chunkId, event.data, extension);
        const file = new File([event.data], fileName, {
          type: event.data.type || currentSession.mimeType,
        });

        await updatePendingCount(currentSession.id);
        uploadQueueRef.current?.enqueue({
          chunkId,
          file,
          fileName,
          mimeType: file.type || currentSession.mimeType,
          sessionId: currentSession.id,
          sourceType: currentSession.sourceType,
          title: currentSession.title,
        });
      };

      recorder.onerror = () => {
        shouldContinueRecordingRef.current = false;
        setError("MediaRecorder failed while capturing audio.");
        setPhase("error");
      };

      recorder.onstop = () => {
        recorderRef.current = null;

        if (shouldContinueRecordingRef.current && streamRef.current && sessionRef.current) {
          const nextRecorder = buildRecorder(streamRef.current, sessionRef.current);
          recorderRef.current = nextRecorder;
          nextRecorder.start();
          chunkTimerRef.current = window.setTimeout(() => {
            if (recorderRef.current?.state === "recording") {
              recorderRef.current.stop();
            }
          }, CHUNK_MS);
          return;
        }

        cleanupStream();
        stopResolverRef.current?.();
        stopResolverRef.current = null;
      };

      return recorder;
    },
    [cleanupStream, updatePendingCount],
  );

  const startRecording = useCallback(
    async ({ source, title }: StartRecordingOptions) => {
      if (!isMediaRecorderSupported()) {
        setError("MediaRecorder is not available in this browser.");
        setPhase("error");
        return;
      }

      setError(null);
      setLastUploadedChunkId(null);
      setUploadedChunkCount(0);
      setRecoveredSessionCount(0);
      setPhase("requesting-permission");

      try {
        const mediaStream =
          source === "tab"
            ? await navigator.mediaDevices.getDisplayMedia({
                audio: true,
                video: true,
              })
            : await navigator.mediaDevices.getUserMedia({
                audio: {
                  autoGainControl: true,
                  echoCancellation: true,
                  noiseSuppression: true,
                },
              });

        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error("No audio track available for recording.");
        }

        const audioOnlyStream = new MediaStream(audioTracks);
        mediaStream.getVideoTracks().forEach((track) => track.stop());

        const mimeType = getRecordingMimeType();
        const session: ActiveSessionState = {
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          isRecording: true,
          mimeType,
          sourceType: source,
          title,
        };

        await saveSession(session);
        sessionRef.current = session;
        setActiveSession(session);
        writeActiveSessionToStorage(session);
        shouldContinueRecordingRef.current = true;
        const recorder = buildRecorder(audioOnlyStream, session);

        recorderRef.current = recorder;
        streamRef.current = audioOnlyStream;
        setStream(audioOnlyStream);
        startedAtRef.current = Date.now();
        setElapsedSeconds(0);
        timerRef.current = window.setInterval(() => {
          if (!startedAtRef.current) {
            return;
          }

          setElapsedSeconds((Date.now() - startedAtRef.current) / 1000);
        }, 500);

        recorder.start();
        chunkTimerRef.current = window.setTimeout(() => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        }, CHUNK_MS);
        setPhase("recording");
        await updatePendingCount(session.id);
      } catch (startError) {
        cleanupStream();
        clearTimer();
        setError(startError instanceof Error ? startError.message : "Unable to start recording");
        setPhase("error");
      }
    },
    [buildRecorder, cleanupStream, clearTimer, updatePendingCount],
  );

  useEffect(() => {
    uploadQueueRef.current = new UploadQueue({
      onError: (queueError) => {
        setError(queueError.message);
      },
      onStatsChange: (stats) => {
        setInFlightCount(stats.inFlightCount);
        setQueuedCount(stats.queuedCount);
      },
      onSuccess: async (item) => {
        setError(null);
        await deleteChunk(item.sessionId, item.fileName);
        setLastUploadedChunkId(item.chunkId);
        setUploadedChunkCount((count) => count + 1);
        await updatePendingCount(sessionRef.current?.id ?? null);

        const activeSessionState = sessionRef.current;
        if (!activeSessionState) {
          return;
        }

        const remainingChunks = await listChunks(activeSessionState.id);
        if (!activeSessionState.isRecording && remainingChunks.length === 0) {
          writeActiveSessionToStorage(null);
          sessionRef.current = null;
          setActiveSession(null);
          setPhase("idle");
        }
      },
      upload: uploadChunk,
    });

    const storedSession = readActiveSessionFromStorage();
    if (storedSession) {
      const recoveredSession = {
        ...storedSession,
        isRecording: false,
      };
      sessionRef.current = recoveredSession;
      setActiveSession(recoveredSession);
      writeActiveSessionToStorage(recoveredSession);
      setPhase("recovering");
    }

    void reconcileAllSessions();

    reconciliationRef.current = window.setInterval(() => {
      void reconcileAllSessions();
    }, RECONCILE_INTERVAL_MS);

    return () => {
      clearTimer();
      cleanupStream();
      if (reconciliationRef.current !== null) {
        window.clearInterval(reconciliationRef.current);
      }
    };
  }, [cleanupStream, clearTimer, reconcileAllSessions, updatePendingCount, uploadChunk]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    void saveSession(activeSession);
    writeActiveSessionToStorage(activeSession);
  }, [activeSession]);

  return {
    activeSession,
    elapsedSeconds,
    error,
    inFlightCount,
    lastUploadedChunkId,
    pendingChunkCount,
    phase,
    queuedCount,
    recoveredSessionCount,
    startRecording,
    stopRecording,
    stream,
    uploadedChunkCount,
  };
}
