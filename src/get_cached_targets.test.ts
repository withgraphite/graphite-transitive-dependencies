import { describe, expect, it } from "vitest";

import {
  CachedTargetsNotFoundError,
  FailedToFetchCachedTargetsError,
  getCachedTargetsForCommit,
  getCachedTargetsForCommits,
  InvalidCachedTargetsError,
} from "./get_cached_targets";
import type { StorageClient } from "./types";

function createMockStorageClient(
  data: Record<string, string | null>
): StorageClient {
  return {
    getObjectOrNull: async (key: string) => {
      const value = data[key];
      if (value === null || value === undefined) {
        return null;
      }
      return { data: value };
    },
  };
}

describe("getCachedTargetsForCommit", () => {
  [
    {
      desc: "should return cached targets when they exist",
      cacheData: {
        version: 1,
        commitSha: "abc123",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered" as const,
        packages: ["@myorg/server"],
        tasks: [
          {
            taskId: "@myorg/server#build",
            task: "build",
            package: "@myorg/server",
            dependencies: [],
            dependents: ["@myorg/api#build"],
          },
        ],
      },
      expectedPackages: ["@myorg/server"],
    },
  ].forEach((tc) => {
    it(tc.desc, async () => {
      const storageClient = createMockStorageClient({
        "commit-targets/partial-abc123.json": JSON.stringify(tc.cacheData),
      });

      const result = await getCachedTargetsForCommit({
        commitSha: "abc123",
        kind: "partial",
        storageClient,
      });

      expect(result.packages).toEqual(tc.expectedPackages);
    });
  });

  it("should throw CachedTargetsNotFoundError when storage returns null", async () => {
    const storageClient = createMockStorageClient({});

    await expect(
      getCachedTargetsForCommit({
        commitSha: "abc123",
        kind: "partial",
        storageClient,
      })
    ).rejects.toThrow(CachedTargetsNotFoundError);
  });

  it("should throw error when cached data is invalid JSON", async () => {
    const storageClient = createMockStorageClient({
      "commit-targets/partial-abc123.json": "invalid json",
    });

    await expect(
      getCachedTargetsForCommit({
        commitSha: "abc123",
        kind: "partial",
        storageClient,
      })
    ).rejects.toThrow();
  });

  it("should throw InvalidCachedTargetsError when cached data fails schema validation", async () => {
    const storageClient = createMockStorageClient({
      "commit-targets/partial-abc123.json": JSON.stringify({
        version: 1,
        commitSha: "abc123",
      }),
    });

    await expect(
      getCachedTargetsForCommit({
        commitSha: "abc123",
        kind: "partial",
        storageClient,
      })
    ).rejects.toThrow(InvalidCachedTargetsError);
  });

  it("should use custom keyGenerator when provided", async () => {
    const cacheData = {
      version: 1,
      commitSha: "abc123",
      timestamp: "2025-01-17T12:00:00Z",
      mode: "filtered" as const,
      packages: ["@myorg/server"],
      tasks: [],
    };

    const storageClient = createMockStorageClient({
      "custom/path/abc123.json": JSON.stringify(cacheData),
    });

    const result = await getCachedTargetsForCommit({
      commitSha: "abc123",
      kind: "partial",
      storageClient,
      keyGenerator: (sha) => `custom/path/${sha}.json`,
    });

    expect(result.commitSha).toBe("abc123");
  });
});

describe("getCachedTargetsForCommits", () => {
  it("should fetch multiple commits successfully", async () => {
    const storageClient = createMockStorageClient({
      "commit-targets/partial-sha1.json": JSON.stringify({
        version: 1,
        commitSha: "sha1",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered",
        packages: ["@myorg/pkg1"],
        tasks: [],
      }),
      "commit-targets/partial-sha2.json": JSON.stringify({
        version: 1,
        commitSha: "sha2",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered",
        packages: ["@myorg/pkg2"],
        tasks: [],
      }),
    });

    const result = await getCachedTargetsForCommits({
      commitShas: ["sha1", "sha2"],
      kind: "partial",
      storageClient,
    });

    expect(result.size).toBe(2);
    expect(result.get("sha1")?.packages).toEqual(["@myorg/pkg1"]);
    expect(result.get("sha2")?.packages).toEqual(["@myorg/pkg2"]);
  });

  it("should throw FailedToFetchCachedTargetsError when some fetches fail", async () => {
    const storageClient = createMockStorageClient({
      "commit-targets/partial-sha1.json": JSON.stringify({
        version: 1,
        commitSha: "sha1",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered",
        packages: ["@myorg/pkg1"],
        tasks: [],
      }),
    });

    await expect(
      getCachedTargetsForCommits({
        commitShas: ["sha1", "sha2"],
        kind: "partial",
        storageClient,
      })
    ).rejects.toThrow(FailedToFetchCachedTargetsError);
  });

  it("should respect batchSize parameter", async () => {
    const fetchedKeys: string[] = [];
    const storageClient: StorageClient = {
      getObjectOrNull: async (key: string) => {
        fetchedKeys.push(key);
        const sha = key
          .replace("commit-targets/partial-", "")
          .replace(".json", "");
        return {
          data: JSON.stringify({
            version: 1,
            commitSha: sha,
            timestamp: "2025-01-17T12:00:00Z",
            mode: "filtered",
            packages: [],
            tasks: [],
          }),
        };
      },
    };

    await getCachedTargetsForCommits({
      commitShas: ["sha1", "sha2", "sha3"],
      kind: "partial",
      storageClient,
      batchSize: 2,
    });

    expect(fetchedKeys.length).toBe(3);
  });
});
