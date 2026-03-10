import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthService } from './core/auth.service';
import { SupabaseService } from './core/supabase.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        // Mock AuthService and SupabaseService so NavComponent (now inside App)
        // does not trigger real Supabase calls in tests.
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            session: signal(null),
            loading: signal(false),
            initialize: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
                onAuthStateChange: vi.fn().mockReturnValue({
                  data: { subscription: { unsubscribe: vi.fn() } },
                }),
              },
              from: vi.fn(),
              storage: { from: vi.fn() },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
