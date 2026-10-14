import { describe, expect, it } from "vitest";
import { CLOSE_TEMPLATE, closeDay, closeDueDate, closeProgress, isLate, taskStatus, type CloseTask } from "../src";

// October 2026 starts on a Thursday: business day 1 is Oct 1, day 2 Oct 2, day 3 Mon Oct 5.
describe("close calendar", () => {
  it("counts business days into the following month", () => {
    expect(closeDueDate("2026-09", 1)).toBe("2026-10-01");
    expect(closeDueDate("2026-09", 2)).toBe("2026-10-02");
    expect(closeDueDate("2026-09", 3)).toBe("2026-10-05");
    expect(closeDueDate("2026-09", 7)).toBe("2026-10-09");
    // December closes in January: Jan 1 2027 is a Friday, then Mon Jan 4.
    expect(closeDueDate("2026-12", 2)).toBe("2027-01-04");
  });

  it("knows which day of the close it is", () => {
    expect(closeDay("2026-09", "2026-09-30")).toBe(0);
    expect(closeDay("2026-09", "2026-10-01")).toBe(1);
    expect(closeDay("2026-09", "2026-10-04")).toBe(2); // Sunday
    expect(closeDay("2026-09", "2026-10-14")).toBe(10);
  });
});

const task = (over: Partial<CloseTask>): CloseTask => ({
  ...CLOSE_TEMPLATE.find((t) => t.key === "bank")!,
  custom: false,
  ownerId: null,
  ownerName: null,
  reviewerId: null,
  reviewerName: null,
  preparedByName: null,
  preparedAt: null,
  reviewedByName: null,
  reviewedAt: null,
  ...over,
});

describe("task status", () => {
  it("needs the reviewer's sign-off when there is a reviewer", () => {
    expect(taskStatus(task({}), {})).toBe("open");
    expect(taskStatus(task({ preparedAt: "2026-10-02" }), {})).toBe("done");
    expect(taskStatus(task({ preparedAt: "2026-10-02", reviewerId: "r" }), {})).toBe("prepared");
    expect(taskStatus(task({ preparedAt: "2026-10-02", reviewerId: "r", reviewedAt: "2026-10-03" }), {})).toBe("done");
  });

  it("follows Vantiq's own check for automatic tasks, whatever was ticked", () => {
    const t = task({ auto: "mapped", preparedAt: "2026-10-02" });
    expect(taskStatus(t, { mapped: false })).toBe("open");
    expect(taskStatus(t, { mapped: true })).toBe("done");
  });

  it("is late after its due date until it is done", () => {
    expect(isLate("2026-09", { dueDay: 2 }, "open", "2026-10-02")).toBe(false);
    expect(isLate("2026-09", { dueDay: 2 }, "prepared", "2026-10-05")).toBe(true);
    expect(isLate("2026-09", { dueDay: 2 }, "done", "2026-10-05")).toBe(false);
  });
});

describe("close progress", () => {
  it("adds up by section and by day", () => {
    const tasks = [
      { ...task({ key: "a", dueDay: 1, section: "books" }), status: "done" as const },
      { ...task({ key: "b", dueDay: 2, section: "books" }), status: "prepared" as const },
      { ...task({ key: "c", dueDay: 3, section: "review" }), status: "open" as const },
    ];
    const p = closeProgress("2026-09", tasks, "2026-10-05");
    expect(p).toMatchObject({ total: 3, done: 1, prepared: 1, late: 1 });
    expect(p.sections.map((s) => [s.section, s.total, s.done])).toEqual([
      ["books", 2, 1],
      ["review", 1, 0],
    ]);
    expect(p.byDay).toEqual([
      { day: 1, date: "2026-10-01", due: 1, done: 1 },
      { day: 2, date: "2026-10-02", due: 2, done: 1 },
      { day: 3, date: "2026-10-05", due: 3, done: 1 },
    ]);
  });

  it("uses unique keys in the standard checklist", () => {
    expect(new Set(CLOSE_TEMPLATE.map((t) => t.key)).size).toBe(CLOSE_TEMPLATE.length);
  });
});
