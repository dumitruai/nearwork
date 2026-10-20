export const categories = ['hospitality', 'retail', 'delivery', 'cleaning', 'warehouse'] as const;
export const availability = ['morning', 'afternoon', 'evening', 'weekend'] as const;

/** Straight-line metres, not travel distance. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (n: number) => n * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}
