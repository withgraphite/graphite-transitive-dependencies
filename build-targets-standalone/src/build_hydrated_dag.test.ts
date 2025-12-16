import { describe, expect, it } from "vitest";

import { buildHydratedDag } from "./build_hydrated_dag";
import { type CachedBuildTargets } from "./schemas";

const createBaselineTargets = (
  tasks: { package: string; dependents: string[] }[]
): CachedBuildTargets => ({
  version: 1,
  commitSha: "baseline123",
  timestamp: "2025-01-17T12:00:00Z",
  mode: "full-dag",
  packages: tasks.map((t) => t.package),
  tasks: tasks.map((t) => ({
    taskId: `${t.package}#build`,
    task: "build",
    package: t.package,
    dependencies: [],
    dependents: t.dependents.map((d) => `${d}#build`),
  })),
});

const createPartialTargets = (
  commitSha: string,
  packages: string[],
  tasks?: { package: string; dependents: string[] }[]
): CachedBuildTargets => ({
  version: 1,
  commitSha,
  timestamp: "2025-01-17T12:00:00Z",
  mode: "filtered",
  packages,
  tasks:
    tasks?.map((t) => ({
      taskId: `${t.package}#build`,
      task: "build",
      package: t.package,
      dependencies: [],
      dependents: t.dependents.map((d) => `${d}#build`),
    })) ??
    packages.map((pkg) => ({
      taskId: `${pkg}#build`,
      task: "build",
      package: pkg,
      dependencies: [],
      dependents: [],
    })),
});

describe("buildHydratedDag", () => {
  [
    {
      desc: "should build DAG from baseline targets only",
      baselineTargets: createBaselineTargets([
        { package: "@myorg/db-client", dependents: ["@myorg/server"] },
        { package: "@myorg/server", dependents: [] },
      ]),
      additionalTargets: [],
      expectedDag: new Map([
        ["@myorg/db-client#build", new Set(["@myorg/server#build"])],
        ["@myorg/server#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@myorg/db-client#build", "@myorg/db-client"],
        ["@myorg/server#build", "@myorg/server"],
      ]),
    },
    {
      desc: "should merge additional targets into DAG",
      baselineTargets: createBaselineTargets([
        { package: "@myorg/utils", dependents: [] },
        { package: "@myorg/frontend", dependents: [] },
      ]),
      additionalTargets: [
        createPartialTargets(
          "sha1",
          ["@myorg/frontend"],
          [
            {
              package: "@myorg/utils",
              dependents: ["@myorg/frontend"],
            },
            { package: "@myorg/frontend", dependents: [] },
          ]
        ),
      ],
      expectedDag: new Map([
        ["@myorg/utils#build", new Set(["@myorg/frontend#build"])],
        ["@myorg/frontend#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@myorg/utils#build", "@myorg/utils"],
        ["@myorg/frontend#build", "@myorg/frontend"],
      ]),
    },
    {
      desc: "should merge multiple additional targets into DAG",
      baselineTargets: createBaselineTargets([
        { package: "@myorg/utils", dependents: [] },
        { package: "@myorg/frontend", dependents: [] },
        { package: "@myorg/backend", dependents: [] },
      ]),
      additionalTargets: [
        createPartialTargets(
          "sha1",
          ["@myorg/frontend"],
          [
            {
              package: "@myorg/utils",
              dependents: ["@myorg/frontend"],
            },
            { package: "@myorg/frontend", dependents: [] },
          ]
        ),
        createPartialTargets(
          "sha2",
          ["@myorg/backend"],
          [
            {
              package: "@myorg/frontend",
              dependents: ["@myorg/backend"],
            },
            { package: "@myorg/backend", dependents: [] },
          ]
        ),
      ],
      expectedDag: new Map([
        ["@myorg/utils#build", new Set(["@myorg/frontend#build"])],
        ["@myorg/frontend#build", new Set(["@myorg/backend#build"])],
        ["@myorg/backend#build", new Set()],
      ]),
      expectedNames: new Map([
        ["@myorg/utils#build", "@myorg/utils"],
        ["@myorg/frontend#build", "@myorg/frontend"],
        ["@myorg/backend#build", "@myorg/backend"],
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
        expect(Array.from(actualDependentIds).sort()).toEqual(
          Array.from(expectedDependentIds).sort()
        );
      }

      for (const [targetId, expectedName] of tc.expectedNames) {
        expect(result.targetIdToName.get(targetId)).toBe(expectedName);
      }
    });
  });

  it("should throw when baseline is not full-dag mode", () => {
    const invalidBaseline = createPartialTargets("sha", ["@myorg/server"]);

    expect(() =>
      buildHydratedDag({
        baselineTargets: invalidBaseline,
        additionalTargets: [],
      })
    ).toThrow("must have full-dag mode");
  });

  it("should use additionalTargets to overwrite taskId to name mapping", () => {
    const baselineTargets: CachedBuildTargets = {
      version: 1,
      commitSha: "baseline123",
      timestamp: "2025-01-17T12:00:00Z",
      mode: "full-dag",
      packages: ["@myorg/old-pkg", "@myorg/consumer"],
      tasks: [
        {
          taskId: "task-123",
          task: "build",
          package: "@myorg/old-pkg",
          dependencies: [],
          dependents: [],
        },
        {
          taskId: "task-456",
          task: "build",
          package: "@myorg/consumer",
          dependencies: ["task-123"],
          dependents: [],
        },
      ],
    };

    const additionalTargets: CachedBuildTargets[] = [
      {
        version: 1,
        commitSha: "additional123",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered",
        packages: ["@myorg/new-pkg"],
        tasks: [
          {
            taskId: "task-123",
            task: "build",
            package: "@myorg/new-pkg",
            dependencies: [],
            dependents: ["task-456"],
          },
        ],
      },
    ];

    const result = buildHydratedDag({
      baselineTargets,
      additionalTargets,
    });

    expect(result.targetIdToDependentIds.get("task-123")).toEqual(
      new Set(["task-456"])
    );
    expect(result.targetIdToDependentIds.get("task-456")).toEqual(new Set());
    expect(result.targetIdToName.get("task-123")).toBe("@myorg/new-pkg");
    expect(result.targetIdToName.get("task-456")).toBe("@myorg/consumer");
  });

  it("should update baseline dependents from additionalTargets dependencies", () => {
    const baselineTargets: CachedBuildTargets = {
      version: 1,
      commitSha: "baseline123",
      timestamp: "2025-01-17T12:00:00Z",
      mode: "full-dag",
      packages: ["@myorg/lib-a", "@myorg/lib-b"],
      tasks: [
        {
          taskId: "task-a",
          task: "build",
          package: "@myorg/lib-a",
          dependencies: [],
          dependents: [],
        },
        {
          taskId: "task-b",
          task: "build",
          package: "@myorg/lib-b",
          dependencies: [],
          dependents: [],
        },
      ],
    };

    const additionalTargets: CachedBuildTargets[] = [
      {
        version: 1,
        commitSha: "pr123",
        timestamp: "2025-01-17T12:00:00Z",
        mode: "filtered",
        packages: ["@myorg/lib-b"],
        tasks: [
          {
            taskId: "task-b",
            task: "build",
            package: "@myorg/lib-b",
            dependencies: ["task-a"],
            dependents: [],
          },
        ],
      },
    ];

    const result = buildHydratedDag({
      baselineTargets,
      additionalTargets,
    });

    expect(result.targetIdToDependentIds.get("task-a")).toEqual(
      new Set(["task-b"])
    );
    expect(result.targetIdToDependentIds.get("task-b")).toEqual(new Set());
  });
});
