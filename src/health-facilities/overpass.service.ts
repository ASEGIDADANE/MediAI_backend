import { Injectable, Logger } from '@nestjs/common';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { HealthcareFacilityType } from '../generated/prisma/client';
import { HealthcareFacilityDto } from './dto/health-facility-response.dto';

/** Subset of the Overpass JSON shape we care about. */
type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type OverpassQueryArgs = {
  lat: number;
  lng: number;
  radiusKm: number;
  type?: HealthcareFacilityType;
  q?: string;
};

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'MediAI-FacilityLocator/1.0';

/**
 * Pulls real-world healthcare facilities (hospital / pharmacy / clinic /
 * doctors) from the OpenStreetMap Overpass API.
 *
 * Why Overpass:
 * - Free, no API key, decent global coverage including Addis Ababa.
 * - Returns lat/lng + opaque OSM tags from which we can derive name, address,
 *   phone, opening_hours, etc.
 *
 * What this layer does:
 * - Issues a single Overpass QL query covering nodes + ways within a radius.
 * - Maps OSM `amenity=*` to our `HealthcareFacilityType` (mapping `doctors` to
 *   `clinic` because we only model three types).
 * - Drops unnamed POIs (tagging quality varies; an unnamed pharmacy is noise).
 * - Computes Haversine `distanceKm` from the user's coords.
 * - In-memory TTL cache keyed by the request shape so we don't bombard
 *   Overpass with identical calls (and to keep the page fast on retries).
 */
@Injectable()
export class OverpassService {
  private readonly logger = new Logger(OverpassService.name);
  private readonly cache = new Map<
    string,
    { data: HealthcareFacilityDto[]; expiresAt: number }
  >();

  async findNearby(args: OverpassQueryArgs): Promise<HealthcareFacilityDto[]> {
    const radiusKm = clamp(
      args.radiusKm ?? DEFAULT_RADIUS_KM,
      0.5,
      MAX_RADIUS_KM,
    );

    const cacheKey = this.buildCacheKey({ ...args, radiusKm });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.applyTextFilter(cached.data, args.q);
    }

    const radiusM = Math.round(radiusKm * 1000);
    const amenities = this.amenitiesFor(args.type);
    const query = this.buildOverpassQuery({
      lat: args.lat,
      lng: args.lng,
      radiusM,
      amenities,
    });

    let payload: OverpassResponse;
    try {
      payload = await this.callOverpass(query);
    } catch (err) {
      this.logger.warn(
        `Overpass call failed (lat=${args.lat}, lng=${args.lng}, r=${radiusKm}km): ${describeError(err)}`,
      );
      return [];
    }

    const elements = payload.elements ?? [];
    const facilities = this.mapElements(elements, args.lat, args.lng);

