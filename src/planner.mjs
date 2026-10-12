const statuses = new Set(["todo", "doing", "done"]);

export function validateTasks(input) {
  if (!Array.isArray(input)) throw new Error("Tasks must be a JSON array.");
  const ids = new Set();
  return input.map((task, index) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error(`Task ${index + 1} must be an object.`);
    }
    if (typeof task.id !== "string" || !task.id.trim() || ids.has(task.id)) {
      throw new Error(`Task ${index + 1} needs a unique non-empty id.`);
    }
    ids.add(task.id);
    if (typeof task.title !== "string" || !task.title.trim()) {
      throw new Error(`Task ${task.id} needs a title.`);
    }
    if (!statuses.has(task.status)) throw new Error(`Task ${task.id} has an invalid status.`);
    if (!Number.isSafeInteger(task.minutes) || task.minutes <= 0) {
      throw new Error(`Task ${task.id} needs positive whole minutes.`);
    }
    if (typeof task.due !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.due) ||
        Number.isNaN(Date.parse(task.due)) ||
        new Date(task.due).toISOString().slice(0, 10) !== task.due) {
      throw new Error(`Task ${task.id} needs a real YYYY-MM-DD due date.`);
    }
    return { id: task.id, title: task.title, status: task.status, minutes: task.minutes, due: task.due };
  });
}

export function sumMinutes(tasks) {
  return tasks.reduce((sum, task) => {
    if (sum > Number.MAX_SAFE_INTEGER - task.minutes) {
      throw new Error("Total task minutes exceed the safe integer range.");
    }
    return sum + task.minutes;
  }, 0);
}

export function summarize(tasks) {
  return {
    total: tasks.length,
    completed: tasks.filter(task => task.status === "done").length,
    remainingMinutes: sumMinutes(tasks)
  };
}

export function nextTasks(tasks) {
  return tasks.filter(task => task.status !== "done")
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}
