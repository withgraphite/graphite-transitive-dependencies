import { describe, expect, it } from "vitest";

import { type HydratedDag } from "./build_hydrated_dag";
import {
  computeTransitiveTargets,
  type Target,
} from "./compute_transitive_targets";

function createHydratedDag(
  packageToDependents: Record<string, string[]>
): HydratedDag {
  const targetIdToDependentIds = new Map<string, Set<string>>();
  const targetIdToName = new Map<string, string>();
  const nameToTargetIds = new Map<string, Set<string>>();

  for (const [pkg, dependents] of Object.entries(packageToDependents)) {
    const targetId = `${pkg}#build`;
    targetIdToDependentIds.set(
      targetId,
      new Set(dependents.map((d) => `${d}#build`))
    );
    targetIdToName.set(targetId, pkg);
    nameToTargetIds.set(pkg, new Set([targetId]));
  }

  return { targetIdToDependentIds, targetIdToName, nameToTargetIds };
}

function targetNames(targets: Set<Target>): string[] {
  return [...targets].map((t) => t.name).sort();
}

type TestCase = {
  desc: string;
  directPackageNames: string[];
  packageToDependents: Record<string, string[]>;
  expectedNames: string[];
};

describe("computeTransitiveTargets", () => {
  const testCases: TestCase[] = [
    {
      desc: "should return direct packages when no dependents exist",
      directPackageNames: ["@myorg/server"],
      packageToDependents: { "@myorg/server": [] },
      expectedNames: ["@myorg/server"],
    },
    {
      desc: "should include transitive dependents",
      directPackageNames: ["@myorg/db-client"],
      packageToDependents: {
        "@myorg/db-client": ["@myorg/server"],
        "@myorg/server": [],
      },
      expectedNames: ["@myorg/db-client", "@myorg/server"],
    },
    {
      desc: "should handle multi-level transitive dependents",
      directPackageNames: ["@myorg/utils"],
      packageToDependents: {
        "@myorg/utils": ["@myorg/frontend"],
        "@myorg/frontend": ["@myorg/backend"],
        "@myorg/backend": [],
      },
      expectedNames: ["@myorg/backend", "@myorg/frontend", "@myorg/utils"],
    },
    {
      desc: "should handle multiple direct packages",
      directPackageNames: ["@myorg/utils", "@myorg/api"],
      packageToDependents: {
        "@myorg/utils": ["@myorg/frontend"],
        "@myorg/api": [],
        "@myorg/frontend": [],
      },
      expectedNames: ["@myorg/api", "@myorg/frontend", "@myorg/utils"],
    },
    {
      desc: "should include direct packages not in DAG",
      directPackageNames: ["@myorg/new-package"],
      packageToDependents: { "@myorg/server": [] },
      expectedNames: ["@myorg/new-package"],
    },
    {
      desc: "should handle empty direct packages",
      directPackageNames: [],
      packageToDependents: { "@myorg/server": [] },
      expectedNames: [],
    },
  ];

  testCases.forEach((tc) => {
    it(tc.desc, () => {
      const hydratedDag = createHydratedDag(tc.packageToDependents);

      const result = computeTransitiveTargets({
        directPackageNames: tc.directPackageNames,
        hydratedDag,
      });

      expect(targetNames(result)).toEqual(tc.expectedNames.sort());
    });
  });

  it("should return targets with both id and name", () => {
    const hydratedDag = createHydratedDag({ "@myorg/server": [] });

    const result = computeTransitiveTargets({
      directPackageNames: ["@myorg/server"],
      hydratedDag,
    });

    const target = [...result][0];
    expect(target.id).toBe("@myorg/server#build");
    expect(target.name).toBe("@myorg/server");
  });
});
