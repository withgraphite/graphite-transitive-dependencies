import { type HydratedDag } from "./build_hydrated_dag";

export type Target = {
  id: string;
  name: string;
};

/**
 * Computes the transitive closure of targets given direct package names and a hydrated DAG.
 * Returns a set of all targets (direct + transitive dependents) with both id and name.
 */
export function computeTransitiveTargets({
  directPackageNames,
  hydratedDag,
}: {
  directPackageNames: string[];
  hydratedDag: HydratedDag;
}) {
  const { targetIdToDependentIds, targetIdToName, nameToTargetIds } =
    hydratedDag;

  const packagesNotInDag: string[] = [];

  const directTargetIds: string[] = [];
  for (const name of directPackageNames) {
    const targetIds = nameToTargetIds.get(name);
    if (targetIds) {
      directTargetIds.push(...targetIds);
    } else {
      packagesNotInDag.push(name);
    }
  }

  const resultTargetIds = new Set<string>();
  const toProcess = [...directTargetIds];
  const processed = new Set<string>();

  while (toProcess.length > 0) {
    const targetId = toProcess.shift();
    if (!targetId || processed.has(targetId)) {
      continue;
    }
    processed.add(targetId);
    resultTargetIds.add(targetId);

    const dependentIds = targetIdToDependentIds.get(targetId);
    if (dependentIds) {
      for (const depId of dependentIds) {
        if (!processed.has(depId)) {
          toProcess.push(depId);
        }
      }
    }
  }

  const targets = new Set<Target>();
  for (const targetId of resultTargetIds) {
    const name = targetIdToName.get(targetId);
    if (name) {
      targets.add({ id: targetId, name });
    }
  }

  for (const name of packagesNotInDag) {
    targets.add({ id: name, name });
  }

  return targets;
}
