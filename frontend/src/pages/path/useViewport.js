import { useEffect, useState } from 'react'

// Ширины из SPEC макета. Телефон — одна колонка, планшет — колонка 600, ПК — 720 плюс
// правая колонка.
export const BP_TABLET = 768
export const BP_DESK = 1280

/**
 * Размеры карты под текущую ширину экрана.
 *
 * Общий для обоих режимов: карта новичка и карта эксперта должны жить по одной геометрии,
 * иначе они разойдутся — ровно это и случилось с прежними двумя реализациями дороги.
 */
export function useViewport() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 390))
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return {
    w,
    isPhone: w < BP_TABLET,
    isDesk: w >= BP_DESK,
    // Ширина полотна карты и во сколько раз сжать горизонтальные смещения узлов.
    // На телефоне дорога та же, просто уже: 390px не вмещают размах в 340px между крайними
    // узлами, и без сжатия крайние уезжали бы за экран вместе с подписями.
    view:  w >= BP_DESK ? 720 : w >= BP_TABLET ? 600 : 340,
    scale: w >= BP_DESK ? 1 : w >= BP_TABLET ? 0.88 : 0.42,
    // Шаг на телефоне БОЛЬШЕ, чем на ПК, хотя узлы там мельче. Причина в сжатии по
    // горизонтали: при scale 0.42 соседние узлы почти на одной вертикали, и подпись
    // одного ложится на кружок другого. На ПК их разводит размах в 340px, на телефоне
    // разводить нечем — остаётся вертикаль.
    step:  w >= BP_DESK ? 118 : w >= BP_TABLET ? 112 : 128,
  }
}
