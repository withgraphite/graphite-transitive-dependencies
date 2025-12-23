import { describe, expect, it } from "vitest";
import { type HydratedDag } from "./build_hydrated_dag";
import {
  type ComputedTarget,
  computeTransitiveTargets,
} from "./compute_transitive_targets";

// Helper to create a HydratedDag from simple package relationships
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

// Helper to extract names from targets for easier assertion
function targetNames(targets: Set<ComputedTarget>): string[] {
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
      directPackageNames: ["@monologue/server"],
      packageToDependents: { "@monologue/server": [] },
      expectedNames: ["@monologue/server"],
    },
    {
      desc: "should include transitive dependents",
      directPackageNames: ["@monologue/db-client"],
      packageToDependents: {
        "@monologue/db-client": ["@monologue/server"],
        "@monologue/server": [],
      },
      expectedNames: ["@monologue/db-client", "@monologue/server"],
    },
    {
      desc: "should handle multi-level transitive dependents",
      directPackageNames: ["@monologue/utils"],
      packageToDependents: {
        "@monologue/utils": ["@monologue/frontend"],
        "@monologue/frontend": ["@monologue/backend"],
        "@monologue/backend": [],
      },
      expectedNames: [
        "@monologue/backend",
        "@monologue/frontend",
        "@monologue/utils",
      ],
    },
    {
      desc: "should handle multiple direct packages",
      directPackageNames: ["@monologue/utils", "@monologue/api"],
      packageToDependents: {
        "@monologue/utils": ["@monologue/frontend"],
        "@monologue/api": [],
        "@monologue/frontend": [],
      },
      expectedNames: [
        "@monologue/api",
        "@monologue/frontend",
        "@monologue/utils",
      ],
    },
    {
      desc: "should include direct packages not in DAG",
      directPackageNames: ["@monologue/new-package"],
      packageToDependents: { "@monologue/server": [] },
      expectedNames: ["@monologue/new-package"],
    },
    {
      desc: "should handle empty direct packages",
      directPackageNames: [],
      packageToDependents: { "@monologue/server": [] },
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
    const hydratedDag = createHydratedDag({ "@monologue/server": [] });

    const result = computeTransitiveTargets({
      directPackageNames: ["@monologue/server"],
      hydratedDag,
    });

    const target = [...result][0];
    expect(target.id).toEqual("@monologue/server#build");
    expect(target.name).toEqual("@monologue/server");
  });
});
