export function distanceInMeters(
  first: google.maps.LatLngLiteral,
  second: google.maps.LatLngLiteral,
) {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(second.lat - first.lat);
  const longitudeDifference = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function offsetLatLng(
  center: google.maps.LatLngLiteral,
  northM: number,
  eastM: number,
): google.maps.LatLngLiteral {
  const metersPerDegreeLatitude = 111_320;
  const lat = center.lat + northM / metersPerDegreeLatitude;
  const lng =
    center.lng +
    eastM / (metersPerDegreeLatitude * Math.cos((center.lat * Math.PI) / 180));
  return { lat, lng };
}

export function bearingDegrees(
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const longitudeDifference = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function readableFeatureName(name: string) {
  return name.replaceAll("_", " ");
}

export function resultBadgeClasses(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("high")) return "bg-emerald-100 text-emerald-700";
  if (normalized.includes("low")) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export function resultAccentColors(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("high")) return { ring: "#10b981", text: "text-emerald-700" };
  if (normalized.includes("low")) return { ring: "#ef4444", text: "text-red-700" };
  return { ring: "#f59e0b", text: "text-amber-700" };
}
