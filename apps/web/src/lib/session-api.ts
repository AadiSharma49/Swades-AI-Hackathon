export type SessionStatus = "recording" | "processing" | "completed" | "failed";

export type SessionRecord = {
  createdAt: string;
  id: string;
  mimeType: string;
  sourceType: "mic" | "tab";
  status: SessionStatus;
  summary: string;
  title: string;
  transcript: string;
  updatedAt: string;
};

export type SessionChunkRecord = {
  createdAt: string;
  chunkId: string;
  filename: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
  sessionId: string;
  status: "uploaded";
  transcriptError: string;
  transcriptText: string;
  updatedAt: string;
};

export type SessionDetail = SessionRecord & {
  chunks: SessionChunkRecord[];
};
