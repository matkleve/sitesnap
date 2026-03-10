/**
 * UploadPanelComponent unit tests.
 *
 * Strategy:
 *  - UploadService is replaced with a fake so no real uploads or EXIF parsing occur.
 *  - Tests verify DOM structure, signal-driven state changes, and pure component
 *    behaviours such as dismissFile() and hasAwaitingPlacement.
 *  - The full async upload pipeline (parseExif → uploadFile) is exercised in
 *    integration tests; here we only test the synchronous state machine and
 *    the reactive template bindings.
 */

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ComponentRef } from '@angular/core';
import {
    UploadPanelComponent,
    FileUploadState,
} from './upload-panel.component';
import { UploadService } from '../../../core/upload.service';

// ── Fake UploadService ─────────────────────────────────────────────────────────

function buildFakeUploadService() {
    return {
        validateFile: vi.fn().mockReturnValue({ valid: true }),
        parseExif: vi.fn().mockResolvedValue({}),
        uploadFile: vi.fn().mockResolvedValue({ error: 'test stub — not called' }),
    };
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeFileState(overrides: Partial<FileUploadState> = {}): FileUploadState {
    return {
        key: crypto.randomUUID(),
        file: new File([new Uint8Array(512)], 'photo.jpg', { type: 'image/jpeg' }),
        status: 'pending',
        progress: 0,
        ...overrides,
    };
}

async function setup() {
    const fakeUploadService = buildFakeUploadService();

    await TestBed.configureTestingModule({
        imports: [UploadPanelComponent],
        providers: [
            { provide: UploadService, useValue: fakeUploadService },
        ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UploadPanelComponent);
    const component = fixture.componentInstance as UploadPanelComponent;
    const ref = fixture.componentRef as ComponentRef<UploadPanelComponent>;
    fixture.detectChanges();
    return { fixture, component, ref, fakeUploadService };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UploadPanelComponent', () => {

    describe('creation', () => {
        it('creates', async () => {
            const { component } = await setup();
            expect(component).toBeTruthy();
        });

        it('starts with an empty file state list', async () => {
            const { component } = await setup();
            expect(component.fileStates()).toHaveLength(0);
        });

        it('starts with isDragging false', async () => {
            const { component } = await setup();
            expect(component.isDragging()).toBe(false);
        });
    });

    describe('DOM structure', () => {
        it('renders a drop zone element', async () => {
            const { fixture } = await setup();
            const zone = fixture.debugElement.query(By.css('.upload-panel__dropzone'));
            expect(zone).not.toBeNull();
        });

        it('renders a hidden file input', async () => {
            const { fixture } = await setup();
            const input = fixture.debugElement.query(By.css('input[type="file"]'));
            expect(input).not.toBeNull();
        });

        it('file input accepts the correct MIME types', async () => {
            const { fixture } = await setup();
            const input = fixture.debugElement.query(
                By.css('input[type="file"]'),
            ).nativeElement as HTMLInputElement;
            expect(input.accept).toContain('image/jpeg');
            expect(input.accept).toContain('image/png');
            expect(input.accept).toContain('image/heic');
        });

        it('file input has multiple attribute', async () => {
            const { fixture } = await setup();
            const input = fixture.debugElement.query(
                By.css('input[type="file"]'),
            ).nativeElement as HTMLInputElement;
            expect(input.multiple).toBe(true);
        });
    });

    describe('panel visibility', () => {
        it('does not add --visible class when visible input is false', async () => {
            const { fixture, ref } = await setup();
            ref.setInput('visible', false);
            fixture.detectChanges();

            const panel = fixture.debugElement.query(By.css('.upload-panel'));
            expect(panel.nativeElement.classList.contains('upload-panel--visible')).toBe(false);
        });

        it('adds --visible class when visible input is true', async () => {
            const { fixture, ref } = await setup();
            ref.setInput('visible', true);
            fixture.detectChanges();

            const panel = fixture.debugElement.query(By.css('.upload-panel'));
            expect(panel.nativeElement.classList.contains('upload-panel--visible')).toBe(true);
        });
    });

    describe('drag-and-drop interactions', () => {
        /** jsdom does not implement DragEvent; use a plain stub. */
        function makeDragEventStub(): DragEvent {
            return { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
        }

        it('sets isDragging to true on dragover', async () => {
            const { component } = await setup();

            component.onDragOver(makeDragEventStub());

            expect(component.isDragging()).toBe(true);
        });

        it('sets isDragging to false on dragleave', async () => {
            const { component } = await setup();
            component.isDragging.set(true);

            component.onDragLeave(makeDragEventStub());

            expect(component.isDragging()).toBe(false);
        });

        it('sets isDragging to false on drop', async () => {
            const { component } = await setup();
            component.isDragging.set(true);

            component.onDrop(makeDragEventStub());

            expect(component.isDragging()).toBe(false);
        });
    });

    describe('file state management', () => {
        it('shows file-list element when states are present', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState()]);
            fixture.detectChanges();

            const list = fixture.debugElement.query(By.css('.upload-panel__file-list'));
            expect(list).not.toBeNull();
        });

        it('does not render file-list when states are empty', async () => {
            const { fixture } = await setup();
            const list = fixture.debugElement.query(By.css('.upload-panel__file-list'));
            expect(list).toBeNull();
        });

        it('renders one list item per file state', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState(), makeFileState(), makeFileState()]);
            fixture.detectChanges();

            const items = fixture.debugElement.queryAll(By.css('.upload-panel__file-item'));
            expect(items.length).toBe(3);
        });

        it('dismissFile() removes the targeted state from the list', async () => {
            const { component } = await setup();
            const stateA = makeFileState({ status: 'complete' });
            const stateB = makeFileState({ status: 'error' });
            component.fileStates.set([stateA, stateB]);

            component.dismissFile(stateA.key);

            expect(component.fileStates().length).toBe(1);
            expect(component.fileStates()[0].key).toBe(stateB.key);
        });

        it('dismissFile() is a no-op for an unknown key', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState()]);

            component.dismissFile('unknown-key');

            expect(component.fileStates().length).toBe(1);
        });
    });

    describe('computed signals', () => {
        it('isUploading is false when all states are pending', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState({ status: 'pending' })]);

            expect(component.isUploading()).toBe(false);
        });

        it('isUploading is true when any state is uploading', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState({ status: 'uploading' })]);

            expect(component.isUploading()).toBe(true);
        });

        it('isUploading is true when any state is parsing', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState({ status: 'parsing' })]);

            expect(component.isUploading()).toBe(true);
        });

        it('hasAwaitingPlacement is false when no states are awaiting placement', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState({ status: 'complete' })]);

            expect(component.hasAwaitingPlacement()).toBe(false);
        });

        it('hasAwaitingPlacement is true when any state is awaiting_placement', async () => {
            const { component } = await setup();
            component.fileStates.set([makeFileState({ status: 'awaiting_placement' })]);

            expect(component.hasAwaitingPlacement()).toBe(true);
        });
    });

    describe('placement prompt', () => {
        it('renders placement prompt text for awaiting_placement files', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState({ status: 'awaiting_placement' })]);
            fixture.detectChanges();

            const prompt = fixture.debugElement.query(By.css('.upload-panel__placement-prompt'));
            expect(prompt).not.toBeNull();
            expect(prompt.nativeElement.textContent).toContain('No GPS data found');
        });

        it('does not render placement prompt for non-awaiting states', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState({ status: 'complete' })]);
            fixture.detectChanges();

            const prompt = fixture.debugElement.query(By.css('.upload-panel__placement-prompt'));
            expect(prompt).toBeNull();
        });
    });

    describe('error display', () => {
        it('renders inline error for error-state files', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([
                makeFileState({ status: 'error', error: 'File too large' }),
            ]);
            fixture.detectChanges();

            const errorEl = fixture.debugElement.query(By.css('.upload-panel__file-error'));
            expect(errorEl).not.toBeNull();
            expect(errorEl.nativeElement.textContent).toContain('File too large');
        });

        it('renders dismiss button for complete files', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState({ status: 'complete' })]);
            fixture.detectChanges();

            const dismiss = fixture.debugElement.query(By.css('.upload-panel__dismiss'));
            expect(dismiss).not.toBeNull();
        });

        it('renders dismiss button for error files', async () => {
            const { fixture, component } = await setup();
            component.fileStates.set([makeFileState({ status: 'error', error: 'whoops' })]);
            fixture.detectChanges();

            const dismiss = fixture.debugElement.query(By.css('.upload-panel__dismiss'));
            expect(dismiss).not.toBeNull();
        });
    });

    describe('placeFile()', () => {
        it('is callable and does not throw for an unknown key', async () => {
            const { component } = await setup();
            // Should resolve without error even if key is not found
            await expect(
                component.placeFile('no-such-key', { lat: 10, lng: 20 }),
            ).resolves.toBeUndefined();
        });

        it('is a no-op when state is not awaiting_placement', async () => {
            const { component, fakeUploadService } = await setup();
            const state = makeFileState({ status: 'complete' });
            component.fileStates.set([state]);

            await component.placeFile(state.key, { lat: 10, lng: 20 });

            expect(fakeUploadService.uploadFile).not.toHaveBeenCalled();
        });
    });

    describe('placementRequested output', () => {
        it('emits placementRequested when processFile finds no GPS data', async () => {
            const { component, fakeUploadService, fixture } = await setup();
            const emittedKeys: string[] = [];

            // Subscribe to the placementRequested output
            fixture.componentInstance.placementRequested.subscribe((key: string) => {
                emittedKeys.push(key);
            });

            // Configure fake to return no coords
            fakeUploadService.parseExif.mockResolvedValue({});
            fakeUploadService.validateFile.mockReturnValue({ valid: true });

            // Trigger file enqueue via onFileInputChange
            const file = new File([new Uint8Array(512)], 'noexif.jpg', { type: 'image/jpeg' });
            const dataTransfer = { files: [file] } as unknown as DataTransfer;
            component.onDrop({
                preventDefault: vi.fn(),
                stopPropagation: vi.fn(),
                dataTransfer,
            } as unknown as DragEvent);

            // Wait for the async processFile pipeline
            await vi.waitFor(() => {
                expect(emittedKeys.length).toBe(1);
            });
        });
    });

    describe('trackByKey()', () => {
        it('returns the state key', async () => {
            const { component } = await setup();
            const state = makeFileState();

            expect(component.trackByKey(0, state)).toBe(state.key);
        });
    });
});
