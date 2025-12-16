import { type BuildTask, type TurboTask } from "./schemas";

/**
 * Converts a Turbo task to our build-tool agnostic BuildTask format
 */
export function turboTaskToBuildTask(turboTask: TurboTask): BuildTask {
  return {
    taskId: turboTask.taskId,
    task: turboTask.task,
    package: turboTask.package,
    dependencies: turboTask.dependencies,
    dependents: turboTask.dependents,
  };
}
