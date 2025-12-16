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
      `Baseline commit ${baselineTargets.commitSha} must have full-dag mode, got ${baselineTargets.mode}`
    );
  }

  const targetIdToName = new Map<string, string>();
  const nameToTargetIds = new Map<string, Set<string>>();

  for (const target of baselineTargets.tasks) {
    targetIdToName.set(target.taskId, target.package);
    if (!nameToTargetIds.has(target.package)) {
      nameToTargetIds.set(target.package, new Set());
    }
    nameToTargetIds.get(target.package)!.add(target.taskId);
  }

  for (const targets of additionalTargets) {
    for (const target of targets.tasks) {
      targetIdToName.set(target.taskId, target.package);
      if (!nameToTargetIds.has(target.package)) {
        nameToTargetIds.set(target.package, new Set());
      }
      nameToTargetIds.get(target.package)!.add(target.taskId);
    }
  }

  const targetIdToDependentIds = new Map<string, Set<string>>();

  for (const target of baselineTargets.tasks) {
    if (!targetIdToDependentIds.has(target.taskId)) {
      targetIdToDependentIds.set(target.taskId, new Set());
    }
    const dependentIds = targetIdToDependentIds.get(target.taskId);
    if (dependentIds) {
      for (const dependentId of target.dependents) {
        dependentIds.add(dependentId);
      }
    }
  }

  for (const targets of additionalTargets) {
    for (const target of targets.tasks) {
      if (!targetIdToDependentIds.has(target.taskId)) {
        targetIdToDependentIds.set(target.taskId, new Set());
      }

      const dependentIds = targetIdToDependentIds.get(target.taskId);
      if (dependentIds) {
        for (const dependentId of target.dependents) {
          dependentIds.add(dependentId);
        }
      }

      for (const dependencyTargetId of target.dependencies) {
        const dependencyDependentIds =
          targetIdToDependentIds.get(dependencyTargetId);
        if (dependencyDependentIds) {
          dependencyDependentIds.add(target.taskId);
        }
      }
    }
  }

  return { targetIdToDependentIds, targetIdToName, nameToTargetIds };
}
