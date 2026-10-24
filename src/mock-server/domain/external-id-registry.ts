import { calendarDay } from '../../core';

export interface ExternalIdRegistry {
  /**
   * Records that `externalId` was used by `partnerId` at `at`.
   * @returns `false` when the same partner already used it on the same calendar day.
   */
  claim(partnerId: string, externalId: string, at: Date): boolean;
}

/**
 * "Same day" is evaluated in WIB (UTC+07:00), the business day most Indonesian
 * providers use. Only the current day is kept: when the day changes, older
 * entries can never conflict again, so they are dropped to bound memory.
 */
export class InMemoryExternalIdRegistry implements ExternalIdRegistry {
  private currentDay: string | undefined;
  private readonly claimed = new Set<string>();

  claim(partnerId: string, externalId: string, at: Date): boolean {
    this.rollOverIfNewDay(calendarDay(at));

    const key = `${partnerId}\u0000${externalId}`;
    if (this.claimed.has(key)) {
      return false;
    }
    this.claimed.add(key);
    return true;
  }

  private rollOverIfNewDay(day: string): void {
    if (day !== this.currentDay) {
      this.claimed.clear();
      this.currentDay = day;
    }
  }
}