    this.cache.set(cacheKey, {
      data: facilities,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return this.applyTextFilter(facilities, args.q);
  }

  /**
   * Issues the POST to Overpass via Node's `https` module instead of the
   * built-in `fetch`. Reason: in long-running Nest processes the undici
   * connection pool that powers `fetch` can hold on to a half-dead socket
   * after a single network blip, after which every subsequent fetch in the
   * same process throws the opaque "fetch failed" error — even though a
   * fresh `curl` from the same machine still works. Using `https` with
   * `Connection: close` opens a brand-new TCP connection per call, which
   * is fine for an external API we hit at most a few times a minute.
   */
  private callOverpass(query: string): Promise<OverpassResponse> {
    const url = new URL(ENDPOINT);
    const body = `data=${encodeURIComponent(query)}`;
    return new Promise<OverpassResponse>((resolve, reject) => {
      const req = httpsRequest(
        {
          method: 'POST',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            Connection: 'close',
          },
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new Error(`Overpass HTTP ${status}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve(JSON.parse(text) as OverpassResponse);
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Overpass request timed out'));
      });
      req.write(body);
      req.end();
    });
  }

  private buildOverpassQuery(args: {
    lat: number;
    lng: number;
    radiusM: number;
    amenities: string[];
  }): string {
    const { lat, lng, radiusM, amenities } = args;
    const blocks = amenities
      .map(
        (amenity) =>
          `node["amenity"="${amenity}"](around:${radiusM},${lat},${lng});\n` +
          `way["amenity"="${amenity}"](around:${radiusM},${lat},${lng});\n` +
          `relation["amenity"="${amenity}"](around:${radiusM},${lat},${lng});`,
      )
      .join('\n');
    // `out center tags` makes ways/relations return a representative point,
    // which is what we want for a pin on the map.
    return `[out:json][timeout:25];\n(\n${blocks}\n);\nout center tags 200;`;
  }

  private amenitiesFor(type?: HealthcareFacilityType): string[] {
    switch (type) {
      case HealthcareFacilityType.hospital:
        return ['hospital'];
      case HealthcareFacilityType.pharmacy:
        return ['pharmacy'];
      case HealthcareFacilityType.clinic:
        return ['clinic', 'doctors'];
      default:
        return ['hospital', 'clinic', 'pharmacy', 'doctors'];
    }
  }

  private mapElements(
    elements: OverpassElement[],
    userLat: number,
    userLng: number,
  ): HealthcareFacilityDto[] {
    const seen = new Set<string>();
    const out: HealthcareFacilityDto[] = [];
    for (const el of elements) {
      const facility = this.mapElement(el, userLat, userLng);
      if (!facility) continue;
      if (seen.has(facility.id)) continue;
      seen.add(facility.id);
      out.push(facility);
    }
    out.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return out;
  }

  private mapElement(
    el: OverpassElement,
    userLat: number,
    userLng: number,
  ): HealthcareFacilityDto | null {
    const tags = el.tags ?? {};
    const name = (tags.name ?? '').trim();
    if (!name) return null;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) return null;

    const type = this.amenityToType(tags.amenity);
    if (!type) return null;

    const distanceKm = haversineKm(userLat, userLng, lat, lng);
    const address =
      buildAddress(tags) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const phone = (tags.phone ?? tags['contact:phone'] ?? '').trim();

    return {
      id: `osm-${el.type}-${el.id}`,
      name,
      type,
      address,
      phone: phone || undefined,
      // OSM doesn't carry user ratings; leaving undefined so the UI can hide
      // the star badge entirely rather than displaying a misleading 0.0.
      rating: undefined,
      verified: false,
      latitude: lat,
      longitude: lng,
      // We don't parse `opening_hours` reliably yet; mark unknown so the UI
      // doesn't flash a confident "Closed".
      openNow: undefined,
      distanceKm: Number(distanceKm.toFixed(2)),
      source: 'osm',
    };
  }

  private amenityToType(amenity?: string): HealthcareFacilityType | null {
    switch (amenity) {
      case 'hospital':
        return HealthcareFacilityType.hospital;
      case 'pharmacy':
        return HealthcareFacilityType.pharmacy;
      case 'clinic':
      case 'doctors':
        return HealthcareFacilityType.clinic;
      default:
        return null;
    }
  }

  private applyTextFilter(
    rows: HealthcareFacilityDto[],
    q?: string,
  ): HealthcareFacilityDto[] {
    if (!q) return rows;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.address.toLowerCase().includes(needle),
    );
  }

  private buildCacheKey(args: {
    lat: number;
    lng: number;
    radiusKm: number;
    type?: HealthcareFacilityType;
  }): string {
    // Bucket coords to ~110 m so nearby tiles share a cache entry.
    const lat = args.lat.toFixed(3);
    const lng = args.lng.toFixed(3);
    const r = args.radiusKm.toFixed(1);
    const t = args.type ?? 'all';
    return `${lat}|${lng}|${r}|${t}`;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error';
  const cause = (err as Error & { cause?: unknown }).cause;
  let detail = err.message || err.name || 'unknown error';
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: string }).code;
    detail += ` (cause: ${cause.name}${code ? ` ${code}` : ''}: ${cause.message})`;
  } else if (cause) {
    try {
      detail += ` (cause: ${JSON.stringify(cause)})`;
    } catch {
      detail += ' (cause: <unserialisable>)';
    }
  }
  return detail;
}

function buildAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  return parts.join(', ').trim();
}
