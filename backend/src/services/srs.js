// Реализация алгоритма SuperMemo SM-2
// quality: 0-5 (0-2 = неверно/очень сложно, 3-5 = верно с разной лёгкостью)
export function sm2(quality, easinessFactor, interval, repetitions) {
  // Корректируем EF по формуле SM-2
  let newEf = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEf < 1.3) newEf = 1.3

  let newReps, newInterval

  if (quality < 3) {
    // Неверный ответ — сбрасываем счётчик, начинаем сначала
    newReps = 0
    newInterval = 1
  } else {
    newReps = repetitions + 1
    if (newReps === 1) {
      newInterval = 1
    } else if (newReps === 2) {
      newInterval = 6
    } else {
      newInterval = Math.round(interval * newEf)
    }
  }

  return {
    newEf: parseFloat(newEf.toFixed(2)),
    newInterval,
    newReps,
  }
}
