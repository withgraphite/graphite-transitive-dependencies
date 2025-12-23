import { describe, expect, it } from "vitest";
import { buildHydratedDag } from "./build_hydrated_dag";
import { type CachedBuildTargets } from "./schemas";

const createBaselineTargets = (
  targets: { targetName: string; dependents: string[] }[]
): CachedBuildTargets => ({
  version: 2,
  mode: "full-dag",
  headSha: "baseline123",
  targetIds: targets.map((t) => t.targetName),
  graph: targets.map((t) => ({
    targetId: `${t.targetName}#build`,
    targetName: t.targetName,
    dependencies: [],
    dependents: t.dependents.map((d) => `${d}#build`),
  })),
});

const createPartialTargets = (
  headSha: string,
  targetIds: string[],
  targets?: { targetName: string; dependents: string[] }[]
): CachedBuildTargets => ({
  version: 2,
  mode: "filtered",
  baseSha: "base123",
  headSha,
  targetIds,
  graph:
    targets?.map((t) => ({
      targetId: `${t.targetName}#build`,
      targetName: t.targetName,
      dependencies: [],
      dependents: t.dependents.map((d) => `${d}#build`),
    })) ??
    targetIds.map((name) => ({
      targetId: `${name}#build`,
      targetName: name,
      dependencies: [],
      dependents: [],
    })),
});

describe("buildHydratedDag", () => {
  [
    {
      desc: "should build DAG from baseline targets only",
      baselineTargets: createBaselineTargets([
        {
          targetName: "@monologue/db-client",
          dependents: ["@monologue/server"],
        },
        { targetName: "@monologue/server", dependents: [] },
      ]),
      additionalTargets: [],
      expectedDag: new Map([
        ["@monologue/db-client#build", new Set(["@monologue/server#build"])],
        ["@monologue/server#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@monologue/db-client#build", "@monologue/db-client"],
        ["@monologue/server#build", "@monologue/server"],
      ]),
    },
    {
      desc: "should merge additional targets into DAG",
      baselineTargets: createBaselineTargets([
        { targetName: "@monologue/utils", dependents: [] },
        { targetName: "@monologue/frontend", dependents: [] },
      ]),
      additionalTargets: [
        createPartialTargets(
          "sha1",
          ["@monologue/frontend"],
          [
            {
              targetName: "@monologue/utils",
              dependents: ["@monologue/frontend"],
            },
            { targetName: "@monologue/frontend", dependents: [] },
          ]
        ),
      ],
      expectedDag: new Map([
        ["@monologue/utils#build", new Set(["@monologue/frontend#build"])],
        ["@monologue/frontend#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@monologue/utils#build", "@monologue/utils"],
        ["@monologue/frontend#build", "@monologue/frontend"],
      ]),
    },
    {
      desc: "should merge multiple additional targets into DAG",
      baselineTargets: createBaselineTargets([
        { targetName: "@monologue/utils", dependents: [] },
        { targetName: "@monologue/frontend", dependents: [] },
        { targetName: "@monologue/backend", dependents: [] },
      ]),
      additionalTargets: [
        createPartialTargets(
          "sha1",
          ["@monologue/frontend"],
          [
            {
              targetName: "@monologue/utils",
              dependents: ["@monologue/frontend"],
            },
            { targetName: "@monologue/frontend", dependents: [] },
          ]
        ),
        createPartialTargets(
          "sha2",
          ["@monologue/backend"],
          [
            {
              targetName: "@monologue/frontend",
              dependents: ["@monologue/backend"],
            },
            { targetName: "@monologue/backend", dependents: [] },
          ]
        ),
      ],
      expectedDag: new Map([
        ["@monologue/utils#build", new Set(["@monologue/frontend#build"])],
        ["@monologue/frontend#build", new Set(["@monologue/backend#build"])],
        ["@monologue/backend#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@monologue/utils#build", "@monologue/utils"],
        ["@monologue/frontend#build", "@monologue/frontend"],
        ["@monologue/backend#build", "@monologue/backend"],
      ]),
    },
  ].forEach((tc) => {
    it(tc.desc, () => {
      const result = buildHydratedDag({
        baselineTargets: tc.baselineTargets,
        additionalTargets: tc.additionalTargets,
      });

      for (const [targetId, expectedDependentIds] of tc.expectedDag) {
        const actualDependentIds = result.targetIdToDependentIds.get(targetId);
        if (!actualDependentIds) {
          throw new Error(
            `Expected to find dependents for targetId ${targetId}`
          );
        }
        expect(actualDependentIds).toEqual(expectedDependentIds);
      }

      for (const [targetId, expectedName] of tc.expectedNames) {
        const actualName = result.targetIdToName.get(targetId);
        expect(actualName).toEqual(expectedName);
      }
    });
  });

  it("should throw when baseline is not full-dag mode", () => {
    const filteredBaseline: CachedBuildTargets = {
      version: 2,
      mode: "filtered",
      baseSha: "base123",
      headSha: "abc123",
      targetIds: [],
      graph: [],
    };

    expect(() =>
      buildHydratedDag({
        baselineTargets: filteredBaseline,
        additionalTargets: [],
      })
    ).toThrow("must have full-dag mode");
  });

  it("should use additionalTargets to overwrite taskId to name mapping", () => {
    const result = buildHydratedDag({
      baselineTargets: createBaselineTargets([
        { targetName: "@monologue/pkg-a", dependents: [] },
      ]),
      additionalTargets: [
        {
          version: 2,
          mode: "filtered",
          baseSha: "base123",
          headSha: "sha1",
          targetIds: ["@monologue/renamed-pkg-a"],
          graph: [
            {
              targetId: "@monologue/pkg-a#build",
              targetName: "@monologue/renamed-pkg-a",
              dependencies: [],
              dependents: [],
            },
          ],
        },
      ],
    });

    expect(result.targetIdToName.get("@monologue/pkg-a#build")).toEqual(
      "@monologue/renamed-pkg-a"
    );
  });

  it("should update baseline dependents from additionalTargets dependencies", () => {
    const result = buildHydratedDag({
      baselineTargets: createBaselineTargets([
        { targetName: "@monologue/utils", dependents: [] },
        { targetName: "@monologue/frontend", dependents: [] },
      ]),
      additionalTargets: [
        {
          version: 2,
          mode: "filtered",
          baseSha: "base123",
          headSha: "sha1",
          targetIds: ["@monologue/frontend"],
          graph: [
            {
              targetId: "@monologue/frontend#build",
              targetName: "@monologue/frontend",
              dependencies: ["@monologue/utils#build"],
              dependents: [],
            },
          ],
        },
      ],
    });

    const utilsDependents = result.targetIdToDependentIds.get(
      "@monologue/utils#build"
    );
    expect(utilsDependents).toContain("@monologue/frontend#build");
  });
});