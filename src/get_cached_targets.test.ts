import { describe, expect, it } from "vitest";
import type { StorageClient } from "./types";
import {
  CachedTargetsNotFoundError,
  InvalidCachedTargetsError,
  FailedToFetchCachedTargetsError,
  getCachedTargetsForCommit,
  getCachedTargetsForCommits,
} from "./get_cached_targets";

describe("getCachedTargetsForCommit", () => {
  [
    {
      desc: "should return cached targets when they exist",
      cacheData: {
        version: 2,
        mode: "filtered" as const,
        baseSha: "base123",
        headSha: "abc123",
        targetIds: ["@monologue/server"],
        graph: [
          {
            target: {
              targetId: "@monologue/server#build",
              targetName: "@monologue/server",
            },
            dependencies: [],
            dependents: ["@monologue/api#build"],
          },
        ],
      },
      expectedTargetIds: ["@monologue/server"],
    },
    {
      desc: "should throw CachedTargetsNotFoundError when storage returns null",
      cacheData: null,
      expectedError: CachedTargetsNotFoundError,
    },
    {
      desc: "should throw error when cached data is invalid JSON",
      cacheData: "invalid json",
      expectedError: Error,
    },
    {
      desc: "should throw InvalidCachedTargetsError when cached data fails schema validation",
      cacheData: {
        version: 2,
        mode: "filtered",
        headSha: "abc123",
        // Missing required fields
      },
      expectedError: InvalidCachedTargetsError,
    },
  ].forEach((tc) => {
    it(tc.desc, async () => {
      const storageClient: StorageClient = {
        getObjectOrNull: async (key: string) => {
          if (tc.cacheData === null) {
            return null;
          }
          const data =
            typeof tc.cacheData === "string"
              ? tc.cacheData
              : JSON.stringify(tc.cacheData);
          return { data };
        },
      };

      if (tc.expectedError) {
        await expect(
          getCachedTargetsForCommit({
            commitSha: "abc123",
            kind: "partial",
            storageClient,
          })
        ).rejects.toThrow(tc.expectedError);
      } else {
        const result = await getCachedTargetsForCommit({
          commitSha: "abc123",
          kind: "partial",
          storageClient,
        });
        expect(result.targetIds).toEqual(tc.expectedTargetIds);
      }
    });
  });

  it("should use custom keyGenerator when provided", async () => {
    const cacheData = {
      version: 2,
      mode: "filtered" as const,
      baseSha: "base123",
      headSha: "abc123",
      targetIds: ["@monologue/server"],
      graph: [],
    };

    const storageClient: StorageClient = {
      getObjectOrNull: async (key: string) => {
        expect(key).toBe("custom-key-abc123");
        return { data: JSON.stringify(cacheData) };
      },
    };

    const result = await getCachedTargetsForCommit({
      commitSha: "abc123",
      kind: "partial",
      storageClient,
      keyGenerator: (sha) => `custom-key-${sha}`,
    });

    expect(result.targetIds).toEqual(["@monologue/server"]);
  });
});

describe("getCachedTargetsForCommits", () => {
  it("should fetch multiple commits successfully", async () => {
    const cache: Record<string, any> = {
      "commit-targets/partial-sha1.json": {
        version: 2,
        mode: "filtered",
        baseSha: "base",
        headSha: "sha1",
        targetIds: ["@monologue/pkg1"],
        graph: [],
      },
      "commit-targets/partial-sha2.json": {
        version: 2,
        mode: "filtered",
        baseSha: "base",
        headSha: "sha2",
        targetIds: ["@monologue/pkg2"],
        graph: [],
      },
    };

    const storageClient: StorageClient = {
      getObjectOrNull: async (key: string) => {
        const data = cache[key];
        return data ? { data: JSON.stringify(data) } : null;
      },
    };

    const result = await getCachedTargetsForCommits({
      commitShas: ["sha1", "sha2"],
      kind: "partial",
      storageClient,
    });

    expect(result.size).toBe(2);
    expect(result.get("sha1")?.targetIds).toEqual(["@monologue/pkg1"]);
    expect(result.get("sha2")?.targetIds).toEqual(["@monologue/pkg2"]);
  });

  it("should throw FailedToFetchCachedTargetsError when some fetches fail", async () => {
    const storageClient: StorageClient = {
      getObjectOrNull: async () => null,
    };

    await expect(
      getCachedTargetsForCommits({
        commitShas: ["sha1", "sha2"],
        kind: "partial",
        storageClient,
      })
    ).rejects.toThrow(FailedToFetchCachedTargetsError);
  });

  it("should respect batchSize parameter", async () => {
    const cache: Record<string, any> = {
      "commit-targets/partial-sha1.json": {
        version: 2,
        mode: "filtered",
        baseSha: "base",
        headSha: "sha1",
        targetIds: ["@monologue/pkg1"],
        graph: [],
      },
      "commit-targets/partial-sha2.json": {
        version: 2,
        mode: "filtered",
        baseSha: "base",
        headSha: "sha2",
        targetIds: ["@monologue/pkg2"],
        graph: [],
      },
      "commit-targets/partial-sha3.json": {
        version: 2,
        mode: "filtered",
        baseSha: "base",
        headSha: "sha3",
        targetIds: ["@monologue/pkg3"],
        graph: [],
      },
    };

    let callCount = 0;
    let maxConcurrentCalls = 0;
    let currentConcurrentCalls = 0;

    const storageClient: StorageClient = {
      getObjectOrNull: async (key: string) => {
        callCount++;
        currentConcurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, currentConcurrentCalls);
        
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const data = cache[key];
        currentConcurrentCalls--;
        return data ? { data: JSON.stringify(data) } : null;
      },
    };

    const result = await getCachedTargetsForCommits({
      commitShas: ["sha1", "sha2", "sha3"],
      kind: "partial",
      storageClient,
      batchSize: 2,
    });

    expect(result.size).toBe(3);
    expect(callCount).toBe(3);
    expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
  });
});