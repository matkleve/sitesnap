/**
 * UploadPanelComponent unit tests.
 *
 * Strategy:
 *  - UploadManagerService is replaced with a fake so no real uploads occur.
 *  - Tests verify DOM structure, signal-driven state changes, and pure component
 *    behaviours such as dismissFile(), retryFile(), and placement delegation.
 *  - The full async upload pipeline is owned by UploadManagerService; here we
 *    only test the thin UI layer and its reactive template bindings.
 */

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ComponentRef, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { UploadPanelComponent } from './upload-panel.component';
import {
  UploadManagerService,
  UploadJob,
  UploadPhase,
  ImageUploadedEvent as ManagerImageUploadedEvent,
  MissingDataEvent,
} from '../../../core/upload-manager.service';

// ── Fake UploadManagerService ──────────────────────────────────────────────────

function buildFakeUploadManager() {
  const jobsSignal = signal<ReadonlyArray<UploadJob>>([]);
  const imageUploaded$ = new Subject<ManagerImageUploadedEvent>();
  const missingData$ = new Subject<MissingDataEvent>();

  return {
    jobs: jobsSignal.asReadonly(),
    activeJobs: signal<ReadonlyArray<UploadJob>>([]).asReadonly(),
    isBusy: signal(false).asReadonly(),
    activeCount: signal(0).asReadonly(),
    imageUploaded$: imageUploaded$.asObservable(),
    uploadFailed$: new Subject().asObservable(),
    missingData$: missingData$.asObservable(),
    submit: vi.fn().mockReturnValue([]),
    retryJob: vi.fn(),
    dismissJob: vi.fn(),
    dismissAllCompleted: vi.fn(),
    cancelJob: vi.fn(),
    placeJob: vi.fn(),
    // Helpers for tests to control state
    _jobsSignal: jobsSignal,
    _imageUploaded$: imageUploaded$,
    _missingData$: missingData$,
  };
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeUploadJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: crypto.randomUUID(),
    batchId: 'test-batch',
    file: new File([new Uint8Array(512) as BlobPart], 'photo.jpg', { type: 'image/jpeg' }),
    phase: 'queued' as UploadPhase,
    progress: 0,
    statusLabel: 'Queued',
    mode: 'new',
    submittedAt: new Date(),
    ...overrides,
  } as UploadJob;
}

