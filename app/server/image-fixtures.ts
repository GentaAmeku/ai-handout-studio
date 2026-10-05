// 位置情報の有無を変えた画像のバイト列を、テストの中で組む(実在の写真は置かない)

const u16 = (value: number, little: boolean): number[] =>
  little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff];
const u32 = (value: number, little: boolean): number[] =>
  little
    ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]
    : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

// IFD0 に tags の項目(値は0)を並べた TIFF
export const tiff = (tags: readonly number[], little = true): number[] => [
  ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
  ...u16(42, little),
  ...u32(8, little),
  ...u16(tags.length, little),
  ...tags.flatMap((tag) => [
    ...u16(tag, little),
    ...u16(4, little),
    ...u32(1, little),
    ...u32(0, little),
  ]),
  ...u32(0, little),
];

export const text = (value: string): number[] =>
  [...value].map((char) => char.charCodeAt(0));
const EXIF = [...text("Exif"), 0, 0];

export const jpeg = (tags: readonly number[], little = true): Uint8Array => {
  const body = [...EXIF, ...tiff(tags, little)];
  return Uint8Array.from([
    0xff,
    0xd8,
    // APP0 を先に置き、APP1 まで読み進められるかも見る
    0xff,
    0xe0,
    0,
    4,
    0,
    0,
    0xff,
    0xe1,
    ...u16(body.length + 2, false),
    ...body,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ]);
};

export const png = (tags: readonly number[]): Uint8Array => {
  const data = tiff(tags);
  const chunk = (type: string, payload: readonly number[]): number[] => [
    ...u32(payload.length, false),
    ...text(type),
    ...payload,
    0,
    0,
    0,
    0,
  ];
  return Uint8Array.from([
    0x89,
    ...text("PNG"),
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...chunk("eXIf", data),
    ...chunk("IEND", []),
  ]);
};

export const webp = (tags: readonly number[]): Uint8Array => {
  const data = tiff(tags);
  const padded = data.length % 2 === 0 ? data : [...data, 0];
  const vp8x = [...text("VP8X"), ...u32(10, true), ...new Array(10).fill(0)];
  const exif = [...text("EXIF"), ...u32(data.length, true), ...padded];
  const rest = [...text("WEBP"), ...vp8x, ...exif];
  return Uint8Array.from([...text("RIFF"), ...u32(rest.length, true), ...rest]);
};
