import { Component, input, output, signal } from '@angular/core';
import { MetadataPropertyRowComponent } from '../metadata-property-row.component';
import { MetadataEntry } from '../image-detail-view.types';

@Component({
  selector: 'app-metadata-section',
  standalone: true,
  imports: [MetadataPropertyRowComponent],
  templateUrl: './metadata-section.component.html',
  styleUrl: './metadata-section.component.scss',
})
export class MetadataSectionComponent {
  readonly entries = input.required<MetadataEntry[]>();
  readonly allKeyNames = input<string[]>([]);

  readonly valueChanged = output<{ entry: MetadataEntry; newValue: string }>();
  readonly entryRemoved = output<MetadataEntry>();
  readonly entryAdded = output<{ key: string; value: string }>();

  readonly showAddForm = signal(false);
  readonly keySuggestions = signal<string[]>([]);

  onMetadataKeyInput(query: string): void {
    if (!query.trim()) {
      this.keySuggestions.set([]);
      return;
    }

    const lower = query.toLowerCase();
    const existing = new Set(this.entries().map((m) => m.key.toLowerCase()));
    const matches = this.allKeyNames()
      .filter((k) => k.toLowerCase().includes(lower) && !existing.has(k.toLowerCase()))
      .slice(0, 5);

    this.keySuggestions.set(matches);
  }

  addMetadata(key: string, value: string): void {
    if (!key.trim() || !value.trim()) return;
    this.entryAdded.emit({ key: key.trim(), value: value.trim() });
    this.showAddForm.set(false);
    this.keySuggestions.set([]);
  }
}
