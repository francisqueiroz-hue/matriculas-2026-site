import type { NewCategory } from '../types/finance'

// Categorias iniciais baseadas na planilha "Folha de pagamento completa /
// Custo Mensal / Despesas Gerais" — cobrem tanto os gastos pessoais quanto
// os da empresa (escola) que já apareciam na planilha original.
export const defaultCategories: NewCategory[] = [
  // Empresa — receita
  { name: 'Mensalidades', scope: 'empresa', kind: 'receita', color: '#059669', order: 0 },
  { name: 'Outras receitas', scope: 'empresa', kind: 'receita', color: '#10b981', order: 1 },

  // Empresa — despesa
  { name: 'Folha de pagamento', scope: 'empresa', kind: 'despesa', color: '#dc2626', order: 2 },
  { name: 'Vale-transporte', scope: 'empresa', kind: 'despesa', color: '#ea580c', order: 3 },
  { name: 'Aluguel (Camboinhas)', scope: 'empresa', kind: 'despesa', color: '#d97706', order: 4 },
  { name: 'Água', scope: 'empresa', kind: 'despesa', color: '#0891b2', order: 5 },
  { name: 'Luz (Enel)', scope: 'empresa', kind: 'despesa', color: '#ca8a04', order: 6 },
  { name: 'Gás', scope: 'empresa', kind: 'despesa', color: '#b45309', order: 7 },
  { name: 'Internet / Telefone', scope: 'empresa', kind: 'despesa', color: '#7c3aed', order: 8 },
  { name: 'Material de limpeza', scope: 'empresa', kind: 'despesa', color: '#0d9488', order: 9 },
  { name: 'Papelaria', scope: 'empresa', kind: 'despesa', color: '#8b5cf6', order: 10 },
  { name: 'Manutenção / Extras', scope: 'empresa', kind: 'despesa', color: '#64748b', order: 11 },
  { name: 'Empréstimo / Financiamento', scope: 'empresa', kind: 'despesa', color: '#be123c', order: 12 },
  { name: 'Outras despesas', scope: 'empresa', kind: 'despesa', color: '#71717a', order: 13 },

  // Pessoal — receita
  { name: 'Salário / Pró-labore', scope: 'pessoal', kind: 'receita', color: '#059669', order: 14 },
  { name: 'Outras receitas', scope: 'pessoal', kind: 'receita', color: '#10b981', order: 15 },

  // Pessoal — despesa
  { name: 'Casa (aluguel/contas)', scope: 'pessoal', kind: 'despesa', color: '#d97706', order: 16 },
  { name: 'Supermercado', scope: 'pessoal', kind: 'despesa', color: '#16a34a', order: 17 },
  { name: 'Saúde (plano/farmácia)', scope: 'pessoal', kind: 'despesa', color: '#e11d48', order: 18 },
  { name: 'Transporte', scope: 'pessoal', kind: 'despesa', color: '#ea580c', order: 19 },
  { name: 'Cartão de crédito', scope: 'pessoal', kind: 'despesa', color: '#4f46e5', order: 20 },
  { name: 'Lazer', scope: 'pessoal', kind: 'despesa', color: '#db2777', order: 21 },
  { name: 'Outras despesas', scope: 'pessoal', kind: 'despesa', color: '#71717a', order: 22 },
]
