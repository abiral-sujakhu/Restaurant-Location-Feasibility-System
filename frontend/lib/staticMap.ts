import { offsetLatLng } from "@/lib/utils";

/** ~40-point circle approximation for the Static Maps `path` parameter, using the same
 *  north/east offset math already used elsewhere in the app (lib/utils.ts). */
export function circlePathParam(center: google.maps.LatLngLiteral, radiusM: number, points = 40): string {
  const coords: string[] = [];
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * 2 * Math.PI;
    const { lat, lng } = offsetLatLng(center, radiusM * Math.cos(angle), radiusM * Math.sin(angle));
    coords.push(`${lat.toFixed(6)},${lng.toFixed(6)}`);
  }
  return coords.join("%7C");
}

/** Zoom level that fits a `radiusM` circle within ~80% of the frame's shorter side, using the
 *  standard Web Mercator meters-per-pixel formula -- avoids a hardcoded zoom that cuts the
 *  circle off at some latitudes. */
export function computeZoomForRadius(latitude: number, radiusM: number, framePx: number): number {
  const targetMetersPerPixel = (radiusM * 2) / (framePx * 0.8);
  const metersPerPixelAtZoomZero = 156543.03392 * Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2(metersPerPixelAtZoomZero / targetMetersPerPixel);
  return Math.max(1, Math.min(20, Math.round(zoom)));
}

export type StaticMapOptions = {
  width: number;
  height: number;
  radiusM?: number;
  scale?: number;
};

/** Static Maps API image URL with the analysis-radius circle and a marker at the site --
 *  a plain <img>, so (unlike the interactive WebGL/canvas <GoogleMap>) it captures reliably
 *  with html2canvas for PDF export. Returns null when no Maps API key is configured. */
export function buildStaticMapUrl(
  latitude: number,
  longitude: number,
  { width, height, radiusM = 500, scale = 2 }: StaticMapOptions,
): string | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const center = { lat: latitude, lng: longitude };
  const zoom = computeZoomForRadius(latitude, radiusM, Math.min(width, height));
  const circle = circlePathParam(center, radiusM);

  return (
    "https://maps.googleapis.com/maps/api/staticmap" +
    `?center=${latitude},${longitude}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&scale=${scale}` +
    "&maptype=roadmap" +
    `&path=color:0x2563ebcc%7Cweight:2%7C${circle}` +
    `&markers=color:red%7C${latitude},${longitude}` +
    `&key=${apiKey}`
  );
}
