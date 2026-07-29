// The JSDoc-description capture fixture for type mode: a member's leading
// JSDoc description is the TS analogue of zod's `.describe()` — free text
// only, @tags excluded, undocumented members capture nothing.
export type DescribedAircraft = {
  /** 1,000 lbs */
  grossWeight: number;
  /**
   * ICAO code — four capital letters.
   * @example "KSEA"
   */
  origin: string;
  undocumented?: string;
};
