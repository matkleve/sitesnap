import { Component, input, output } from '@angular/core';

export interface ChipDef {
  icon: string;
  text: string;
  variant?: 'default' | 'filled' | 'success' | 'warning';
  title?: string;
}

@Component({
  selector: 'app-quick-info-chips',
  standalone: true,
  templateUrl: './quick-info-chips.component.html',
  styleUrl: './quick-info-chips.component.scss',
})
export class QuickInfoChipsComponent {
  readonly chips = input.required<ChipDef[]>();
  readonly chipClicked = output<number>();
}
