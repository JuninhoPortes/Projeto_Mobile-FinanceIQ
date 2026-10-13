import type { Transaction } from '../database/transactionService';
import type { ReceiptAnalysisContext, ReceiptAnalysisResult } from '../types/receipt';

export type ReceiptFormPatch = Partial<
  Pick<Transaction, 'description' | 'amount' | 'type' | 'category'>
>;

export function prepareReceiptFormPatch(
  result: ReceiptAnalysisResult,
  current: Pick<Transaction, 'type' | 'category'>,
  categories: ReceiptAnalysisContext['categories']
): ReceiptFormPatch {
  if (result.status !== 'success' && result.status !== 'partial') return {};
  const fields = result.fields;
  const patch: ReceiptFormPatch = {};

  if (typeof fields.description === 'string' && fields.description.trim()) {
    patch.description = fields.description.trim();
  }
  if (fields.type === 'income' || fields.type === 'outcome') patch.type = fields.type;
  if (typeof fields.amount === 'number' && Number.isFinite(fields.amount)) {
    const cents = Math.round(fields.amount * 100);
    if (Number.isSafeInteger(cents) && cents > 0) patch.amount = cents / 100;
  }

  const nextType = patch.type ?? current.type;
  const activeCategories = categories.filter(category =>
    category.is_active && category.type === nextType
  );
  const categoryName = fields.category;
  const suggestedCategory = typeof categoryName === 'string'
    ? activeCategories.find(category =>
        category.name.trim().toLowerCase() === categoryName.trim().toLowerCase()
      )
    : undefined;

  if (suggestedCategory) {
    patch.category = suggestedCategory.name;
  } else if (
    nextType !== current.type && current.category &&
    !activeCategories.some(category => category.name === current.category)
  ) {
    // Apenas uma mudança de tipo pode exigir desmarcar a categoria incompatível.
    patch.category = '';
  }

  // identifiedDate e todos os metadados ficam fora do patch do formulário.
  return patch;
}
