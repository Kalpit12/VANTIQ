import { DRIVERS } from "@vantiq/domain";

const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-[14px] text-ink";

/** Units and unit cost for each contract driver, named `units-<driver>` and `cost-<driver>`. */
export function DriverFields({ idPrefix }: { idPrefix: string }) {
  return (
    <table className="w-full text-[13px]">
      <thead className="text-left text-[12px] text-ink-3">
        <tr>
          <th className="pb-1 font-medium">Driver</th>
          <th className="pb-1 pl-2 font-medium">Units</th>
          <th className="pb-1 pl-2 font-medium">Price per unit (USD)</th>
        </tr>
      </thead>
      <tbody>
        {DRIVERS.map((d) => (
          <tr key={d.driver}>
            <td className="py-1 pr-2 text-ink">
              {d.label} <span className="text-ink-3">({d.unit})</span>
            </td>
            <td className="py-1 pl-2">
              <label className="sr-only" htmlFor={`${idPrefix}-units-${d.driver}`}>
                {d.label} {d.unit}
              </label>
              <input id={`${idPrefix}-units-${d.driver}`} name={`units-${d.driver}`} inputMode="numeric" pattern="[0-9,]*" className={input} />
            </td>
            <td className="py-1 pl-2">
              <label className="sr-only" htmlFor={`${idPrefix}-cost-${d.driver}`}>
                {d.label} price per {d.unit.replace(/s$/, "")}
              </label>
              <input id={`${idPrefix}-cost-${d.driver}`} name={`cost-${d.driver}`} inputMode="decimal" pattern="[0-9,.$ ]*" className={input} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
