export function monthToIndex(value: string): number {
  const [year, month] = value
    .split('-')
    .map(Number)

  return year * 12 + (month - 1)
}

export function formatMonth(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  return `${year}-${String(month).padStart(2, '0')}`
}
