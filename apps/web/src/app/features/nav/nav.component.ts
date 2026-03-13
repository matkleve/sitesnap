/**
 * NavComponent — LeftSidebar: floating sidebar panel (desktop) or
 * bottom tab bar (mobile < 768 px).
 *
 * M-UI2: App Shell & Navigation
 *
 * Design: Claude-inspired frosted glass, vertically centred compact rail on the
 * left edge. At rest, nav items are square icon buttons. On hover, the rail
 * expands right and reveals labels without shifting icon alignment. Uses Google
 * Material Icons.
 *
 * Ground rules:
 *  - Standalone component; imports only what the template uses.
 *  - AuthService.user() provides the email initial for the avatar slot.
 *  - Disabled nav items are non-interactive (pointer-events: none) and carry
 *    aria-disabled="true" for accessibility.
 *  - routerLinkActive uses exact matching for '/' to avoid it always being active.
 */

import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';

export interface NavItem {
  /** Google Material Icon ligature name (e.g. 'map', 'photo_camera'). */
  icon: string;
  label: string;
  route: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss',
})
export class NavComponent {
  private readonly authService = inject(AuthService);

  /** Nav items in display order. Items with disabled: true are visually greyed
   *  out and non-interactive — reserved for future features. */
  navItems: NavItem[] = [
    { icon: 'map', label: 'Map', route: '/' },
    { icon: 'photo_camera', label: 'Photos', route: '/photos' },
    { icon: 'folder', label: 'Projects', route: '/groups' },
  ];

  readonly avatarName = computed<string>(() => {
    const user = this.authService.user();
    const fullName = user?.user_metadata?.['full_name'];

    if (typeof fullName === 'string' && fullName.trim().length > 0) {
      return fullName.trim();
    }

    const email = user?.email;
    if (typeof email === 'string' && email.includes('@')) {
      return email.split('@')[0];
    }

    return '';
  });

  readonly avatarUrl = computed<string | null>(() => {
    const avatarUrl = this.authService.user()?.user_metadata?.['avatar_url'];
    return typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 ? avatarUrl : null;
  });

  /** First letter of the authenticated user's display name, upper-cased.
   *  Falls back to '?' if no user is signed in. */
  readonly avatarInitial = computed<string>(() => {
    const name = this.avatarName();
    return name.length === 0 ? '?' : name[0].toUpperCase();
  });
}
