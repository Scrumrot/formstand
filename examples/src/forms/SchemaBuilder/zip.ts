// A minimal STORE-only (no compression) zip writer, so "Download .zip"
// needs no dependency: generated sources are a few KB, and the whole format
// for uncompressed entries is three record types and a CRC. Pure
// bytes-in/bytes-out, deterministic (fixed 1980-01-01 timestamps).

export type ZipEntry = Readonly<{ path: string; content: string }>;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>(
    (crc) => (crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1),
    n,
  ),
);

const crc32 = (bytes: Uint8Array): number =>
  (bytes.reduce(
    (crc, byte) => (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8),
    0xffffffff,
  ) ^
    0xffffffff) >>>
  0;

// Little-endian byte split, the only encoding zip uses.
const le = (value: number, size: number): readonly number[] =>
  Array.from({ length: size }, (_, index) => (value >>> (8 * index)) & 0xff);

// DOS timestamp for 1980-01-01 00:00 — fixed so the same input always
// produces the same archive.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

export const makeZip = (entries: readonly ZipEntry[]): Uint8Array => {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    return { name, data, crc: crc32(data) };
  });

  const sharedFields = (file: (typeof files)[number]): readonly number[] => [
    ...le(20, 2), // version needed: 2.0
    ...le(0x0800, 2), // flags: UTF-8 names
    ...le(0, 2), // method: STORE
    ...le(DOS_TIME, 2),
    ...le(DOS_DATE, 2),
    ...le(file.crc, 4),
    ...le(file.data.length, 4), // compressed size (= raw under STORE)
    ...le(file.data.length, 4), // uncompressed size
    ...le(file.name.length, 2),
    ...le(0, 2), // extra length
  ];

  const locals = files.map((file) => [
    ...le(0x04034b50, 4), // local file header
    ...sharedFields(file),
    ...file.name,
    ...file.data,
  ]);
  const offsets = locals.reduce<readonly number[]>(
    (acc, local) => [...acc, (acc[acc.length - 1] ?? 0) + local.length],
    [0],
  );

  const central = files.flatMap((file, index) => [
    ...le(0x02014b50, 4), // central directory header
    ...le(20, 2), // version made by
    ...sharedFields(file),
    ...le(0, 2), // comment length
    ...le(0, 2), // disk number
    ...le(0, 2), // internal attrs
    ...le(0, 4), // external attrs
    ...le(offsets[index] ?? 0, 4),
    ...file.name,
  ]);

  const localBytes = locals.flat();
  const end = [
    ...le(0x06054b50, 4), // end of central directory
    ...le(0, 2),
    ...le(0, 2),
    ...le(files.length, 2),
    ...le(files.length, 2),
    ...le(central.length, 4),
    ...le(localBytes.length, 4),
    ...le(0, 2), // comment length
  ];

  return Uint8Array.from([...localBytes, ...central, ...end]);
};
