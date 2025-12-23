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

  const targetIdToName = new Map<string, string>();
  const nameToTargetIds = new Map<string, Set<string>>();

  // Process baseline targets
  for (const target of baselineTargets.graph) {
    const name = target.targetName || target.targetId;
    targetIdToName.set(target.targetId, name);
    if (!nameToTargetIds.has(name)) {
      nameToTargetIds.set(name, new Set());
    }
    nameToTargetIds.get(name)!.add(target.targetId);
  }

  // Process additional targets
  for (const targets of additionalTargets) {
    for (const target of targets.graph) {
      const name = target.targetName || target.targetId;
      targetIdToName.set(target.targetId, name);
      if (!nameToTargetIds.has(name)) {
        nameToTargetIds.set(name, new Set());
      }
      nameToTargetIds.get(name)!.add(target.targetId);
    }
  }

  // Build targetId to dependentIds map
  const targetIdToDependentIds = new Map<string, Set<string>>();

  // Initialize from baseline
  for (const target of baselineTargets.graph) {
    if (!targetIdToDependentIds.has(target.targetId)) {
      targetIdToDependentIds.set(target.targetId, new Set());
    }
    const dependentIds = targetIdToDependentIds.get(target.targetId);
    if (dependentIds) {
      for (const dependentId of target.dependents) {
        dependentIds.add(dependentId);
      }
    }
  }

  // Add additional targets
  for (const targets of additionalTargets) {
    for (const target of targets.graph) {
      if (!targetIdToDependentIds.has(target.targetId)) {
        targetIdToDependentIds.set(target.targetId, new Set());
      }

      const dependentIds = targetIdToDependentIds.get(target.targetId);
      if (dependentIds) {
        for (const dependentId of target.dependents) {
          dependentIds.add(dependentId);
        }
      }

      // Also update the dependency's dependent list
      for (const dependencyTargetId of target.dependencies) {
        const dependencyDependentIds =
          targetIdToDependentIds.get(dependencyTargetId);
        if (dependencyDependentIds) {
          dependencyDependentIds.add(target.targetId);
        }
      }
    }
  }

  return { targetIdToDependentIds, targetIdToName, nameToTargetIds };
}