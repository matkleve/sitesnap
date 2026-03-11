import { Injectable, computed, signal } from '@angular/core';
import type { PropertyDefinition } from './property-registry.types';
import type { WorkspaceImage } from './workspace-view.types';

/** Icon mapping per custom property type. */
const TYPE_ICONS: Record<string, string> = {
  text: 'tag',
  select: 'arrow_drop_down_circle',
  number: 'numbers',
  date: 'event',
  checkbox: 'check_box',
};

/**
 * Built-in properties available across all operators.
 * Capabilities determine which operator can use each property.
 */
const BUILT_IN_PROPERTIES: PropertyDefinition[] = [
  {
    id: 'date-captured',
    label: 'Date captured',
    icon: 'schedule',
    type: 'date',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'desc',
    builtIn: true,
  },
  {
    id: 'date-uploaded',
    label: 'Date uploaded',
    icon: 'cloud_upload',
    type: 'date',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'desc',
    builtIn: true,
  },
  {
    id: 'name',
    label: 'Name',
    icon: 'sort_by_alpha',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'distance',
    label: 'Distance',
    icon: 'straighten',
    type: 'number',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'address',
    label: 'Address',
    icon: 'location_on',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'city',
    label: 'City',
    icon: 'location_city',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'district',
    label: 'District',
    icon: 'map',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'street',
    label: 'Street',
    icon: 'signpost',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'country',
    label: 'Country',
    icon: 'flag',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'project',
    label: 'Project',
    icon: 'folder',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
  {
    id: 'date',
    label: 'Date',
    icon: 'schedule',
    type: 'date',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'desc',
    builtIn: true,
  },
  {
    id: 'year',
    label: 'Year',
    icon: 'calendar_today',
    type: 'date',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'desc',
    builtIn: true,
  },
  {
    id: 'month',
    label: 'Month',
    icon: 'date_range',
    type: 'date',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: false },
    defaultSortDirection: 'desc',
    builtIn: true,
  },
  {
    id: 'user',
    label: 'User',
    icon: 'person',
    type: 'text',
    capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
    defaultSortDirection: 'asc',
    builtIn: true,
  },
];

/** Field mapping for built-in properties → WorkspaceImage fields. */
const BUILT_IN_FIELD_MAP: Record<string, (img: WorkspaceImage) => string | number | null> = {
  'date-captured': (img) => img.capturedAt,
  captured_at: (img) => img.capturedAt,
  'date-uploaded': (img) => img.createdAt,
  created_at: (img) => img.createdAt,
  name: (img) => img.storagePath,
  distance: () => null, // computed externally from user location
  address: (img) => img.addressLabel,
  city: (img) => img.city,
  district: (img) => img.district,
  street: (img) => img.street,
  country: (img) => img.country,
  project: (img) => img.projectName,
  date: (img) => img.capturedAt,
  year: (img) => img.capturedAt,
  month: (img) => img.capturedAt,
  user: (img) => img.userName,
};

