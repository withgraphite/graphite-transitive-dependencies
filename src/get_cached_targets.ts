import { type CachedBuildTargets, CachedBuildTargetsSchema } from "./schemas";
import type { NonEmptyArray, StorageClient } from "./types";

const DEFAULT_BATCH_SIZE = 50;

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export class CachedTargetsNotFoundError extends Error {
  constructor(public commitSha: string) {
    super(`Cached build targets not found for commit ${commitSha}`);
    this.name = "CachedTargetsNotFoundError";
  }
}

export class InvalidCachedTargetsError extends Error {
  constructor(
    public commitSha: string,
    public error: unknown
  ) {
    super(`Invalid cached build targets for commit ${commitSha}`);
    this.name = "InvalidCachedTargetsError";
  }
}

export class FailedToFetchCachedTargetsError extends Error {
  constructor(public failedShas: string[]) {
    super(
      `Failed to fetch cached build targets for commits ${failedShas.map((sha) => sha.slice(0, 7)).join(", ")}`
    );
    this.name = "FailedToFetchCachedTargetsError";
  }
}

export function getStorageKey(commitSha: string, kind: "full" | "partial") {
  return `commit-targets/${kind}-${commitSha}.json`;
}

export async function getCachedTargetsForCommit({
  commitSha,
  kind,
  storageClient,
  keyGenerator = getStorageKey,
}: {
  commitSha: string;
  kind: "full" | "partial";
  storageClient: StorageClient;
  keyGenerator?: (commitSha: string, kind: "full" | "partial") => string;
}) {
  const storageKey = keyGenerator(commitSha, kind);
  const result = await storageClient.getObjectOrNull(storageKey);

  if (!result) {
    throw new CachedTargetsNotFoundError(commitSha);
  }

  const dataString =
    typeof result.data === "string"
      ? result.data
      : result.data.toString("utf-8");

  const jsonData = JSON.parse(dataString);
  const parseResult = CachedBuildTargetsSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new InvalidCachedTargetsError(commitSha, parseResult.error);
  }

  return parseResult.data;
}

export async function getCachedTargetsForCommits({
  commitShas,
  kind,
  storageClient,
  batchSize = DEFAULT_BATCH_SIZE,
  keyGenerator = getStorageKey,
}: {
  commitShas: NonEmptyArray<string>;
  kind: "full" | "partial";
  storageClient: StorageClient;
  batchSize?: number;
  keyGenerator?: (commitSha: string, kind: "full" | "partial") => string;
}) {
  const chunkedInputs = chunk(commitShas, batchSize);
  const results: PromiseSettledResult<CachedBuildTargets>[] = [];

  for (const commitShaChunk of chunkedInputs) {
    const chunkResults = await Promise.allSettled(
      commitShaChunk.map((commitSha) =>
        getCachedTargetsForCommit({
          commitSha,
          kind,
          storageClient,
          keyGenerator,
        })
      )
    );
    results.push(...chunkResults);
  }

  const targetMap = new Map<string, CachedBuildTargets>();
  const failedShas: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const commitSha = commitShas[i];

    if (result.status === "fulfilled") {
      targetMap.set(commitSha, result.value);
    } else {
      failedShas.push(commitSha);
    }
  }

  if (failedShas.length > 0) {
    throw new FailedToFetchCachedTargetsError(failedShas);
  }

  return targetMap;
}
