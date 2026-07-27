import React, { useCallback, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';

import { categoryService } from '../database/categoryService';
import { transactionService } from '../database/transactionService';

import {
  AnalyzedCategory,
  CategorySummary,
  categoryAnalysisService
} from '../services/categoryAnalysisService';

import {
  CategoryStatus,
  categoryStatusLabels
} from '../constants/financialRules';

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const formatMoneyInput = (text: string) => {
  const cleanText = text.replace(/\D/g, '');

  if (!cleanText) {
    return '';
  }

  const valueFloat = parseFloat(cleanText) / 100;

  return valueFloat.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function Categorias() {
  const [categories, setCategories] = useState<AnalyzedCategory[]>([]);
  const [summary, setSummary] = useState<CategorySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const [editLimitModalVisible, setEditLimitModalVisible] = useState(false);
  const [editLimitValue, setEditLimitValue] = useState('');

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  const [selectedCategory, setSelectedCategory] =
    useState<AnalyzedCategory | null>(null);

  const [optionsCategory, setOptionsCategory] =
    useState<AnalyzedCategory | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryLimit, setNewCategoryLimit] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        Alert.alert(
          'Usuário não autenticado',
          'Faça login novamente para carregar suas categorias.'
        );

        return;
      }

      const [userCategories, transactions] = await Promise.all([
        categoryService.listAll(user.uid),
        transactionService.listAll(user.uid)
      ]);

      const analyzedCategories =
        categoryAnalysisService.analyzeCategories(
          userCategories,
          transactions
        );

      const categorySummary =
        categoryAnalysisService.getSummary(analyzedCategories);

      setCategories(analyzedCategories);
      setSummary(categorySummary);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);

      Alert.alert(
        'Erro',
        'Não foi possível carregar as categorias financeiras.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const openCategoryDetails = (category: AnalyzedCategory) => {
    setSelectedCategory(category);
    setDetailModalVisible(true);
  };

  const closeCategoryDetails = () => {
    setSelectedCategory(null);
    setDetailModalVisible(false);
  };

  const openEditLimitForCategory = (
    category: AnalyzedCategory
  ) => {
    setSelectedCategory(category);

    setEditLimitValue(
      category.monthly_limit.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );

    setDetailModalVisible(false);
    setOptionsModalVisible(false);
    setEditLimitModalVisible(true);
  };

  const openEditLimitModal = () => {
    if (!selectedCategory) {
      return;
    }

    openEditLimitForCategory(selectedCategory);
  };

  const closeEditLimitModal = () => {
    setEditLimitValue('');
    setEditLimitModalVisible(false);
    setSelectedCategory(null);
  };

  const openCategoryOptions = (
    category: AnalyzedCategory
  ) => {
    setOptionsCategory(category);
    setOptionsModalVisible(true);
  };

  const closeCategoryOptions = () => {
    setOptionsCategory(null);
    setOptionsModalVisible(false);
  };

  const resetAddForm = () => {
    setNewCategoryName('');
    setNewCategoryLimit('');
  };

  const parseCurrencyInput = (value: string) => {
    const normalizedValue = value
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '');

    return Number(normalizedValue);
  };

  const handleAddCategory = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        Alert.alert(
          'Usuário não autenticado',
          'Faça login novamente para cadastrar uma categoria.'
        );

        return;
      }

      const name = newCategoryName.trim();

      if (!name) {
        Alert.alert(
          'Nome obrigatório',
          'Informe o nome da nova categoria.'
        );

        return;
      }

      const monthlyLimit = parseCurrencyInput(newCategoryLimit);

      if (Number.isNaN(monthlyLimit) || monthlyLimit < 0) {
        Alert.alert(
          'Limite inválido',
          'Informe um limite mensal válido para a categoria.'
        );

        return;
      }

      await categoryService.add(
        user.uid,
        {
          name,
          icon: 'tag',
          color: '#1B365D',
          monthly_limit: monthlyLimit,
          type: 'outcome',
          description: `Categoria personalizada para despesas com ${name}.`
        }
      );

      resetAddForm();
      setAddModalVisible(false);

      await loadCategories();

      Alert.alert(
        'Categoria criada',
        'A nova categoria foi salva com sucesso.'
      );
    } catch (error: any) {
      console.error('Erro ao criar categoria:', error);

      Alert.alert(
        'Erro',
        error?.message || 'Não foi possível criar a categoria.'
      );
    }
  };

  const handleUpdateCategoryLimit = async () => {
    try {
      if (!selectedCategory?.id) {
        Alert.alert(
          'Erro',
          'Categoria não encontrada.'
        );

        return;
      }

      const monthlyLimit = parseCurrencyInput(editLimitValue);

      if (Number.isNaN(monthlyLimit) || monthlyLimit < 0) {
        Alert.alert(
          'Limite inválido',
          'Informe um limite mensal válido para a categoria.'
        );

        return;
      }

      await categoryService.updateMonthlyLimit(
        selectedCategory.id,
        monthlyLimit
      );

      setEditLimitValue('');
      setEditLimitModalVisible(false);
      setSelectedCategory(null);

      await loadCategories();

      Alert.alert(
        'Limite atualizado',
        'O limite mensal da categoria foi atualizado com sucesso.'
      );
    } catch (error) {
      console.error('Erro ao atualizar limite da categoria:', error);

      Alert.alert(
        'Erro',
        'Não foi possível atualizar o limite mensal da categoria.'
      );
    }
  };

  const handleDeleteCategory = async (
    category: AnalyzedCategory
  ) => {
    try {
      if (!category.id) {
        Alert.alert(
          'Erro',
          'Categoria não encontrada.'
        );

        return;
      }

      if (category.is_default) {
        Alert.alert(
          'Categoria padrão',
          'Essa categoria faz parte da estrutura inicial do FinanceIQ e não pode ser excluída.'
        );

        return;
      }

      await categoryService.remove(category.id);

      setDetailModalVisible(false);
      setEditLimitModalVisible(false);
      setOptionsModalVisible(false);
      setSelectedCategory(null);
      setOptionsCategory(null);

      await loadCategories();

      Alert.alert(
        'Categoria excluída',
        'A categoria foi excluída com sucesso. Seus lançamentos anteriores foram mantidos.'
      );
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);

      Alert.alert(
        'Erro',
        'Não foi possível excluir a categoria.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Categorias
        </Text>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddModalVisible(true)}
        >
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#1B365D"
          />

          <Text style={styles.loadingText}>
            Carregando categorias...
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <SummaryCard summary={summary} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Orçamento por categoria
            </Text>

            <Text style={styles.sectionSubtitle}>
              Acompanhe seus gastos por área financeira.
            </Text>
          </View>

          <View style={styles.grid}>
            {categories.map((category) => (
              <CategoryCard
                key={category.id || category.name}
                category={category}
                onPress={() => openCategoryDetails(category)}
                onLongPress={() => openCategoryOptions(category)}
              />
            ))}
          </View>

          {categories.length === 0 && (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="shape-outline"
                size={42}
                color="#95A5A6"
              />

              <Text style={styles.emptyTitle}>
                Nenhuma categoria encontrada
              </Text>

              <Text style={styles.emptyText}>
                Toque no botão de adicionar para criar sua primeira categoria.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <AddCategoryModal
        visible={addModalVisible}
        name={newCategoryName}
        limit={newCategoryLimit}
        onChangeName={setNewCategoryName}
        onChangeLimit={(value) =>
          setNewCategoryLimit(
            formatMoneyInput(value)
          )
        }
        onClose={() => {
          resetAddForm();
          setAddModalVisible(false);
        }}
        onSave={handleAddCategory}
      />

      <CategoryDetailModal
        visible={detailModalVisible}
        category={selectedCategory}
        onClose={closeCategoryDetails}
        onEditLimit={openEditLimitModal}
        onDeleteCategory={() => {
          if (selectedCategory) {
            handleDeleteCategory(selectedCategory);
          }
        }}
      />

      <EditLimitModal
        visible={editLimitModalVisible}
        category={selectedCategory}
        limit={editLimitValue}
        onChangeLimit={(value) =>
          setEditLimitValue(
            formatMoneyInput(value)
          )
        }
        onClose={closeEditLimitModal}
        onSave={handleUpdateCategoryLimit}
      />

      <CategoryOptionsModal
        visible={optionsModalVisible}
        category={optionsCategory}
        onClose={closeCategoryOptions}
        onEdit={() => {
          if (optionsCategory) {
            openEditLimitForCategory(optionsCategory);
          }
        }}
        onDelete={() => {
          if (optionsCategory) {
            handleDeleteCategory(optionsCategory);
          }
        }}
      />
    </SafeAreaView>
  );
}

interface SummaryCardProps {
  summary: CategorySummary | null;
}

const SummaryCard = ({ summary }: SummaryCardProps) => {
  if (!summary) {
    return null;
  }

  const remainingText =
    summary.totalRemaining >= 0
      ? formatCurrency(summary.totalRemaining)
      : `-${formatCurrency(Math.abs(summary.totalRemaining))}`;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.summaryTitle}>
            Resumo das despesas
          </Text>

          <Text style={styles.summarySubtitle}>
            Visão geral das categorias de despesa.
          </Text>
        </View>

        <View style={styles.summaryIconContainer}>
          <MaterialCommunityIcons
            name="chart-donut"
            size={24}
            color="#1B365D"
          />
        </View>
      </View>

      <View style={styles.summaryValues}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            Gasto
          </Text>

          <Text style={styles.summaryValue}>
            {formatCurrency(summary.totalSpent)}
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            Planejado
          </Text>

          <Text style={styles.summaryValue}>
            {formatCurrency(summary.totalLimit)}
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            Restante
          </Text>

          <Text
            style={[
              styles.summaryValue,
              summary.totalRemaining < 0 && styles.negativeValue
            ]}
          >
            {remainingText}
          </Text>
        </View>
      </View>

      <View style={styles.summaryAlert}>
        <MaterialCommunityIcons
          name="lightbulb-on-outline"
          size={18}
          color="#F39C12"
        />

        <Text style={styles.summaryAlertText}>
          {summary.highestSpentCategory &&
          summary.highestSpentCategory.spent > 0
            ? `Maior gasto atual: ${summary.highestSpentCategory.name}, com ${formatCurrency(summary.highestSpentCategory.spent)} registrado.`
            : 'Cadastre lançamentos para visualizar análises por categoria.'}
        </Text>
      </View>

      <View style={styles.summaryBadges}>
        <View style={styles.smallBadge}>
          <Text style={styles.smallBadgeText}>
            {summary.controlledCount} controladas
          </Text>
        </View>

        <View style={styles.smallBadge}>
          <Text style={styles.smallBadgeText}>
            {summary.attentionCount + summary.nearLimitCount} em atenção
          </Text>
        </View>

        <View style={styles.smallBadgeDanger}>
          <Text style={styles.smallBadgeDangerText}>
            {summary.exceededCount} excedidas
          </Text>
        </View>
      </View>
    </View>
  );
};