/** Group heading formatters for built-in properties. */
const BUILT_IN_GROUP_FORMAT: Record<string, (img: WorkspaceImage) => string> = {
  'date-captured': (img) => {
    if (!img.capturedAt) return 'Unknown date';
    return new Date(img.capturedAt).toLocaleDateString('de-AT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },
  'date-uploaded': (img) => {
    if (!img.createdAt) return 'Unknown date';
    return new Date(img.createdAt).toLocaleDateString('de-AT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },
  name: (img) => img.storagePath ?? 'Unnamed',
  distance: () => 'Unknown distance',
  project: (img) => img.projectName ?? 'No project',
  date: (img) => {
    if (!img.capturedAt) return 'Unknown date';
    return new Date(img.capturedAt).toLocaleDateString('de-AT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },
  year: (img) => {
    if (!img.capturedAt) return 'Unknown year';
    return new Date(img.capturedAt).getFullYear().toString();
  },
  month: (img) => {
    if (!img.capturedAt) return 'Unknown month';
    return new Date(img.capturedAt).toLocaleDateString('de-AT', {
      year: 'numeric',
      month: 'long',
    });
  },
  city: (img) => img.city ?? 'Unknown city',
  district: (img) => img.district ?? 'Unknown district',
  street: (img) => img.street ?? 'Unknown street',
  country: (img) => img.country ?? 'Unknown country',
  address: (img) => img.addressLabel ?? 'Unknown address',
  user: (img) => img.userName ?? 'Unknown user',
};

@Injectable({ providedIn: 'root' })
export class PropertyRegistryService {
  /** Custom properties loaded from MetadataService. */
  readonly customProperties = signal<PropertyDefinition[]>([]);

  /** All available properties: built-in + custom. */
  readonly allProperties = computed<PropertyDefinition[]>(() => [
    ...BUILT_IN_PROPERTIES,
    ...this.customProperties(),
  ]);

  /** Properties that can be used in the sort operator. */
  readonly sortableProperties = computed(() =>
    this.allProperties().filter((p) => p.capabilities.sortable),
  );

  /** Properties that can be used in the grouping operator. */
  readonly groupableProperties = computed(() =>
    this.allProperties().filter((p) => p.capabilities.groupable),
  );

  /** Properties that can be used in the filter operator. */
  readonly filterableProperties = computed(() =>
    this.allProperties().filter((p) => p.capabilities.filterable),
  );

  /** Properties that can be used in search. */
  readonly searchableProperties = computed(() =>
    this.allProperties().filter((p) => p.capabilities.searchable),
  );

  /** Look up a property definition by ID. */
  getProperty(id: string): PropertyDefinition | undefined {
    return this.allProperties().find((p) => p.id === id);
  }

  /**
   * Resolve the sortable value of a property for a given image.
   * Returns the raw value for sorting (string, number, or null).
   */
  getSortValue(img: WorkspaceImage, propertyId: string): string | number | null {
    const resolver = BUILT_IN_FIELD_MAP[propertyId];
    if (resolver) return resolver(img);

    // Custom property — look up in image metadata (if available)
    return this.getCustomPropertyValue(img, propertyId);
  }

  /**
   * Resolve the group heading for a property on a given image.
   * Returns a formatted string suitable for display as a group heading.
   */
  getGroupValue(img: WorkspaceImage, propertyId: string): string {
    const formatter = BUILT_IN_GROUP_FORMAT[propertyId];
    if (formatter) return formatter(img);

    // Custom property — prefix with property label
    const value = this.getCustomPropertyValue(img, propertyId);
    const label = this.getProperty(propertyId)?.label ?? propertyId;
    if (value == null || value === '') return `No ${label}`;
    return `${label} ${value}`;
  }

  /**
   * Resolve a filter field value for a given image.
   * Used by FilterService for client-side filtering.
   */
  getFieldValue(img: WorkspaceImage, propertyId: string): string | null {
    const resolver = BUILT_IN_FIELD_MAP[propertyId];
    if (resolver) {
      const val = resolver(img);
      return val != null ? String(val) : null;
    }

    const customVal = this.getCustomPropertyValue(img, propertyId);
    return customVal != null ? String(customVal) : null;
  }

  /**
   * Register custom properties from MetadataService.
   * Called when org properties are fetched from the database.
   */
  setCustomProperties(keys: Array<{ id: string; key_name: string; key_type: string }>): void {
    const mapped: PropertyDefinition[] = keys.map((k) => ({
      id: k.id,
      label: k.key_name,
      icon: TYPE_ICONS[k.key_type] ?? 'tag',
      type: k.key_type as PropertyDefinition['type'],
      capabilities: { sortable: true, groupable: true, filterable: true, searchable: true },
      defaultSortDirection: 'asc' as const,
      builtIn: false,
    }));
    this.customProperties.set(mapped);
  }

  /**
   * Get a custom property value from an image's metadata.
   * For number-type properties, parses the string to a float for numeric comparison.
   */
  private getCustomPropertyValue(img: WorkspaceImage, propertyId: string): string | number | null {
    const metadata = img.metadata;
    if (!metadata) return null;
    const raw = metadata[propertyId];
    if (raw == null || raw === '') return null;

    // For number-type properties, parse as float for numeric sorting/comparison.
    const prop = this.getProperty(propertyId);
    if (prop?.type === 'number') {
      const num = parseFloat(raw);
      return Number.isNaN(num) ? null : num;
    }

    return raw;
  }
}
