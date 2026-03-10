export interface ImageRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  latitude: number | null;
  longitude: number | null;
  exif_latitude: number | null;
  exif_longitude: number | null;
  captured_at: string | null;
  created_at: string;
  address_label: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  direction: number | null;
  location_unresolved: boolean | null;
}

export interface MetadataEntry {
  metadataKeyId: string;
  key: string;
  value: string;
}

export interface SelectOption {
  id: string;
  label: string;
}
