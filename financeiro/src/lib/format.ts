export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
