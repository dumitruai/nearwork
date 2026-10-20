import type { Point } from './api';

export type AddressResult = Point & { title: string; address: string };

export function parseAddresses(data: unknown): AddressResult[] {
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) {
    throw new Error('Invalid address search response');
  }
  const results: AddressResult[] = [];
  for (const feature of data.features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates) || !properties) continue;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) continue;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(' ');
    const title = text(properties.name) || street || text(properties.city) || text(properties.county);
    const address = [...new Set([title, street, text(properties.postcode), text(properties.city), text(properties.state), text(properties.country)].filter(Boolean))].join(', ');
    if (!title || results.some(result => result.address === address && result.latitude === latitude && result.longitude === longitude)) continue;
    results.push({ title, address, latitude, longitude });
  }
  return results.slice(0, 5);
}

export async function searchAddresses(query: string, signal: AbortSignal, endpoint = 'https://photon.komoot.io/api/'): Promise<AddressResult[]> {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ q: query.trim(), limit: '5', lang: 'en' }).toString();
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Address search unavailable');
  return parseAddresses(await response.json());
}
