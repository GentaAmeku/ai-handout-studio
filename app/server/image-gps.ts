// 画像に位置情報(EXIF の GPS)が入っているかを見る小さな読み取り。依存は足さない。
// JPEG の APP1、PNG の eXIf、WebP の EXIF から TIFF を取り出し、IFD0 に GPSInfo(タグ 0x8825)があるかだけを見る

const GPS_INFO_TAG = 0x8825;
const EXIF_HEADER = "Exif\0\0";

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// TIFF(byte order・42・IFD0 の位置)の IFD0 にタグ 0x8825 があるか。壊れていれば false
const tiffHasGps = (tiff: Uint8Array): boolean => {
  if (tiff.length < 8) return false;
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return false;
  const little = order === "II";
  const dv = view(tiff);
  if (dv.getUint16(2, little) !== 42) return false;
  const ifd = dv.getUint32(4, little);
  if (ifd + 2 > tiff.length) return false;
  const count = dv.getUint16(ifd, little);
  return Array.from({ length: count }, (_, index) => ifd + 2 + index * 12)
    .filter((entry) => entry + 12 <= tiff.length)
    .some((entry) => dv.getUint16(entry, little) === GPS_INFO_TAG);
};

const exifPayloadHasGps = (payload: Uint8Array): boolean =>
  tiffHasGps(
    ascii(payload, 0, 6) === EXIF_HEADER ? payload.subarray(6) : payload,
  );

const jpegHasGps = (bytes: Uint8Array): boolean => {
  const dv = view(bytes);
  const scan = (pos: number): boolean => {
    if (pos + 4 > bytes.length || bytes[pos] !== 0xff) return false;
    const marker = bytes[pos + 1] ?? 0;
    // 画像データ(SOS)・終端(EOI)まで来たら、もう APP1 は無い
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === 0xff) return scan(pos + 1);
    const length = dv.getUint16(pos + 2);
    const body = bytes.subarray(pos + 4, pos + 2 + length);
    if (
      marker === 0xe1 &&
      ascii(body, 0, 6) === EXIF_HEADER &&
      exifPayloadHasGps(body)
    ) {
      return true;
    }
    return length < 2 ? false : scan(pos + 2 + length);
  };
  return scan(2);
};

const pngHasGps = (bytes: Uint8Array): boolean => {
  const dv = view(bytes);
  const scan = (pos: number): boolean => {
    if (pos + 12 > bytes.length) return false;
    const length = dv.getUint32(pos);
    const type = ascii(bytes, pos + 4, 4);
    if (type === "eXIf") {
      return exifPayloadHasGps(bytes.subarray(pos + 8, pos + 8 + length));
    }
    return type === "IDAT" || type === "IEND" ? false : scan(pos + 12 + length);
  };
  return scan(8);
};

const webpHasGps = (bytes: Uint8Array): boolean => {
  const dv = view(bytes);
  const scan = (pos: number): boolean => {
    if (pos + 8 > bytes.length) return false;
    const length = dv.getUint32(pos + 4, true);
    if (ascii(bytes, pos, 4) === "EXIF") {
      return exifPayloadHasGps(bytes.subarray(pos + 8, pos + 8 + length));
    }
    return scan(pos + 8 + length + (length % 2));
  };
  return scan(12);
};

export const hasGpsLocation = (bytes: Uint8Array): boolean => {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegHasGps(bytes);
    if (ascii(bytes, 1, 3) === "PNG") return pngHasGps(bytes);
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
      return webpHasGps(bytes);
    }
    return false;
  } catch {
    return false;
  }
};
