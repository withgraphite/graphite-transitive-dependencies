import { z } from "zod";

/**
 * Build tool agnostic task schema
 * This is the internal contract for representing build tasks
 */
export const BuildTaskSchema = z.object({
  // Opaque unique identifier for this task
  taskId: z.string(),
  // Task name (e.g., "build", "test")
  task: z.string(),
  // Package name (e.g., "@myorg/server")
  package: z.string(),
  // Task IDs that this task depends on
  dependencies: z.array(z.string()),
  // Task IDs that depend on this task
  dependents: z.array(z.string()),
});

export type BuildTask = z.infer<typeof BuildTaskSchema>;

/**
 * Turbo-specific task schema (external contract)
 * Used for parsing Turbo dry-run output
 */
export const TurboTaskSchema = z.object({
  taskId: z.string(),
  task: z.string(),
  package: z.string(),
  hash: z.string().optional(),
  inputs: z.record(z.string()).optional(),
  dependencies: z.array(z.string()),
  dependents: z.array(z.string()),
  directory: z.string().optional(),
});

export type TurboTask = z.infer<typeof TurboTaskSchema>;

/**
 * Schema for cached build targets per commit
 */
export const CachedBuildTargetsSchema = z.object({
  version: z.literal(1),
  commitSha: z.string(),
  timestamp: z.string(),
  // "full-dag" = complete dependency graph (main branch)
  // "filtered" = only affected packages (PR branches)
  mode: z.enum(["full-dag", "filtered"]),
  // List of affected package names (e.g., ["@myorg/server"])
  packages: z.array(z.string()),
  // Tasks with their dependency relationships (build-tool agnostic)
  tasks: z.array(BuildTaskSchema),
});

export type CachedBuildTargets = z.infer<typeof CachedBuildTargetsSchema>;
