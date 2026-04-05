const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

export type UploadQueueItem = {
  attempt: number;
  chunkId: string;
  file: File;
  fileName: string;
  mimeType: string;
  sessionId: string;
  sourceType: "mic" | "tab";
  title: string;
};

type UploadQueueStats = {
  inFlightCount: number;
  queuedCount: number;
};

type UploadQueueOptions = {
  maxConcurrency?: number;
  maxRetries?: number;
  onError?: (error: Error, item: UploadQueueItem) => void;
  onStatsChange?: (stats: UploadQueueStats) => void;
  onSuccess?: (item: UploadQueueItem) => Promise<void> | void;
  upload: (item: UploadQueueItem) => Promise<void>;
};

function buildKey(item: Pick<UploadQueueItem, "chunkId" | "sessionId">): string {
  return `${item.sessionId}:${item.chunkId}`;
}

export class UploadQueue {
  private activeCount = 0;
  private readonly inFlightKeys = new Set<string>();
  private readonly pendingKeys = new Set<string>();
  private readonly queue: UploadQueueItem[] = [];
  private readonly maxConcurrency: number;
  private readonly maxRetries: number;
  private readonly onError?: UploadQueueOptions["onError"];
  private readonly onStatsChange?: UploadQueueOptions["onStatsChange"];
  private readonly onSuccess?: UploadQueueOptions["onSuccess"];
  private readonly upload: UploadQueueOptions["upload"];

  constructor(options: UploadQueueOptions) {
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.onError = options.onError;
    this.onStatsChange = options.onStatsChange;
    this.onSuccess = options.onSuccess;
    this.upload = options.upload;
  }

  enqueue(item: Omit<UploadQueueItem, "attempt"> & { attempt?: number }): void {
    const queueItem: UploadQueueItem = {
      attempt: item.attempt ?? 0,
      ...item,
    };
    const key = buildKey(queueItem);
    if (this.pendingKeys.has(key) || this.inFlightKeys.has(key)) {
      return;
    }

    this.queue.push(queueItem);
    this.pendingKeys.add(key);
    this.emitStats();
    this.drain();
  }

  has(sessionId: string, chunkId: string): boolean {
    const key = buildKey({
      chunkId,
      sessionId,
    });
    return this.pendingKeys.has(key) || this.inFlightKeys.has(key);
  }

  getStats(): UploadQueueStats {
    return {
      inFlightCount: this.activeCount,
      queuedCount: this.queue.length,
    };
  }

  private emitStats(): void {
    this.onStatsChange?.(this.getStats());
  }

  private drain(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        break;
      }

      const key = buildKey(item);
      this.pendingKeys.delete(key);
      this.inFlightKeys.add(key);
      this.activeCount += 1;
      this.emitStats();

      void this.upload(item)
        .then(async () => {
          await this.onSuccess?.(item);
        })
        .catch((unknownError) => {
          const error =
            unknownError instanceof Error ? unknownError : new Error("Chunk upload failed");

          if (item.attempt + 1 >= this.maxRetries) {
            this.onError?.(error, item);
            return;
          }

          const retryDelay = BASE_RETRY_DELAY_MS * 2 ** item.attempt;
          const retryItem: UploadQueueItem = {
            ...item,
            attempt: item.attempt + 1,
          };

          window.setTimeout(() => {
            this.enqueue(retryItem);
          }, retryDelay);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.inFlightKeys.delete(key);
          this.emitStats();
          this.drain();
        });
    }
  }
}
