import {
    Component,
    HostListener,
    OnDestroy,
    input,
    output,
    signal,
} from '@angular/core';

/**
 * DragDividerComponent — vertical resize handle between Map Zone and Workspace Pane.
 *
 * Pointer drag, double-click reset, and keyboard arrow/Home/End resize are supported.
 * Hidden on mobile (< 768px) by the parent via @if.
 */
@Component({
    selector: 'app-drag-divider',
    templateUrl: './drag-divider.component.html',
    styleUrl: './drag-divider.component.scss',
    host: {
        role: 'separator',
        '[attr.aria-orientation]': '"vertical"',
        '[attr.aria-valuenow]': 'currentWidth()',
        '[attr.aria-valuemin]': 'minWidth()',
        '[attr.aria-valuemax]': 'maxWidth()',
        '[attr.tabindex]': '"0"',
        '[class.dragging]': 'dragging()',
    },
})
export class DragDividerComponent implements OnDestroy {
    // ── Inputs from parent ───────────────────────────────────────────────────
    readonly currentWidth = input.required<number>();
    readonly minWidth = input<number>(280);
    readonly maxWidth = input<number>(640);
    readonly defaultWidth = input<number>(360);

    // ── Outputs to parent ────────────────────────────────────────────────────
    readonly widthChange = output<number>();

    // ── Internal state ───────────────────────────────────────────────────────
    readonly dragging = signal(false);

    /** X coordinate at drag start, used to calculate delta. */
    private dragStartX = 0;
    /** Workspace width at drag start. */
    private dragStartWidth = 0;

    // Bound listeners stored for cleanup.
    private readonly onPointerMoveBound = this.onPointerMove.bind(this);
    private readonly onPointerUpBound = this.onPointerUp.bind(this);

    // ── Pointer drag (Actions #2–4) ──────────────────────────────────────────

    onPointerDown(event: PointerEvent): void {
        event.preventDefault();
        this.dragging.set(true);
        this.dragStartX = event.clientX;
        this.dragStartWidth = this.currentWidth();

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        document.addEventListener('pointermove', this.onPointerMoveBound);
        document.addEventListener('pointerup', this.onPointerUpBound);
        document.addEventListener('pointercancel', this.onPointerUpBound);
    }

    private onPointerMove(event: PointerEvent): void {
        // Divider is to the left of the workspace pane, so moving the cursor
        // to the left (negative delta) should increase workspace width.
        const delta = this.dragStartX - event.clientX;
        const newWidth = this.clamp(this.dragStartWidth + delta);
        this.widthChange.emit(newWidth);
    }

    private onPointerUp(): void {
        this.dragging.set(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        document.removeEventListener('pointermove', this.onPointerMoveBound);
        document.removeEventListener('pointerup', this.onPointerUpBound);
        document.removeEventListener('pointercancel', this.onPointerUpBound);
    }

    // ── Double-click reset (Action #5) ───────────────────────────────────────

    onDoubleClick(): void {
        this.widthChange.emit(this.defaultWidth());
    }

    // ── Keyboard resize (Actions #6–7) ───────────────────────────────────────

    @HostListener('keydown', ['$event'])
    onKeyDown(event: KeyboardEvent): void {
        const STEP = 8; // 0.5rem = 8px
        let newWidth: number | null = null;

        switch (event.key) {
            case 'ArrowLeft':
                // Expand workspace (move divider left)
                newWidth = this.clamp(this.currentWidth() + STEP);
                break;
            case 'ArrowRight':
                // Shrink workspace (move divider right)
                newWidth = this.clamp(this.currentWidth() - STEP);
                break;
            case 'Home':
                newWidth = this.minWidth();
                break;
            case 'End':
                newWidth = this.maxWidth();
                break;
            default:
                return; // Don't preventDefault for unrelated keys
        }

        event.preventDefault();
        if (newWidth !== null) {
            this.widthChange.emit(newWidth);
        }
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        // Safety cleanup in case component is destroyed mid-drag.
        if (this.dragging()) {
            this.onPointerUp();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private clamp(value: number): number {
        return Math.max(this.minWidth(), Math.min(this.maxWidth(), value));
    }
}
