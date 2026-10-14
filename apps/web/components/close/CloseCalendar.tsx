import type { TaskStatus } from "@vantiq/domain";

export interface CalendarTask {
  key: string;
  title: string;
  dueDay: number;
  status: TaskStatus;
  late: boolean;
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export const CALENDAR_LEGEND = [
  { label: "Done", color: "var(--favorable)" },
  { label: "Waiting for sign-off", color: "var(--info)" },
  { label: "Late", color: "var(--unfavorable)" },
  { label: "Open", color: "var(--border-strong)" },
];

/**
 * C15 close progress: the close calendar, one column per business day with
 * the tasks due that day, colored by where they stand, and today marked.
 */
export function CloseCalendar({ days, tasks, today }: { days: { day: number; date: string }[]; tasks: CalendarTask[]; today: number }) {
  return (
    <div className="overflow-x-auto" aria-hidden>
      <div className="grid min-w-[720px] gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const isToday = d.day === today;
          const mine = tasks.filter((t) => t.dueDay === d.day);
          return (
            <div key={d.day} className={`flex min-w-0 flex-col gap-1.5 rounded-md p-1.5 ${isToday ? "bg-accent-subtle ring-1 ring-accent/40" : ""}`}>
              <div className="px-0.5">
                <p className="text-[12px] font-semibold text-ink">
                  Day {d.day}
                  {isToday && <span className="ml-1 font-medium text-accent">· today</span>}
                </p>
                <p className="text-[11px] text-ink-3">{dayLabel(d.date)}</p>
              </div>
              {mine.map((t) => {
                const style =
                  t.status === "done"
                    ? "border-l-[var(--favorable)] bg-good/10"
                    : t.late
                      ? "border-l-[var(--unfavorable)] bg-bad/10"
                      : t.status === "prepared"
                        ? "border-l-[var(--info)] bg-info/10"
                        : "border-l-[var(--border-strong)] bg-subtle";
                return (
                  <p key={t.key} title={t.title} className={`rounded-[4px] border-l-[3px] px-1.5 py-1 text-[11px] leading-snug text-ink ${style}`}>
                    <span className="line-clamp-3">{t.title}</span>
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
