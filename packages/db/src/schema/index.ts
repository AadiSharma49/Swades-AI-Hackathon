import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sessionStatusEnum = pgEnum("session_status", [
  "recording",
  "processing",
  "completed",
  "failed",
]);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    status: sessionStatusEnum("status").notNull().default("recording"),
    sourceType: text("source_type").notNull().default("mic"),
    mimeType: text("mime_type").notNull().default("audio/webm"),
    transcript: text("transcript").notNull().default(""),
    summary: text("summary").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIndex: index("sessions_created_at_idx").on(table.createdAt),
    statusIndex: index("sessions_status_idx").on(table.status),
  }),
);

export const transcriptChunks = pgTable(
  "transcript_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    filename: text("filename").notNull(),
    text: text("text").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionSeqUnique: uniqueIndex("transcript_chunks_session_seq_idx").on(table.sessionId, table.seq),
    sessionIndex: index("transcript_chunks_session_id_idx").on(table.sessionId),
  }),
);

export const chunkUploadStatusEnum = pgEnum("chunk_upload_status", ["uploaded"]);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("audio/webm"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    status: chunkUploadStatusEnum("status").notNull().default("uploaded"),
    transcriptText: text("transcript_text").notNull().default(""),
    transcriptError: text("transcript_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionChunkUnique: uniqueIndex("chunks_session_chunk_idx").on(table.sessionId, table.chunkId),
    sessionIndex: index("chunks_session_id_idx").on(table.sessionId),
  }),
);
