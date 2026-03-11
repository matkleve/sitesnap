import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-detail-actions',
  standalone: true,
  templateUrl: './detail-actions.component.html',
  styleUrl: './detail-actions.component.scss',
})
export class DetailActionsComponent {
  readonly hasCoordinates = input(false);

  readonly zoomToLocation = output<void>();
  readonly addToProject = output<void>();
  readonly copyCoordinates = output<void>();
  readonly deleteImage = output<void>();
}
