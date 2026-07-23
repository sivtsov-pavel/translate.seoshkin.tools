import { create } from 'zustand'

// Окно выбора изучаемого языка/курса (CourseGate) открывается из разных мест
// (шапка Дашборда, топбар на мобильном) — общий стор, чтобы модалка (рендерится в Layout)
// и кнопки-триггеры на других страницах не дублировали состояние.
export const useCourseGateStore = create((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