interface CategoryCardProps {
  category: AnalyzedCategory;
  onPress: () => void;
  onLongPress: () => void;
}

const CategoryCard = ({
  category,
  onPress,
  onLongPress
}: CategoryCardProps) => {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={600}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: `${category.color}18` }
          ]}
        >
          <MaterialCommunityIcons
            name={category.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={24}
            color={category.color}
          />
        </View>

        <StatusBadge status={category.status} />
      </View>

      <Text style={styles.categoryName}>
        {category.name}
      </Text>

      <Text style={styles.categoryDescription} numberOfLines={2}>
        {category.description || 'Categoria financeira personalizada.'}
      </Text>

      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${category.percentageUsed}%`,
              backgroundColor: getStatusColor(category.status, category.color)
            }
          ]}
        />
      </View>

      <Text style={styles.priceText}>
        {formatCurrency(category.spent)}
        <Text style={styles.limitText}>
          {' / '}
          {formatCurrency(category.monthly_limit)}
        </Text>
      </Text>

      <Text
        style={[
          styles.remainingText,
          category.remaining < 0 && styles.negativeValue
        ]}
      >
        {category.remaining >= 0
          ? `Restam ${formatCurrency(category.remaining)}`
          : `Excedeu ${formatCurrency(Math.abs(category.remaining))}`}
      </Text>
    </TouchableOpacity>
  );
};

interface StatusBadgeProps {
  status: CategoryStatus;
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <View
      style={[
        styles.statusBadge,
        getStatusBadgeStyle(status)
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          getStatusBadgeTextStyle(status)
        ]}
      >
        {categoryStatusLabels[status]}
      </Text>
    </View>
  );
};

interface AddCategoryModalProps {
  visible: boolean;
  name: string;
  limit: string;
  onChangeName: (value: string) => void;
  onChangeLimit: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

const AddCategoryModal = ({
  visible,
  name,
  limit,
  onChangeName,
  onChangeLimit,
  onClose,
  onSave
}: AddCategoryModalProps) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            Nova categoria
          </Text>

          <Text style={styles.modalSubtitle}>
            Crie uma categoria de despesa para acompanhar melhor seu orçamento.
          </Text>

          <Text style={styles.inputLabel}>
            Nome da categoria
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ex: Pets, Viagens, Assinaturas"
            value={name}
            onChangeText={onChangeName}
          />

          <Text style={styles.inputLabel}>
            Limite mensal
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ex: 300,00"
            value={limit}
            onChangeText={onChangeLimit}
            keyboardType="numeric"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={onSave}
            >
              <Text style={styles.saveButtonText}>
                Salvar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

interface CategoryDetailModalProps {
  visible: boolean;
  category: AnalyzedCategory | null;
  onClose: () => void;
  onEditLimit: () => void;
  onDeleteCategory: () => void;
}

const CategoryDetailModal = ({
  visible,
  category,
  onClose,
  onEditLimit,
  onDeleteCategory
}: CategoryDetailModalProps) => {
  if (!category) {
    return null;
  }

  const canDeleteCategory = !category.is_default;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.detailModalContent]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.detailScrollContent}
          >
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${category.color}18` }
                ]}
              >
                <MaterialCommunityIcons
                  name={category.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={26}
                  color={category.color}
                />
              </View>

              <View style={styles.detailTitleContainer}>
                <Text style={styles.modalTitle}>
                  {category.name}
                </Text>

                <Text style={styles.modalSubtitle}>
                  Acompanhamento da categoria
                </Text>
              </View>

              {canDeleteCategory && (
                <TouchableOpacity
                  style={styles.deleteIconButton}
                  onPress={onDeleteCategory}
                >
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={21}
                    color="#A93226"
                  />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.detailInfoBox}>
              <Text style={styles.detailLabel}>
                Total no mês atual
              </Text>

              <Text style={styles.detailValue}>
                {formatCurrency(category.spent)}
              </Text>
            </View>

            <View style={styles.detailInfoBox}>
              <Text style={styles.detailLabel}>
                Limite definido
              </Text>

              <Text style={styles.detailValue}>
                {formatCurrency(category.monthly_limit)}
              </Text>
            </View>

            <View style={styles.detailInfoBox}>
              <Text style={styles.detailLabel}>
                Lançamentos no mês atual
              </Text>

              <Text style={styles.detailValue}>
                {category.monthlyTransactions.length}
              </Text>
            </View>

            <View style={styles.educationBox}>
              <View style={styles.educationHeader}>
                <View style={styles.educationIconContainer}>
                  <MaterialCommunityIcons
                    name={
                      category.educationInsight.behavior === 'economia'
                        ? 'piggy-bank-outline'
                        : category.educationInsight.behavior === 'excesso'
                          ? 'alert-circle-outline'
                          : category.educationInsight.behavior === 'equilibrado'
                            ? 'scale-balance'
                            : 'target'
                    }
                    size={22}
                    color={
                      category.educationInsight.behavior === 'excesso'
                        ? '#E67E22'
                        : '#1B365D'
                    }
                  />
                </View>

                <View style={styles.educationTitleContainer}>
                  <Text style={styles.educationTitle}>
                    {category.educationInsight.title}
                  </Text>

                  <Text style={styles.educationSubtitle}>
                    Educação financeira
                  </Text>
                </View>
              </View>

              <Text style={styles.educationMessage}>
                {category.educationInsight.message}
              </Text>

              {category.educationInsight.behavior !== 'sem_limite' &&
                category.educationInsight.behavior !== 'equilibrado' && (
                  <View style={styles.projectionContainer}>
                    <View style={styles.projectionItem}>
                      <Text style={styles.projectionLabel}>
                        6 meses
                      </Text>

                      <Text style={styles.projectionValue}>
                        {formatCurrency(
                          category.educationInsight.projection.sixMonths
                        )}
                      </Text>
                    </View>

                    <View style={styles.projectionItem}>
                      <Text style={styles.projectionLabel}>
                        1 ano
                      </Text>

                      <Text style={styles.projectionValue}>
                        {formatCurrency(
                          category.educationInsight.projection.twelveMonths
                        )}
                      </Text>
                    </View>

                    <View style={styles.projectionItem}>
                      <Text style={styles.projectionLabel}>
                        2 anos
                      </Text>

                      <Text style={styles.projectionValue}>
                        {formatCurrency(
                          category.educationInsight.projection.twentyFourMonths
                        )}
                      </Text>
                    </View>
                  </View>
                )}
            </View>

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={styles.editLimitButton}
                onPress={onEditLimit}
              >
                <Text style={styles.editLimitButtonText}>
                  Editar limite
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
              >
                <Text style={styles.closeButtonText}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

interface EditLimitModalProps {
  visible: boolean;
  category: AnalyzedCategory | null;
  limit: string;
  onChangeLimit: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

const EditLimitModal = ({
  visible,
  category,
  limit,
  onChangeLimit,
  onClose,
  onSave
}: EditLimitModalProps) => {
  if (!category) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            Editar limite
          </Text>

          <Text style={styles.modalSubtitle}>
            Ajuste o limite mensal da categoria {category.name}.
          </Text>

          <Text style={styles.inputLabel}>
            Novo limite mensal
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ex: 800,00"
            value={limit}
            onChangeText={onChangeLimit}
            keyboardType="numeric"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>
                Cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={onSave}
            >
              <Text style={styles.saveButtonText}>
                Salvar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

interface CategoryOptionsModalProps {
  visible: boolean;
  category: AnalyzedCategory | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const CategoryOptionsModal = ({
  visible,
  category,
  onClose,
  onEdit,
  onDelete
}: CategoryOptionsModalProps) => {
  if (!category) {
    return null;
  }

  const canDeleteCategory = !category.is_default;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.optionsOverlay}>
        <View style={styles.optionsContent}>
          <View style={styles.optionsHandle} />

          <Text style={styles.optionsTitle}>
            {category.name}
          </Text>

          <Text style={styles.optionsSubtitle}>
            Escolha uma ação para esta categoria.
          </Text>

          <TouchableOpacity
            style={styles.optionButton}
            onPress={onEdit}
          >
            <View style={styles.optionIconBox}>
              <MaterialCommunityIcons
                name="pencil-outline"
                size={21}
                color="#1B365D"
              />
            </View>

            <View style={styles.optionTextBox}>
              <Text style={styles.optionTitle}>
                Editar limite
              </Text>

              <Text style={styles.optionDescription}>
                Ajustar o valor planejado para esta categoria.
              </Text>
            </View>
          </TouchableOpacity>

          {canDeleteCategory ? (
            <TouchableOpacity
              style={styles.optionButtonDanger}
              onPress={onDelete}
            >
              <View style={styles.optionIconBoxDanger}>
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={21}
                  color="#A93226"
                />
              </View>

              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitleDanger}>
                  Excluir categoria
                </Text>

                <Text style={styles.optionDescription}>
                  Remover esta categoria sem apagar os lançamentos antigos.
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.optionLockedBox}>
              <MaterialCommunityIcons
                name="lock-outline"
                size={19}
                color="#7F8C8D"
              />

              <Text style={styles.optionLockedText}>
                Categoria padrão do FinanceIQ. Ela pode ser editada, mas não excluída.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.optionsCancelButton}
            onPress={onClose}
          >
            <Text style={styles.optionsCancelText}>
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const getStatusColor = (
  status: CategoryStatus,
  defaultColor: string
) => {
  if (status === 'excedido') {
    return '#E74C3C';
  }

  if (status === 'proximo_limite') {
    return '#F39C12';
  }

  if (status === 'atencao') {
    return '#F1C40F';
  }

  return defaultColor;
};

const getStatusBadgeStyle = (status: CategoryStatus) => {
  if (status === 'excedido') {
    return styles.statusExceeded;
  }

  if (status === 'proximo_limite') {
    return styles.statusNearLimit;
  }

  if (status === 'atencao') {
    return styles.statusAttention;
  }

  return styles.statusControlled;
};

const getStatusBadgeTextStyle = (status: CategoryStatus) => {
  if (status === 'excedido') {
    return styles.statusExceededText;
  }

  if (status === 'proximo_limite') {
    return styles.statusNearLimitText;
  }

  if (status === 'atencao') {
    return styles.statusAttentionText;
  }

  return styles.statusControlledText;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },

  header: {
    backgroundColor: '#1B365D',
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10
  },

  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold'
  },

  addButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },

  loadingText: {
    marginTop: 12,
    color: '#7F8C8D',
    fontSize: 14
  },

  scrollContent: {
    padding: 15,
    paddingBottom: 100
  },

  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3
  },

  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },

  summaryTitle: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold'
  },

  summarySubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 2
  },

  summaryIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center'
  },

  summaryValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },

  summaryItem: {
    width: '32%'
  },

  summaryLabel: {
    color: '#95A5A6',
    fontSize: 11,
    marginBottom: 3
  },

  summaryValue: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold'
  },

  negativeValue: {
    color: '#E74C3C'
  },

  summaryAlert: {
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12
  },

  summaryAlertText: {
    flex: 1,
    color: '#7D6608',
    fontSize: 12,
    lineHeight: 17
  },

  summaryBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },

  smallBadge: {
    backgroundColor: '#EAF0F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },

  smallBadgeText: {
    color: '#1B365D',
    fontSize: 11,
    fontWeight: 'bold'
  },

  smallBadgeDanger: {
    backgroundColor: '#FDEDEC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },

  smallBadgeDangerText: {
    color: '#A93226',
    fontSize: 11,
    fontWeight: 'bold'
  },

  sectionHeader: {
    marginBottom: 12
  },

  sectionTitle: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold'
  },

  sectionSubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 3
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },

  card: {
    backgroundColor: '#FFF',
    width: '48%',
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },

  iconContainer: {
    padding: 9,
    borderRadius: 14
  },

  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: 86
  },

  statusBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center'
  },

  statusControlled: {
    backgroundColor: '#EAF7EE'
  },

  statusControlledText: {
    color: '#1E8449'
  },

  statusAttention: {
    backgroundColor: '#FEF9E7'
  },

  statusAttentionText: {
    color: '#B7950B'
  },

  statusNearLimit: {
    backgroundColor: '#FEF1E6'
  },

  statusNearLimitText: {
    color: '#CA6F1E'
  },

  statusExceeded: {
    backgroundColor: '#FDEDEC'
  },

  statusExceededText: {
    color: '#A93226'
  },

  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 4
  },

  categoryDescription: {
    color: '#7F8C8D',
    fontSize: 11,
    lineHeight: 15,
    minHeight: 30,
    marginBottom: 10
  },

  progressBarBg: {
    height: 7,
    backgroundColor: '#EAECEE',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden'
  },

  progressBarFill: {
    height: '100%',
    borderRadius: 4
  },

  priceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  limitText: {
    fontWeight: 'normal',
    color: '#95A5A6'
  },

  remainingText: {
    color: '#7F8C8D',
    fontSize: 11,
    marginTop: 4
  },

  emptyContainer: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginTop: 20
  },

  emptyTitle: {
    color: '#1B365D',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10
  },

  emptyText: {
    color: '#7F8C8D',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end'
  },

  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22
  },

  detailModalContent: {
    maxHeight: '90%'
  },

  detailScrollContent: {
    paddingBottom: 4
  },

  modalTitle: {
    color: '#1B365D',
    fontSize: 20,
    fontWeight: 'bold'
  },

  modalSubtitle: {
    color: '#7F8C8D',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18
  },

  inputLabel: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6
  },

  input: {
    backgroundColor: '#F4F6F8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    color: '#1B365D'
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },

  cancelButton: {
    flex: 1,
    backgroundColor: '#EAECEE',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },

  cancelButtonText: {
    color: '#1B365D',
    fontWeight: 'bold'
  },

  saveButton: {
    flex: 1,
    backgroundColor: '#1B365D',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },

  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },

  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },

  detailTitleContainer: {
    marginLeft: 12,
    flex: 1
  },

  deleteIconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FDEDEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },

  detailInfoBox: {
    backgroundColor: '#F4F6F8',
    borderRadius: 14,
    padding: 13,
    marginBottom: 10
  },

  detailLabel: {
    color: '#7F8C8D',
    fontSize: 12
  },

  detailValue: {
    color: '#1B365D',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 3
  },

  detailActions: {
    flexDirection: 'row',
    gap: 10
  },

  editLimitButton: {
    flex: 1,
    backgroundColor: '#EAF0F6',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },

  editLimitButtonText: {
    color: '#1B365D',
    fontWeight: 'bold'
  },

  closeButton: {
    flex: 1,
    backgroundColor: '#1B365D',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },

  closeButtonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },

  educationBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAF0F6'
  },

  educationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },

  educationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },

  educationTitleContainer: {
    flex: 1
  },

  educationTitle: {
    color: '#1B365D',
    fontSize: 15,
    fontWeight: 'bold'
  },

  educationSubtitle: {
    color: '#7F8C8D',
    fontSize: 11,
    marginTop: 2
  },

  educationMessage: {
    color: '#34495E',
    fontSize: 12,
    lineHeight: 18
  },

  projectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14
  },

  projectionItem: {
    width: '31%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 9,
    alignItems: 'center'
  },

  projectionLabel: {
    color: '#7F8C8D',
    fontSize: 10,
    marginBottom: 4
  },

  projectionValue: {
    color: '#1B365D',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center'
  },

  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end'
  },

  optionsContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22
  },

  optionsHandle: {
    width: 42,
    height: 5,
    borderRadius: 10,
    backgroundColor: '#DDE3EA',
    alignSelf: 'center',
    marginBottom: 18
  },

  optionsTitle: {
    color: '#1B365D',
    fontSize: 20,
    fontWeight: 'bold'
  },

  optionsSubtitle: {
    color: '#7F8C8D',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16
  },

  optionButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EAF0F6',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },

  optionButtonDanger: {
    backgroundColor: '#FDEDEC',
    borderWidth: 1,
    borderColor: '#F5B7B1',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },

  optionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  optionIconBoxDanger: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FADBD8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  optionTextBox: {
    flex: 1
  },

  optionTitle: {
    color: '#1B365D',
    fontSize: 14,
    fontWeight: 'bold'
  },

  optionTitleDanger: {
    color: '#A93226',
    fontSize: 14,
    fontWeight: 'bold'
  },

  optionDescription: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16
  },

  optionLockedBox: {
    backgroundColor: '#F4F6F8',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10
  },

  optionLockedText: {
    flex: 1,
    color: '#7F8C8D',
    fontSize: 12,
    lineHeight: 16
  },

  optionsCancelButton: {
    backgroundColor: '#EAECEE',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4
  },

  optionsCancelText: {
    color: '#1B365D',
    fontWeight: 'bold'
  }
});