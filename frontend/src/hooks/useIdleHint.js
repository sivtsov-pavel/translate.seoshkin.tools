import { useEffect, useState } from 'react'

// «Человек завис» — сколько времени он ничего не нажимает.
//
// Наши ученики часто впервые держат в руках приложение: значки для них — узор, а
// инструкции никто не читает. Объяснять заранее бесполезно, но можно помочь ровно в
// тот момент, когда человек растерялся: если N секунд не было ни одного касания,
// единственное нужное действие начинает мягко пульсировать (класс .dl-idle-pulse).
//
// Кто знает, что делать, подсказки не увидит вовсе — любое касание сбрасывает таймер.
//
//   active — следить ли сейчас. Передавайте false, когда подсказка неуместна
//            (ответ уже дан, карточка раскрыта): иначе пульс мигает не к месту.
export function useIdleHint(delayMs = 5000, active = true) {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (!active) { setIdle(false); return }

    let timer
    const restart = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), delayMs)
    }

    // pointerdown ловит и палец, и мышь; keydown нужен для упражнений с вводом
    // (пока человек печатает диктант, он занят и в подсказке не нуждается).
    const events = ['pointerdown', 'keydown', 'wheel', 'touchmove']
    events.forEach(e => window.addEventListener(e, restart, { passive: true }))
    restart()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, restart))
    }
  }, [delayMs, active])

  return idle
}
