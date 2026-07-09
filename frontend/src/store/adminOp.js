import { create } from 'zustand'

export const useAdminOpStore = create((set) => ({
  status: 'idle',
  name: null,
  done: 0,
  total: 0,
  updated: 0,
  failed: 0,
  error: null,

  start: (name) => set({ status: 'running', name, done: 0, total: 0, updated: 0, failed: 0, error: null }),
  finish: (res) => set((s) => ({ ...s, ...res, status: 'done' })),
  fail: (error) => set((s) => ({ ...s, status: 'error', error })),
  sync: (s) => set(s),
  reset: () => set({ status: 'idle', name: null, done: 0, total: 0, updated: 0, failed: 0, error: null }),
}))
