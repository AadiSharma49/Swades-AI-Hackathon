import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    STORAGE_ROOT: z.string().min(1).default("./storage"),
    PYTHON_PATH: z.string().min(1).default("python"),
    WHISPER_MODEL: z.string().min(1).default("base"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
