import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  templateUrl: './photo-lightbox.component.html',
  styleUrl: './photo-lightbox.component.scss',
})
export class PhotoLightboxComponent {
  readonly imageUrl = input.required<string>();
  readonly alt = input<string>('Photo');
  readonly closed = output<void>();
}
