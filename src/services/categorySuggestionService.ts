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

const getRelevantTokens = (value: string) => {
  return normalizeText(value)
    .split(/\s+/)
    .filter(token => token.length >= 3);
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

const calculateCategoryNameMatchScore = (
  description: string,
  categoryName: string
) => {
  const normalizedDescription = normalizeText(description);
  const normalizedCategoryName = normalizeText(categoryName);

  if (!normalizedDescription || normalizedDescription.length < 3) {
    return 0;
  }

  if (normalizedDescription === normalizedCategoryName) {
    return 100;
  }

  if (
    normalizedDescription.length >= 4 &&
    normalizedCategoryName.startsWith(normalizedDescription)
  ) {
    return 95;
  }

  if (normalizedDescription.includes(normalizedCategoryName)) {
    return 90;
  }

  const descriptionTokens = getRelevantTokens(description);
  const categoryTokens = getRelevantTokens(categoryName);

  if (descriptionTokens.length === 0 || categoryTokens.length === 0) {
    return 0;
  }

  const matchedTokens = descriptionTokens.filter((descriptionToken) => {
    return categoryTokens.some((categoryToken) => {
      return (
        categoryToken.startsWith(descriptionToken) ||
        descriptionToken.startsWith(categoryToken)
      );
    });
  });

  const allDescriptionTokensMatched =
    matchedTokens.length === descriptionTokens.length;

  if (allDescriptionTokensMatched) {
    return 85;
  }

  const matchRatio =
    matchedTokens.length / descriptionTokens.length;

  if (matchRatio >= 0.7) {
    return 70;
  }

  return 0;
};

const findBestCategoryMatchFromDescription = (
  description: string,
  categories: Category[],
  type: CategoryType
): Category | null => {
  const activeCategories = categories.filter((category) => {
    return (
      category.is_active &&
      category.type === type
    );
  });

  const rankedCategories = activeCategories
    .map((category) => {
      return {
        category,
        score: calculateCategoryNameMatchScore(
          description,
          category.name
        )
      };
    })
    .filter(item => item.score >= 70)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.category.name.length - a.category.name.length;
    });

  return rankedCategories[0]?.category || null;
};

const buildCategoryNameSuggestion = (
  category: Category
): CategorySuggestion => {
  const isCustomCategory = !category.is_default;

  if (isCustomCategory) {
    return {
      category,
      categoryName: category.name,
      confidence: 'media',
      shouldAutoSelect: false,
      requiresConfirmation: true,
      message:
        `Sugestão: ${category.name}. Confirme se essa categoria faz sentido para este lançamento.`
    };
  }

  return {
    category,
    categoryName: category.name,
    confidence: 'alta',
    shouldAutoSelect: true,
    requiresConfirmation: false,
    message: `Categoria sugerida: ${category.name}.`
  };
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

    const categoryByName =
      findBestCategoryMatchFromDescription(
        cleanDescription,
        categories,
        type
      );

    if (categoryByName) {
      return buildCategoryNameSuggestion(
        categoryByName
      );
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