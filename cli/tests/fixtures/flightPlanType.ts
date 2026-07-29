// Type-mode override fixture: a plain interface whose overridden member
// carries a JSDoc description (double coverage — the override and the
// description ride the same leaf), plus a literal-union member for the
// enum-upgrade path.
export interface FlightPlan {
  /** Four-letter airport code */
  icao: string;
  aircraft: "C172" | "SR22";
  remarks?: string;
}
