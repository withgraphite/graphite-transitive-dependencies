import { type CachedBuildTargets } from "./schemas";

export type HydratedDag = {
  targetIdToDependentIds: Map<string, Set<string>>;
  targetIdToName: Map<string, string>;
  nameToTargetIds: Map<string, Set<string>>;
};

/**
 * Builds a hydrated DAG by unioning baseline targets with all additional targets.
 * Returns a targetId-based DAG and a targetId→name mapping.
 * The targetId is stable; the name may change between baseline and additional targets.
 */
export function buildHydratedDag({
  baselineTargets,
  additionalTargets,
}: {
  baselineTargets: CachedBuildTargets;
  additionalTargets: CachedBuildTargets[];
}): HydratedDag {
  if (baselineTargets.mode !== "full-dag") {
    throw new Error(
      `Baseline commit ${baselineTargets.headSha} must have full-dag mode, got ${baselineTargets.mode}`
    );
  }

  // Build lookup maps between targetId and package name
  // additionalTargets override baseline mappings
  const targetIdToName = new Map<string, string>();
  const nameToTargetIds = new Map<string, Set<string>>();

  for (const node of baselineTargets.graph) {
    const targetName = node.target.targetName ?? `ID:${node.target.targetId}`;
    targetIdToName.set(node.target.targetId, targetName);
    if (!nameToTargetIds.has(targetName)) {
      nameToTargetIds.set(targetName, new Set());
    }
    nameToTargetIds.get(targetName)!.add(node.target.targetId);
  }

  for (const targets of additionalTargets) {
    for (const node of targets.graph) {
      const targetName = node.target.targetName ?? `ID:${node.target.targetId}`;
      targetIdToName.set(node.target.targetId, targetName);
      if (!nameToTargetIds.has(targetName)) {
        nameToTargetIds.set(targetName, new Set());
      }
      nameToTargetIds.get(targetName)!.add(node.target.targetId);
    }
  }

  const targetIdToDependentIds = new Map<string, Set<string>>();

  for (const node of baselineTargets.graph) {
    if (!targetIdToDependentIds.has(node.target.targetId)) {
      targetIdToDependentIds.set(node.target.targetId, new Set());
    }
    const dependentIds = targetIdToDependentIds.get(node.target.targetId);
    if (dependentIds) {
      for (const dependentId of node.dependents) {
        dependentIds.add(dependentId);
      }
    }
  }

  for (const targets of additionalTargets) {
    for (const node of targets.graph) {
      if (!targetIdToDependentIds.has(node.target.targetId)) {
        targetIdToDependentIds.set(node.target.targetId, new Set());
      }

      // Process dependents (reverse edges from this target)
      const dependentIds = targetIdToDependentIds.get(node.target.targetId);
      if (dependentIds) {
        for (const dependentId of node.dependents) {
          dependentIds.add(dependentId);
        }
      }

      // Process dependencies (forward edges to this target)
      // For each dependency, add this target as a dependent
      for (const dependencyTargetId of node.dependencies) {
        if (!targetIdToDependentIds.has(dependencyTargetId)) {
          targetIdToDependentIds.set(dependencyTargetId, new Set());
        }
        targetIdToDependentIds.get(dependencyTargetId)!.add(node.target.targetId);
      }
    }
  }

  return { targetIdToDependentIds, targetIdToName, nameToTargetIds };
}