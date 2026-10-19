import type { BoolMap } from "./types";

// Own-key reads for the path-keyed maps (errors, touched, isValidating).
// Their keys are user-controlled strings: a schema may declare a field
// named `constructor`, a server response may name `toString`, and
// JSON.parse yields own `__proto__` keys. A bare `map[key]` on a plain
// object walks the prototype chain for those, so an EMPTY error map read
// `Object` as the error list at "constructor" (and `stringArraysEqual`
// then threw inside setState on `.every`), while `touched["toString"]` was
// a truthy function. Every read of these maps by a runtime key goes
// through here; writes are already safe (computed keys and
// Object.fromEntries define own properties).
export const entryAt = <V>(
  map: Readonly<Record<string, V>>,
  key: string,
): V | undefined => (Object.hasOwn(map, key) ? map[key] : undefined);

export const flagAt = (map: BoolMap, key: string): boolean =>
  Object.hasOwn(map, key) && map[key] === true;
