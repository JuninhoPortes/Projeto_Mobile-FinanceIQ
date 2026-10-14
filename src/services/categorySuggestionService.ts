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

const tokenize = (value: string) => Array.from(
  value.matchAll(/[\p{L}\p{N}]+/gu),
  match => ({ value: match[0], start: match.index, end: match.index + match[0].length })
);
type Tokens = ReturnType<typeof tokenize>;

function isTransport99(description: string, tokens: Tokens, index: number, needsContext = true): boolean {
  const token = tokens[index];
  const before = description.slice(0, token.start);
  const after = description.slice(token.end);
  // Não confundir 99,90, 1,99, R$ 99 ou 99 reais com o nome do serviço.
  if (/\d[.,]\s*$/.test(before) || /^[.,]\s*\d/.test(after) ||
    /(?:r\$|\$|brl)\s*$/.test(before) || /^\s*(?:reais|real|brl)\b/.test(after)) return false;
  // 99 exige contexto; a marca completa 99Pop dispensa contexto, mas nunca a proteção monetária.
  return !needsContext || tokens.slice(Math.max(0, index - 2), index + 3).some(item =>
    ['app', 'aplicativo', 'taxi', 'corrida', 'transporte'].includes(item.value)
  );
}

function matchesPhrase(description: string, tokens: Tokens, phrase: Tokens): boolean {
  if (!phrase.length) return false;
  return tokens.some((_token, index) =>
    phrase.every((part, offset) => tokens[index + offset]?.value === part.value) &&
    (phrase.length !== 1 || !['99', '99pop'].includes(phrase[0].value) ||
      isTransport99(description, tokens, index, phrase[0].value === '99'))
  );
}

interface CategoryMatch {
  category: Category;
  matchedKeyword?: string;
  // Nome completo da descrição > expressão composta > palavra isolada.
  priority: number;
  confidence: SuggestionConfidence;
  requiresConfirmation: boolean;
}

const unresolved = (ambiguous = false): CategorySuggestion => ({
  category: null, confidence: 'baixa', shouldAutoSelect: false, requiresConfirmation: true,
  message: ambiguous
    ? 'Mais de uma categoria corresponde à descrição. Escolha a categoria manualmente.'
    : 'Nenhuma categoria foi sugerida automaticamente. Escolha a categoria manualmente.'
});

export const categorySuggestionService = {
  suggestCategory: ({
    description,
    type,
    categories
  }: SuggestCategoryParams): CategorySuggestion | null => {
    if (!description.trim()) return null;
    const normalizedDescription = normalizeText(description);
    const tokens = tokenize(normalizedDescription);
    const activeCategories = categories.filter(category => category.is_active && category.type === type);
    const matches: CategoryMatch[] = [];

    for (const category of activeCategories) {
      const name = tokenize(normalizeText(category.name));
      if (!matchesPhrase(normalizedDescription, tokens, name)) continue;
      matches.push({
        category, priority: name.length === tokens.length ? 3 : name.length > 1 ? 2 : 1,
        confidence: category.is_default ? 'alta' : 'media', requiresConfirmation: !category.is_default
      });
    }

    for (const rule of categoryKeywordRules) {
      if (rule.type !== type) continue;
      const compatible = activeCategories.filter(category => normalizeText(category.name) === normalizeText(rule.categoryName));
      for (const keyword of rule.keywords) {
        const phrase = tokenize(normalizeText(keyword));
        if (!matchesPhrase(normalizedDescription, tokens, phrase)) continue;
        for (const category of compatible) {
          matches.push({
            category, matchedKeyword: keyword, priority: phrase.length > 1 ? 2 : 1,
            confidence: !category.is_default && rule.confidence === 'alta' ? 'media' : rule.confidence,
            requiresConfirmation: !category.is_default || !!rule.requiresConfirmation || rule.confidence !== 'alta'
          });
        }
      }
    }

    if (!matches.length) return unresolved();
    const priority = Math.max(...matches.map(match => match.priority));
    const best = matches.filter(match => match.priority === priority);
    // Nem ordem de cadastro, ordem das regras ou tamanho de palavra desempatam categorias.
    if (new Set(best.map(match => match.category)).size !== 1) return unresolved(true);
    // Expressões superam termos genéricos, mas não descartam evidência forte de outra categoria.
    if (priority === 2 && matches.some(match =>
      match.priority === 1 && match.category !== best[0].category && match.confidence === 'alta'
    )) return unresolved(true);
    // Para a mesma categoria, preservar a exigência de confirmação mais conservadora.
    const match = best.find(candidate => candidate.requiresConfirmation) ?? best[0];
    const { category, confidence, requiresConfirmation, matchedKeyword } = match;
    return {
      category, categoryName: category.name, matchedKeyword, confidence,
      shouldAutoSelect: !requiresConfirmation, requiresConfirmation,
      message: requiresConfirmation
        ? `Sugestão: ${category.name}. Confirme se essa categoria faz sentido para este lançamento.`
        : `Categoria sugerida: ${category.name}.`
    };
  }
};
