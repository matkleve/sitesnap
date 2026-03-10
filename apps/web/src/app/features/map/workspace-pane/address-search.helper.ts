import { WritableSignal } from '@angular/core';
import { ForwardGeocodeResult, GeocodingService } from '../../../core/geocoding.service';
import { SupabaseService } from '../../../core/supabase.service';
import { ImageRecord } from './image-detail-view.types';

/**
 * Encapsulates address-search logic for the image detail view.
 * Operates on signals passed in from the host component.
 */
export class AddressSearchHelper {
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly geocoding: GeocodingService,
    private readonly supabase: SupabaseService,
    private readonly image: WritableSignal<ImageRecord | null>,
    private readonly editingField: WritableSignal<string | null>,
    private readonly query: WritableSignal<string>,
    private readonly suggestions: WritableSignal<ForwardGeocodeResult[]>,
    private readonly loading: WritableSignal<boolean>,
    private readonly fullAddress: () => string,
  ) {}

  open(): void {
    const current = this.fullAddress();
    this.query.set(current);
    this.editingField.set('address_search');
    if (current.trim()) this.search(current);
  }

  cancel(): void {
    this.editingField.set(null);
    this.query.set('');
    this.suggestions.set([]);
  }

  onInput(q: string): void {
    this.query.set(q);
    if (this.timeout) clearTimeout(this.timeout);
    if (!q.trim()) {
      this.suggestions.set([]);
      return;
    }
    this.timeout = setTimeout(() => this.search(q), 400);
  }

  selectFirst(): void {
    const results = this.suggestions();
    if (results.length > 0) this.apply(results[0]);
  }

  async apply(suggestion: ForwardGeocodeResult): Promise<void> {
    const img = this.image();
    if (!img) return;

    this.image.update((prev) =>
      prev
        ? {
            ...prev,
            street: suggestion.street,
            city: suggestion.city,
            district: suggestion.district,
            country: suggestion.country,
            address_label: suggestion.addressLabel,
          }
        : prev,
    );

    this.editingField.set(null);
    this.query.set('');
    this.suggestions.set([]);

    const { error } = await this.supabase.client
      .from('images')
      .update({
        street: suggestion.street,
        city: suggestion.city,
        district: suggestion.district,
        country: suggestion.country,
        address_label: suggestion.addressLabel,
      })
      .eq('id', img.id);

    if (error) {
      this.image.update((prev) =>
        prev
          ? {
              ...prev,
              street: img.street,
              city: img.city,
              district: img.district,
              country: img.country,
              address_label: img.address_label,
            }
          : prev,
      );
    }
  }

  private async search(q: string): Promise<void> {
    this.loading.set(true);
    const result = await this.geocoding.forward(q);
    this.loading.set(false);
    this.suggestions.set(result ? [result] : []);
  }
}
