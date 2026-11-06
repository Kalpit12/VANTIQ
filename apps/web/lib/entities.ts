import { entityLedgerData, Ledger, type ConsolidationResult, type Entity, type FxRate, type LedgerData } from "@vantiq/domain";
import { one, type SearchParams } from "./view";

/** A multi-entity group as the screens see it. */
export interface Group {
  /** Parent first, then by code. */
  entities: Entity[];
  consolidation: ConsolidationResult;
  rates: FxRate[];
  /** One entity on its own, in the reporting currency, with nothing eliminated. */
  ledgerOf(entityId: string): Ledger;
  byId: Map<string, Entity>;
}

export function makeGroup(base: Omit<LedgerData, "transactions" | "budget" | "cash">, consolidation: ConsolidationResult, rates: FxRate[]): Group {
  const cache = new Map<string, Ledger>();
  const entities = consolidation.entities.map((e) => e.entity);
  return {
    entities,
    consolidation,
    rates,
    byId: new Map(entities.map((e) => [e.id, e])),
    ledgerOf(id) {
      let l = cache.get(id);
      if (!l) {
        l = new Ledger(entityLedgerData(base, consolidation, id));
        cache.set(id, l);
      }
      return l;
    },
  };
}

/**
 * The ledger a review screen shows: the consolidated group, or one entity
 * picked with the entity switcher (`?entity=HLX-AU`). Single-entity companies
 * always get their one ledger.
 */
export function selectLedger(ws: { ledger: Ledger; group: Group | null }, sp: SearchParams): { ledger: Ledger; entity: Entity | null } {
  const code = one(sp, "entity");
  const e = code && ws.group ? ws.group.entities.find((x) => x.code === code) : undefined;
  if (!e) return { ledger: ws.ledger, entity: null };
  return { ledger: ws.group!.ledgerOf(e.id), entity: e };
}

/** "Helixa Therapeutics · consolidated, 3 entities" or the entity's name. */
export function scopeLabel(ws: { companyName: string; group: Group | null }, entity: Entity | null): string {
  if (entity) return `${entity.name} (${entity.code}, books in ${entity.currency})`;
  if (ws.group) return `${ws.companyName} · consolidated, ${ws.group.entities.length} entities`;
  return ws.companyName;
}

/** `A$1,234.56` style amounts for an entity's own currency. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "symbol" })
      .format(cents / 100)
      .replace("-", "−");
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
