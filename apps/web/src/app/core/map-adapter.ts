// MapAdapter abstraction for map operations (Feldpost)
// DO NOT call Leaflet directly from components

export interface LatLng {
    lat: number;
    lng: number;
}

export abstract class MapAdapter {
    /**
     * Requests the user's current position using the browser Geolocation API.
     * Resolves with { lat, lng } or rejects on error.
     */
    abstract getCurrentPosition(): Promise<LatLng>;

    /**
     * Pans the map to the given coordinates.
     */
    abstract panTo(coords: LatLng): void;
}
