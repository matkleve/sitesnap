export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  state: 'entering' | 'visible' | 'exiting';
  createdAt: number;
  startedAt: number;
  remainingMs?: number;
}

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  dedupe?: boolean;
}
