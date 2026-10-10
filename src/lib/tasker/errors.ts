export class TaskerError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "TaskerError"; }
}
export function taskAssert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new TaskerError(message, status);
}
