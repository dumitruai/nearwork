import { locate, type Point } from './api';

// Resolve only freshly acquired device coordinates, directly from the client.
// Keep the display label in memory and out of the preferences API payload.
export async function locateWithLabel(): Promise<Point> {
  const point = await locate();
  try {
    const query = new URLSearchParams({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      localityLanguage: 'en',
    });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${query}`, {
      signal: AbortSignal.timeout(5000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return point;
    const data = await response.json();
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const locality = text(data.locality);
    const city = text(data.city);
    const region = text(data.principalSubdivision);
    const country = text(data.countryName);
    const primary = locality || city || region;
    const parts = [primary, city && city !== primary ? city : country];
    const label = [...new Set(parts.filter(Boolean))].join(', ');
    return label ? { ...point, label } : point;
  } catch {
    // Naming failures must not prevent nearby search with a valid GPS position.
    return point;
  }
}
