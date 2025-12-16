# affected

Compute affected packages in a monorepo by traversing the dependency graph. Used to partition PRs into merge queue zones and protect against semantic conflicts.

## Installation

```bash
npm install
```

## Quick Start

```typescript
// 1. Implement the StorageClient interface for your storage backend
const storageClient: StorageClient = {
  getObjectOrNull: async (key: string) => {
    // Your S3/GCS/filesystem implementation here
    // Return { data: string | Buffer } or null if not found
  },
};

// 2. Fetch cached targets for baseline (main) and PR commits
const baselineTargets = await getCachedTargetsForCommit({
  commitSha: "main-branch-sha",
  kind: "full",
  storageClient,
});

const prTargets = await getCachedTargetsForCommit({
  commitSha: "pr-branch-sha",
  kind: "partial",
  storageClient,
});

// 3. Build the hydrated DAG
const hydratedDag = buildHydratedDag({
  baselineTargets,
  additionalTargets: [prTargets],
});

// 4. Compute affected packages for merge queue partitioning
const affectedTargets = computeTransitiveTargets({
  directPackageNames: ["@myorg/changed-package"],
  hydratedDag,
});

// 5. Use affected packages to determine MQ zone
const affectedPackageNames = [...affectedTargets].map((t) => t.name);
```

## How It Works

1. **Cache dependency graphs per commit** - Store the full DAG for main branch commits, and filtered DAGs for PR commits
2. **Merge DAGs** - Combine baseline (main) with PR branch changes to get complete picture
3. **Compute transitive closure** - Given directly changed packages, find all packages that depend on them
4. **Partition PRs** - PRs affecting overlapping packages go in the same MQ zone to catch semantic conflicts

## API Reference

### Schemas

All schemas use Zod for runtime validation.

#### `CachedBuildTargets`

```typescript
type CachedBuildTargets = {
  version: 1;
  commitSha: string;
  timestamp: string;
  mode: "full-dag" | "filtered";
  packages: string[];
  tasks: BuildTask[];
};
```

#### `BuildTask`

```typescript
type BuildTask = {
  taskId: string;          // e.g., "@myorg/server#build"
  task: string;            // e.g., "build", "test"
  package: string;         // e.g., "@myorg/server"
  dependencies: string[];  // Task IDs this task depends on
  dependents: string[];    // Task IDs that depend on this task
};
```

### Functions

#### `getCachedTargetsForCommit`

Fetch cached build targets for a single commit.

```typescript
function getCachedTargetsForCommit(params: {
  commitSha: string;
  kind: "full" | "partial";
  storageClient: StorageClient;
  keyGenerator?: (commitSha: string, kind: "full" | "partial") => string;
}): Promise<CachedBuildTargets>;
```

#### `getCachedTargetsForCommits`

Batch fetch cached build targets for multiple commits.

```typescript
function getCachedTargetsForCommits(params: {
  commitShas: [string, ...string[]];
  kind: "full" | "partial";
  storageClient: StorageClient;
  batchSize?: number;  // Default: 50
  keyGenerator?: (commitSha: string, kind: "full" | "partial") => string;
}): Promise<Map<string, CachedBuildTargets>>;
```

#### `buildHydratedDag`

Build a hydrated DAG by merging baseline targets with additional targets.

```typescript
function buildHydratedDag(params: {
  baselineTargets: CachedBuildTargets;  // Must be "full-dag" mode
  additionalTargets: CachedBuildTargets[];
}): HydratedDag;
```

#### `computeTransitiveTargets`

Compute all packages affected by changes to the given packages.

```typescript
function computeTransitiveTargets(params: {
  directPackageNames: string[];
  hydratedDag: HydratedDag;
}): Set<Target>;
```

#### `turboTaskToBuildTask`

Convert Turbo dry-run output to generic BuildTask format.

```typescript
function turboTaskToBuildTask(turboTask: TurboTask): BuildTask;
```

### Error Classes

- `CachedTargetsNotFoundError` - Storage returned null for the commit
- `InvalidCachedTargetsError` - Cached data failed schema validation
- `FailedToFetchCachedTargetsError` - One or more batch fetches failed

## Storage Key Format

By default, cached targets are stored at:

```
commit-targets/{kind}-{commitSha}.json
```

Override with a custom `keyGenerator` function.

## Example: Storage Backends

### AWS S3

```typescript
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({ region: "us-east-1" });

const storageClient: StorageClient = {
  getObjectOrNull: async (key: string) => {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: "your-bucket", Key: key })
      );
      const data = await response.Body?.transformToString();
      return data ? { data } : null;
    } catch (err: any) {
      if (err.name === "NoSuchKey") return null;
      throw err;
    }
  },
};
```

### File System

```typescript
import * as fs from "fs/promises";
import * as path from "path";

const storageClient: StorageClient = {
  getObjectOrNull: async (key: string) => {
    try {
      const data = await fs.readFile(path.join("/cache", key), "utf-8");
      return { data };
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
};
```

## Running Tests

```bash
npm test
```
