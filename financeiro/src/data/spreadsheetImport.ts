import type { NewTransaction } from '../types/finance'

// Lançamentos de referência extraídos da planilha original (Agosto/2026):
// abas "Despesas Gerais", "Custo Mensal" e "Caixa - Checklist". Servem como
// ponto de partida — edite ou apague livremente depois de importar.
// categoryName precisa bater com um nome em defaultCategories.
export const august2026Import: Array<
  Omit<NewTransaction, 'categoryId'> & { categoryName: string }
> = [
  // Receita da empresa (aba "Caixa - Checklist")
  {
    scope: 'empresa', kind: 'receita', amount: 95487.37, categoryName: 'Mensalidades',
    description: 'Faturado — mensalidades Agosto/2026', date: '2026-08-01',
  },

  // Despesas da empresa (aba "Custo Mensal")
  { scope: 'empresa', kind: 'despesa', amount: 23349.28, categoryName: 'Folha de pagamento', description: 'Folha de pagamento Agosto/2026', date: '2026-08-01' },
  { scope: 'empresa', kind: 'despesa', amount: 4554.30, categoryName: 'Água', description: 'Águas de Niterói', date: '2026-08-05' },
  { scope: 'empresa', kind: 'despesa', amount: 149.14, categoryName: 'Luz (Enel)', description: 'Enel — escola', date: '2026-08-09' },
  { scope: 'empresa', kind: 'despesa', amount: 229.99, categoryName: 'Empréstimo / Financiamento', description: 'GCM Apple Cards', date: '2026-08-01' },
  { scope: 'empresa', kind: 'despesa', amount: 3000, categoryName: 'Manutenção / Extras', description: 'Parcela Eduardo', date: '2026-08-01' },
  { scope: 'empresa', kind: 'despesa', amount: 5356.38, categoryName: 'Manutenção / Extras', description: 'Extras', date: '2026-08-01' },

  // Despesas gerais (aba "Despesas Gerais")
  { scope: 'empresa', kind: 'despesa', amount: 137.55, categoryName: 'Material de limpeza', description: 'Material de limpeza', date: '2026-08-01' },
  { scope: 'empresa', kind: 'despesa', amount: 87.75, categoryName: 'Papelaria', description: 'Papelaria', date: '2026-08-01' },
  { scope: 'empresa', kind: 'despesa', amount: 56, categoryName: 'Vale-transporte', description: 'Passagem Ana Beatriz', date: '2026-08-01' },

  // Pessoal (aba "Custo Mensal", coluna da direita)
  { scope: 'pessoal', kind: 'despesa', amount: 1000, categoryName: 'Casa (aluguel/contas)', description: 'Casa', date: '2026-08-01' },
  { scope: 'pessoal', kind: 'despesa', amount: 2500, categoryName: 'Cartão de crédito', description: 'Penhor Caixa', date: '2026-08-01' },
  { scope: 'pessoal', kind: 'despesa', amount: 1549, categoryName: 'Casa (aluguel/contas)', description: 'Luz — casa', date: '2026-08-01' },
  { scope: 'pessoal', kind: 'despesa', amount: 148.35, categoryName: 'Outras despesas', description: 'Inner IA', date: '2026-08-01' },
]