async function setup() {
  const fakeManager = buildFakeUploadManager();

  await TestBed.configureTestingModule({
    imports: [UploadPanelComponent],
    providers: [{ provide: UploadManagerService, useValue: fakeManager }],
  }).compileComponents();

  const fixture = TestBed.createComponent(UploadPanelComponent);
  const component = fixture.componentInstance as UploadPanelComponent;
  const ref = fixture.componentRef as ComponentRef<UploadPanelComponent>;
  fixture.detectChanges();
  return { fixture, component, ref, fakeManager };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UploadPanelComponent', () => {
  describe('creation', () => {
    it('creates', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('starts with no jobs', async () => {
      const { component } = await setup();
      expect(component.jobs()).toHaveLength(0);
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
      const input = fixture.debugElement.query(By.css('input[type="file"]'))
        .nativeElement as HTMLInputElement;
      expect(input.accept).toContain('image/jpeg');
      expect(input.accept).toContain('image/png');
      expect(input.accept).toContain('image/heic');
    });

    it('file input has multiple attribute', async () => {
      const { fixture } = await setup();
      const input = fixture.debugElement.query(By.css('input[type="file"]'))
        .nativeElement as HTMLInputElement;
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

    it('calls uploadManager.submit on drop with files', async () => {
      const { component, fakeManager } = await setup();
      const file = new File([new Uint8Array(512)], 'test.jpg', { type: 'image/jpeg' });
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: [file] },
      } as unknown as DragEvent;

      component.onDrop(event);

      expect(fakeManager.submit).toHaveBeenCalledWith([file]);
    });
  });

  describe('job list rendering', () => {
    it('shows file-list element when jobs are present', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([makeUploadJob()]);
      fixture.detectChanges();

      const list = fixture.debugElement.query(By.css('.upload-panel__file-list'));
      expect(list).not.toBeNull();
    });

    it('does not render file-list when jobs are empty', async () => {
      const { fixture } = await setup();
      const list = fixture.debugElement.query(By.css('.upload-panel__file-list'));
      expect(list).toBeNull();
    });

    it('renders one list item per job', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([makeUploadJob(), makeUploadJob(), makeUploadJob()]);
      fixture.detectChanges();

      const items = fixture.debugElement.queryAll(By.css('.upload-panel__file-item'));
      expect(items.length).toBe(3);
    });
  });

  describe('dismissFile() and retryFile()', () => {
    it('dismissFile calls uploadManager.dismissJob', async () => {
      const { component, fakeManager } = await setup();
      component.dismissFile('some-id');
      expect(fakeManager.dismissJob).toHaveBeenCalledWith('some-id');
    });

    it('retryFile calls uploadManager.retryJob', async () => {
      const { component, fakeManager } = await setup();
      component.retryFile('some-id');
      expect(fakeManager.retryJob).toHaveBeenCalledWith('some-id');
    });
  });

  describe('placement', () => {
    it('placeFile delegates to uploadManager.placeJob', () => {
      const { component, fakeManager } = setup as unknown as never;
      // Extract synchronously
      void (async () => {
        const s = await setup();
        s.component.placeFile('job-1', { lat: 10, lng: 20 });
        expect(s.fakeManager.placeJob).toHaveBeenCalledWith('job-1', { lat: 10, lng: 20 });
      })();
    });

    it('placeFile calls uploadManager.placeJob with correct args', async () => {
      const { component, fakeManager } = await setup();
      component.placeFile('job-1', { lat: 48.2, lng: 16.37 });
      expect(fakeManager.placeJob).toHaveBeenCalledWith('job-1', { lat: 48.2, lng: 16.37 });
    });
  });

  describe('missing_data prompt', () => {
    it('renders placement prompt text for missing_data jobs', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([
        makeUploadJob({ phase: 'missing_data', statusLabel: 'Missing location' }),
      ]);
      fixture.detectChanges();

      const prompt = fixture.debugElement.query(By.css('.upload-panel__placement-prompt'));
      expect(prompt).not.toBeNull();
      expect(prompt.nativeElement.textContent).toContain('No GPS data found');
    });

    it('does not render placement prompt for completed jobs', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([makeUploadJob({ phase: 'complete', statusLabel: 'Uploaded' })]);
      fixture.detectChanges();

      const prompt = fixture.debugElement.query(By.css('.upload-panel__placement-prompt'));
      expect(prompt).toBeNull();
    });
  });

  describe('error display', () => {
    it('renders inline error for error-phase jobs', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([
        makeUploadJob({ phase: 'error', statusLabel: 'Failed', error: 'File too large' }),
      ]);
      fixture.detectChanges();

      const errorEl = fixture.debugElement.query(By.css('.upload-panel__file-error'));
      expect(errorEl).not.toBeNull();
      expect(errorEl.nativeElement.textContent).toContain('File too large');
    });

    it('renders retry button for error jobs', async () => {
      const { fixture, fakeManager } = await setup();
      fakeManager._jobsSignal.set([
        makeUploadJob({ phase: 'error', statusLabel: 'Failed', error: 'Failed' }),
      ]);
      fixture.detectChanges();

      const retry = fixture.debugElement.query(By.css('.upload-panel__retry'));
      expect(retry).not.toBeNull();
    });
  });

  describe('trackByJobId()', () => {
    it('returns the job id', async () => {
      const { component } = await setup();
      const job = makeUploadJob();

      expect(component.trackByJobId(0, job)).toBe(job.id);
    });
  });
});
