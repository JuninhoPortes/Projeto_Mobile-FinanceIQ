import type { Category } from '../database/categoryService';
import type { CategoryType } from '../constants/defaultCategories';

import {
  categoryKeywordRules,
  SuggestionConfidence
} from '../constants/categoryKeywords';

export interface CategorySuggestion {
  category: Category | null;
  categoryName?: string;
  matchedKeyword?: string;
  confidence: SuggestionConfidence;
  shouldAutoSelect: boolean;
  requiresConfirmation: boolean;
  message: string;
}

interface SuggestCategoryParams {
  description: string;
  type: CategoryType;
  categories: Category[];
}

const normalizeText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const findMatchedKeyword = (
  description: string,
  keywords: string[]
): string | undefined => {
  const normalizedDescription = normalizeText(description);

  return keywords.find((keyword) => {
    return normalizedDescription.includes(
      normalizeText(keyword)
    );
  });
};

const findCategoryByName = (
  categories: Category[],
  categoryName: string,
  type: CategoryType
): Category | null => {
  const normalizedCategoryName = normalizeText(categoryName);

  const foundCategory = categories.find((category) => {
    return (
      category.is_active &&
      category.type === type &&
      normalizeText(category.name) === normalizedCategoryName
    );
  });

  return foundCategory || null;
};

const findCategoryNameInsideDescription = (
  description: string,
  categories: Category[],
  type: CategoryType
): Category | null => {
  const normalizedDescription = normalizeText(description);

  const foundCategory = categories.find((category) => {
    if (!category.is_active || category.type !== type) {
      return false;
    }

    return normalizedDescription.includes(
      normalizeText(category.name)
    );
  });

  return foundCategory || null;
};

export const categorySuggestionService = {
  suggestCategory: ({
    description,
    type,
    categories
  }: SuggestCategoryParams): CategorySuggestion | null => {
    const cleanDescription = description.trim();

    if (!cleanDescription) {
      return null;
    }

    const categoryByName = findCategoryNameInsideDescription(
      cleanDescription,
      categories,
      type
    );

    if (categoryByName) {
      return {
        category: categoryByName,
        categoryName: categoryByName.name,
        confidence: 'alta',
        shouldAutoSelect: true,
        requiresConfirmation: false,
        message: `Categoria sugerida: ${categoryByName.name}.`
      };
    }

    for (const rule of categoryKeywordRules) {
      if (rule.type !== type) {
        continue;
      }

      const matchedKeyword = findMatchedKeyword(
        cleanDescription,
        rule.keywords
      );

      if (!matchedKeyword) {
        continue;
      }

      const category = findCategoryByName(
        categories,
        rule.categoryName,
        type
      );

      if (!category) {
        continue;
      }

      const requiresConfirmation =
        rule.requiresConfirmation ||
        rule.confidence === 'baixa' ||
        rule.confidence === 'media';

      return {
        category,
        categoryName: category.name,
        matchedKeyword,
        confidence: rule.confidence,
        shouldAutoSelect: !requiresConfirmation,
        requiresConfirmation,
        message: requiresConfirmation
          ? `Sugestão: ${category.name}. Confirme se essa categoria faz sentido para este lançamento.`
          : `Categoria sugerida: ${category.name}.`
      };
    }

    return {
      category: null,
      confidence: 'baixa',
      shouldAutoSelect: false,
      requiresConfirmation: true,
      message:
        'Nenhuma categoria foi sugerida automaticamente. Escolha a categoria manualmente.'
    };
  }
};