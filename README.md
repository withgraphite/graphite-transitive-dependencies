# graphite-transitive-dependencies

Compute affected packages in a monorepo by traversing the dependency graph. Used to partition PRs into merge queue zones and protect against semantic conflicts.

## Installation

```bash
npm install
```

## Quick Start

```typescript
import { Splog } from "@monologue/splog";

// 1. Implement the StorageClient interface for your storage backend
const storageClient: StorageClient = {
  getObjectOrNull: async (key: string) => {
    // Your S3/GCS/filesystem implementation here
    // Return { data: string | Buffer } or null if not found
  },
};

const splog = new Splog();

// 2. Fetch cached targets for baseline (main) and PR commits
const baselineTargets = await getCachedTargetsForCommit({
  commitSha: "main-branch-sha",
  kind: "full",
  storageClient,
  splog,
});

const prTargets = await getCachedTargetsForCommit({
  commitSha: "pr-branch-sha",
  kind: "partial",
  storageClient,
  splog,
});

// 3. Build the hydrated DAG
const hydratedDag = buildHydratedDag({
  baselineTargets,
  additionalTargets: [prTargets],
  splog,
});

// 4. Compute affected packages for merge queue partitioning
const affectedTargets = computeTransitiveTargets({
  directPackageNames: prTargets.targetIds,  // Use targetIds from cached data
  hydratedDag,
  splog,
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

#### `CachedBuildTargets` (v2)

```typescript
type CachedBuildTargets = 
  | {
      version: 2;
      mode: "full-dag";
      headSha: string;
      targetIds: string[];     // List of affected package names
      graph: Target[];         // Build targets with dependencies
    }
  | {
      version: 2;
      mode: "filtered";
      baseSha: string;
      headSha: string;
      targetIds: string[];     // List of affected package names
      graph: Target[];         // Build targets with dependencies
    };
```

#### `Target`

```typescript
type Target = {
  targetId: string;        // Unique identifier (e.g., "@myorg/server#build")
  targetName?: string;     // Human-readable name (e.g., "@myorg/server")
  dependencies: string[];  // Target IDs this target depends on
  dependents: string[];    // Target IDs that depend on this target
};
```

#### `HydratedDag`

```typescript
type HydratedDag = {
  targetIdToDependentIds: Map<string, Set<string>>;  // Target ID to its dependents
  targetIdToName: Map<string, string>;               // Target ID to human-readable name
  nameToTargetIds: Map<string, Set<string>>;         // Package name to target IDs
};
```

#### `ComputedTarget`

```typescript
type ComputedTarget = {
  id: string;    // Stable target ID
  name: string;  // Human-readable package name
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
  splog: Splog;
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
  splog: Splog;
  batchSize?: number;  // Default: 50
  keyGenerator?: (commitSha: string, kind: "full" | "partial") => string;
}): Promise<Map<string, CachedBuildTargets>>;
```

#### `buildHydratedDag`

Build a hydrated DAG by merging baseline targets with additional targets. Returns a `HydratedDag` with targetId-based mappings.

```typescript
function buildHydratedDag(params: {
  baselineTargets: CachedBuildTargets;     // Must be "full-dag" mode
  additionalTargets: CachedBuildTargets[]; // PRs in queue
  splog: Splog;
}): HydratedDag;
```

#### `computeTransitiveTargets`

Compute all packages affected by changes to the given packages. Returns targets with both stable ID and human-readable name.

```typescript
function computeTransitiveTargets(params: {
  directPackageNames: string[];  // Package names directly changed
  hydratedDag: HydratedDag;      // From buildHydratedDag
  splog: Splog;
}): Set<ComputedTarget>;
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
    } catch (err) {
      if ((err as any).name === "NoSuchKey") return null;
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
    } catch (err) {
      if ((err as any).code === "ENOENT") return null;
      throw err;
    }
  },
};
```

## Running Tests

```bash
npm test
```
