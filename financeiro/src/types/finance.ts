export type Scope = 'pessoal' | 'empresa'
export type Kind = 'receita' | 'despesa'

export interface Category {
  id: string
  name: string
  scope: Scope
  kind: Kind
  color: string
  order: number
}

export interface Transaction {
  id: string
  scope: Scope
  kind: Kind
  amount: number // reais, positivo
  categoryId: string
  categoryName: string
  description: string
  date: string // ISO yyyy-mm-dd
  paymentMethod?: string
  createdAt: number
  updatedAt: number
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
export type NewCategory = Omit<Category, 'id'>
