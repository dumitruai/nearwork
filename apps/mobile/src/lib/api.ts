import {Capacitor} from '@capacitor/core';
import {Geolocation} from '@capacitor/geolocation';

export type Role = 'employee' | 'employer';
export type Category = 'hospitality' | 'retail' | 'delivery' | 'cleaning' | 'warehouse';
export type Point = { latitude: number; longitude: number; label?: string };
export type Preferences = { radiusMeters: number; locationSource: 'device' | null };
export type Profile = {
    categories?: Category[];
    availability?: string[];
    bio?: string | null;
    companyName?: string;
    industry?: string;
    workplaceLabel?: string;
    latitude?: number;
    longitude?: number
};
export type Account = {
    user: { id: string; name: string; email: string; profileType: Role };
    profile: Profile | null;
    preferences: Preferences | null
};
export type Job = {
    id: string;
    role: string;
    companyName?: string;
    category: Category;
    hourlyPayMinor: number;
    weeklyHoursMin: number;
    weeklyHoursMax: number;
    scheduleSummary: string;
    description: string;
    areaLabel: string;
    distanceMeters?: number;
    isDemo: boolean;
    isActive: boolean
};
export type Conversation = {
    id: string;
    jobId: string;
    jobRole: string;
    companyName: string;
    employeeName: string;
    latestMessage?: string | null;
    latestSenderId?: string | null;
    latestAt?: string;
    unreadCount?: number
};
export type Message = {
    id: string;
    clientMessageId: string;
    senderUserId: string;
    body: string;
    createdAt: string;
    readAt: string | null
};
export const initials = (name: string) => name.trim().split(/\s+/).filter(part => /[\p{L}\p{N}]/u.test(part)).slice(0, 2).map(part => part[0]).join('').toUpperCase();
export const money = (minor: number) => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
}).format(minor / 100);
export const formatLocation = (point: Point) => point.label || 'Current location';

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

export const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${base}${path}`, {
            method, credentials: 'include',
            headers: body === undefined && (method === 'GET' || method === 'HEAD') ? {} : {'Content-Type': 'application/json'},
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(method === 'POST' && /\/messages$/.test(path) ? 45000 : 15000),
        });
    } catch {
        throw new ApiError('We couldn’t reach Nearwork. Check your connection and try again.', 0);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.error?.message || payload?.message || 'Something went wrong. Please try again.', response.status);
    return path.startsWith('/api/v1/') ? payload.data : payload;
}

export const api = <T>(path: string, body?: unknown, method?: string) => request<T>(`/api/v1/${path}`, body, method);

export async function locate(prompt = true): Promise<Point> {
    if (Capacitor.isNativePlatform()) {
        try {
            let permission = await Geolocation.checkPermissions();
            if (permission.coarseLocation !== 'granted' && permission.location !== 'granted') {
                if (!prompt || permission.location === 'denied') throw new Error('PERMISSION_DENIED');
                permission = await Geolocation.requestPermissions();
                if (permission.coarseLocation !== 'granted' && permission.location !== 'granted') throw new Error('PERMISSION_DENIED');
            }
            // Precise permission allows GPS when network-based location is unavailable.
            // Keep approximate-only access usable without requesting an upgrade.
            const {coords} = await Geolocation.getCurrentPosition({
                enableHighAccuracy: permission.location === 'granted', timeout: 10000, maximumAge: 60000,
            });
            return {latitude: coords.latitude, longitude: coords.longitude};
        } catch (error) {
            const code = (error as { code?: string }).code;
            if ((error as Error).message === 'PERMISSION_DENIED' || code === 'OS-PLUG-GLOC-0003')
                throw new Error('Location permission was denied. Open Settings → Apps → Nearwork → Permissions → Location, allow access, then retry.');
            if (code === 'OS-PLUG-GLOC-0010')
                throw new Error('Finding your location took too long. Move somewhere with a clearer signal and retry.');
            throw new Error('We couldn’t get your location. Turn on device Location in Settings, then retry.');
        }
    }
    if (!prompt) {
        const permission = await navigator.permissions?.query({name: 'geolocation'}).catch(() => null);
        if (permission?.state !== 'granted') throw new Error('Location permission is required.');
    }
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Location is unavailable. Open Nearwork in a browser or device that supports location access.'));
        navigator.geolocation.getCurrentPosition(
            ({coords}) => resolve({latitude: coords.latitude, longitude: coords.longitude}),
            (error) => reject(new Error(error.code === 1
                ? 'Location permission was denied. Enable it in your browser or device settings and try again.'
                : 'We couldn’t get your location. Check that device location is enabled and try again.')),
            {enableHighAccuracy: false, timeout: 10000, maximumAge: 60000},
        );
    });
}
