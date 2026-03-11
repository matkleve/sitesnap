import { Component, inject, input, output, signal } from '@angular/core';
import { ForwardGeocodeResult, GeocodingService } from '../../../../core/geocoding.service';

@Component({
  selector: 'app-address-search',
  standalone: true,
  templateUrl: './address-search.component.html',
  styleUrl: './address-search.component.scss',
})
export class AddressSearchComponent {
  private readonly geocodingService = inject(GeocodingService);

  readonly currentAddress = input('');
  readonly suggestionApplied = output<ForwardGeocodeResult>();

  readonly active = signal(false);
  readonly query = signal('');
  readonly suggestions = signal<ForwardGeocodeResult[]>([]);
  readonly loading = signal(false);

  private timeout: ReturnType<typeof setTimeout> | null = null;

  open(): void {
    const current = this.currentAddress();
    this.query.set(current);
    this.active.set(true);
    if (current.trim()) this.search(current);
  }

  cancel(): void {
    this.active.set(false);
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

  apply(suggestion: ForwardGeocodeResult): void {
    this.suggestionApplied.emit(suggestion);
    this.active.set(false);
    this.query.set('');
    this.suggestions.set([]);
  }

  private async search(q: string): Promise<void> {
    this.loading.set(true);
    const result = await this.geocodingService.forward(q);
    this.loading.set(false);
    this.suggestions.set(result ? [result] : []);
  }
}
