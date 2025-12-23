import { z } from "zod";

/**
 * Build tool agnostic target info schema
 * Contains identifying information for a target
 */
export const TargetInfoSchema = z.object({
  // Unique identifier for the target, e.g., "@monologue/server#build" or W12345
  targetId: z.string(),
  // Target name, e.g., "@monologue/server" or "core"
  targetName: z.optional(z.string()),
});

export type TargetInfo = z.infer<typeof TargetInfoSchema>;

/**
 * Build tool agnostic target schema (owned by us)
 * This is our internal contract for representing build targets
 */
export const TargetSchema = z.object({
  // Target identifying information
  target: TargetInfoSchema,
  // Target IDs that this target depends on
  dependencies: z.array(z.string()),
  // Target IDs that depend on this target
  dependents: z.array(z.string()),
});

export type Target = z.infer<typeof TargetSchema>;

export const CACHED_BUILD_TARGETS_VERSION = 2;

/**
 * Schema for cached build targets per commit
 */
export const CachedBuildTargetsSchema = z.discriminatedUnion("mode", [
  // Full DAG mode: baseSha is null (complete dependency graph for main branch)
  z.object({
    version: z.literal(CACHED_BUILD_TARGETS_VERSION),
    mode: z.literal("full-dag"),
    headSha: z.string(),
    // List of affected package names (e.g., ["@monologue/server"])
    targetIds: z.array(z.string()),
    // Targets with their dependency relationships (build-tool agnostic)
    graph: z.array(TargetSchema),
  }),
  // Filtered mode: both baseSha and headSha are required (only affected packages for PR branches)
  z.object({
    version: z.literal(CACHED_BUILD_TARGETS_VERSION),
    mode: z.literal("filtered"),
    baseSha: z.string(),
    headSha: z.string(),
    // List of affected package names (e.g., ["@monologue/server"])
    targetIds: z.array(z.string()),
    // Targets with their dependency relationships (build-tool agnostic)
    graph: z.array(TargetSchema),
  }),
]);

export type CachedBuildTargets = z.infer<typeof CachedBuildTargetsSchema>;