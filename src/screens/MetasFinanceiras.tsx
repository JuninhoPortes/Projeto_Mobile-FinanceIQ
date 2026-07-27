import React, {
  useCallback,
  useMemo,
  useState
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useFocusEffect
} from '@react-navigation/native';

import { auth } from '../../firebaseConfig';

import {
  goalService,
  FinancialGoal
} from '../database/goalService';

import {
  goalAnalysisService,
  AnalyzedGoal
} from '../services/goalAnalysisService';

const GOAL_ICONS = [
  'airplane',
  'shield-check-outline',
  'laptop',
  'home-city-outline',
  'car',
  'school-outline',
  'beach',
  'medical-bag',
  'gift-outline',
  'wallet-outline'
];

const GOAL_COLORS = [
  '#1B365D',
  '#27AE60',
  '#8E44AD',
  '#E67E22',
  '#16A085',
  '#C0392B',
  '#2E86C1',
  '#7D3C98'
];

interface GoalFormState {
  title: string;
  description: string;
  targetAmount: string;
  currentAmount: string;
  monthlyContribution: string;
  deadline: string;
  icon: string;
  color: string;
}

const emptyForm: GoalFormState = {
  title: '',
  description: '',
  targetAmount: '',
  currentAmount: '',
  monthlyContribution: '',
  deadline: '',
  icon: 'wallet-outline',
  color: '#1B365D'
};

const formatCurrency = (
  value: number
) => {
  return value.toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
};

const formatPercentage = (
  value: number
) => {
  return `${value.toFixed(0).replace('.', ',')}%`;
};

const moneyToNumber = (
  value: string
) => {
  const onlyNumbers =
    value.replace(/\D/g, '');

  if (!onlyNumbers) {
    return 0;
  }

  return Number(onlyNumbers) / 100;
};

const numberToMoney = (
  value: number
) => {
  if (!value) {
    return '';
  }

  return value.toLocaleString(
    'pt-BR',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
};

const applyMoneyMask = (
  value: string
) => {
  const numericValue =
    moneyToNumber(value);

  if (numericValue === 0) {
    return '';
  }

  return numericValue.toLocaleString(
    'pt-BR',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
};

const applyDeadlineMask = (
  value: string
) => {
  const onlyNumbers =
    value.replace(/\D/g, '').slice(0, 6);

  if (onlyNumbers.length <= 2) {
    return onlyNumbers;
  }

  return `${onlyNumbers.slice(0, 2)}/${onlyNumbers.slice(2)}`;
};

const getDateFromValue = (
  value: any
): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === 'string') {
    const parsedDate =
      new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return null;
};

const formatDeadline = (
  value: any
) => {
  const date =
    getDateFromValue(value);

  if (!date) {
    return 'Sem prazo definido';
  }

  return date.toLocaleDateString(
    'pt-BR',
    {
      month: 'short',
      year: 'numeric'
    }
  );
};

const deadlineToInput = (
  value: any
) => {
  const date =
    getDateFromValue(value);

  if (!date) {
    return '';
  }

  const month =
    String(date.getMonth() + 1).padStart(2, '0');

  const year =
    String(date.getFullYear());

  return `${month}/${year}`;
};

const parseDeadlineInput = (
  value: string
): Date | null => {
  const cleanValue =
    value.trim();

  if (!cleanValue) {
    return null;
  }

  const formattedValue =
    applyDeadlineMask(cleanValue);

  const match =
    formattedValue.match(/^(\d{2})\/(\d{4})$/);

  if (!match) {
    throw new Error(
      'Informe o prazo no formato MM/AAAA.'
    );
  }

  const month =
    Number(match[1]);

  const year =
    Number(match[2]);

  if (
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      'Informe um mês válido entre 01 e 12.'
    );
  }

  return new Date(
    year,
    month,
    0,
    23,
    59,
    59,
    999
  );
};

export default function MetasFinanceiras() {
  const [goals, setGoals] =
    useState<FinancialGoal[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [formVisible, setFormVisible] =
    useState(false);

  const [amountVisible, setAmountVisible] =
    useState(false);

  const [editingGoal, setEditingGoal] =
    useState<FinancialGoal | null>(null);

  const [selectedGoal, setSelectedGoal] =
    useState<FinancialGoal | null>(null);

  const [form, setForm] =
    useState<GoalFormState>(emptyForm);

  const [amountValue, setAmountValue] =
    useState('');

  const [amountMode, setAmountMode] =
    useState<'add' | 'replace'>('add');

  const analyzedGoals =
    useMemo(
      () => goalAnalysisService.analyzeGoals(goals),
      [goals]
    );

  const overview =
    useMemo(
      () => goalAnalysisService.generateOverview(goals),
      [goals]
    );

  const user =
    auth.currentUser;

  const loadGoals = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    try {
      setLoading(true);

      const data =
        await goalService.listAll(user.uid);

      setGoals(data);
    } catch (error) {
      console.error(
        'Erro ao carregar metas:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível carregar suas metas financeiras.'
      );
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  const updateForm = (
    field: keyof GoalFormState,
    value: string
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEditModal = (
    goal: FinancialGoal
  ) => {
    setEditingGoal(goal);

    setForm({
      title: goal.title,
      description: goal.description || '',
      targetAmount: numberToMoney(goal.target_amount),
      currentAmount: numberToMoney(goal.current_amount),
      monthlyContribution: numberToMoney(goal.monthly_contribution),
      deadline: deadlineToInput(goal.deadline),
      icon: goal.icon || 'wallet-outline',
      color: goal.color || '#1B365D'
    });

    setFormVisible(true);
  };

  const closeFormModal = () => {
    if (saving) {
      return;
    }

    setFormVisible(false);
    setEditingGoal(null);
    setForm(emptyForm);
  };

  const validateGoalForm = () => {
    const title =
      form.title.trim();

    const targetAmount =
      moneyToNumber(form.targetAmount);

    if (!title) {
      Alert.alert(
        'Nome obrigatório',
        'Informe um nome para a meta financeira.'
      );

      return false;
    }

    if (targetAmount <= 0) {
      Alert.alert(
        'Valor-alvo obrigatório',
        'Informe um valor-alvo maior que zero para a meta.'
      );

      return false;
    }

    return true;
  };

  const handleSaveGoal = async () => {
    if (!user?.uid) {
      Alert.alert(
        'Usuário não autenticado',
        'Faça login novamente para salvar suas metas.'
      );

      return;
    }

    if (!validateGoalForm()) {
      return;
    }

    try {
      setSaving(true);

      const deadline =
        parseDeadlineInput(form.deadline);

      const goalData = {
        title: form.title,
        description: form.description,
        target_amount: moneyToNumber(form.targetAmount),
        current_amount: moneyToNumber(form.currentAmount),
        monthly_contribution: moneyToNumber(form.monthlyContribution),
        deadline,
        icon: form.icon,
        color: form.color
      };

      if (editingGoal?.id) {
        await goalService.update(
          editingGoal.id,
          goalData
        );
      } else {
        await goalService.create(
          user.uid,
          goalData
        );
      }

      await loadGoals();

      closeFormModal();
    } catch (error: any) {
      console.error(
        'Erro ao salvar meta:',
        error
      );

      Alert.alert(
        'Erro ao salvar',
        error?.message ||
          'Não foi possível salvar a meta financeira.'
      );
    } finally {
      setSaving(false);
    }
  };

  const openAmountModal = (
    goal: FinancialGoal,
    mode: 'add' | 'replace' = 'add'
  ) => {
    setSelectedGoal(goal);
    setAmountMode(mode);
    setAmountValue('');
    setAmountVisible(true);
  };

  const closeAmountModal = () => {
    if (saving) {
      return;
    }

    setSelectedGoal(null);
    setAmountValue('');
    setAmountMode('add');
    setAmountVisible(false);
  };

  const handleSaveAmount = async () => {
    if (!selectedGoal) {
      return;
    }

    const parsedAmount =
      moneyToNumber(amountValue);

    if (parsedAmount <= 0) {
      Alert.alert(
        'Valor obrigatório',
        'Informe um valor maior que zero.'
      );

      return;
    }

    try {
      setSaving(true);

      if (amountMode === 'add') {
        await goalService.addAmount(
          selectedGoal,
          parsedAmount
        );
      } else {
        await goalService.replaceCurrentAmount(
          selectedGoal,
          parsedAmount
        );
      }

      await loadGoals();

      closeAmountModal();
    } catch (error) {
      console.error(
        'Erro ao atualizar valor da meta:',
        error
      );

      Alert.alert(
        'Erro',
        'Não foi possível atualizar o valor da meta.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteGoal = (
    goal: FinancialGoal
  ) => {
    Alert.alert(
      'Concluir meta',
      'Deseja marcar esta meta como concluída?',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Concluir',
          onPress: async () => {
            try {
              await goalService.complete(goal);
              await loadGoals();
            } catch (error) {
              Alert.alert(
                'Erro',
                'Não foi possível concluir a meta.'
              );
            }
          }
        }
      ]
    );
  };

  const handleReopenGoal = (
    goal: FinancialGoal
  ) => {
    Alert.alert(
      'Reabrir meta',
      'Deseja reabrir esta meta para continuar acompanhando?',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Reabrir',
          onPress: async () => {
            try {
              await goalService.reopen(goal);
              await loadGoals();
            } catch (error) {
              Alert.alert(
                'Erro',
                'Não foi possível reabrir a meta.'
              );
            }
          }
        }
      ]
    );
  };

  const handleDeleteGoal = (
    goal: FinancialGoal
  ) => {
    if (!goal.id) {
      return;
    }

    Alert.alert(
      'Excluir meta',
      'Deseja excluir esta meta financeira? Essa ação não apaga lançamentos ou relatórios.',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await goalService.remove(goal.id!);
              await loadGoals();
            } catch (error) {
              Alert.alert(
                'Erro',
                'Não foi possível excluir a meta.'
              );
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Metas Financeiras
          </Text>

          <Text style={styles.headerSubtitle}>
            Planeje objetivos e acompanhe sua evolução.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={openCreateModal}
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
            Carregando metas...
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <GoalsAssistantCard
            overview={overview}
          />

          {analyzedGoals.length === 0 ? (
            <EmptyGoalsState
              onCreateGoal={openCreateModal}
            />
          ) : (
            analyzedGoals.map((item) => (
              <GoalCard
                key={item.goal.id}
                analyzedGoal={item}
                onAddAmount={() =>
                  openAmountModal(item.goal, 'add')
                }
                onReplaceAmount={() =>
                  openAmountModal(item.goal, 'replace')
                }
                onEdit={() =>
                  openEditModal(item.goal)
                }
                onComplete={() =>
                  handleCompleteGoal(item.goal)
                }
                onReopen={() =>
                  handleReopenGoal(item.goal)
                }
                onDelete={() =>
                  handleDeleteGoal(item.goal)
                }
              />
            ))
          )}
        </ScrollView>
      )}

      <GoalFormModal
        visible={formVisible}
        form={form}
        editingGoal={editingGoal}
        saving={saving}
        onClose={closeFormModal}
        onSave={handleSaveGoal}
        onChangeForm={updateForm}
      />

      <GoalAmountModal
        visible={amountVisible}
        amountValue={amountValue}
        amountMode={amountMode}
        selectedGoal={selectedGoal}
        saving={saving}
        onClose={closeAmountModal}
        onSave={handleSaveAmount}
        onChangeAmount={(value) =>
          setAmountValue(applyMoneyMask(value))
        }
        onChangeMode={setAmountMode}
      />
    </SafeAreaView>
  );
}

const GoalsAssistantCard = ({
  overview
}: {
  overview: ReturnType<typeof goalAnalysisService.generateOverview>;
}) => {
  const hasGoals =
    overview.totalGoals > 0;

  return (
    <View style={styles.assistantCard}>
      <View style={styles.assistantHeader}>
        <View style={styles.robotBox}>
          <MaterialCommunityIcons
            name="robot-happy-outline"
            size={30}
            color="#1B365D"
          />
        </View>

        <View style={styles.assistantTextBox}>
          <Text style={styles.assistantTitle}>
            Assistente FinanceIQ
          </Text>

          <Text style={styles.assistantSubtitle}>
            {hasGoals
              ? 'Acompanhe suas metas com projeções automáticas.'
              : 'Crie sua primeira meta para receber projeções inteligentes.'}
          </Text>
        </View>
      </View>

      <View style={styles.overviewGrid}>
        <OverviewItem
          label="Ativas"
          value={String(overview.activeGoals)}
        />

        <OverviewItem
          label="Concluídas"
          value={String(overview.completedGoals)}
        />

        <OverviewItem
          label="Progresso médio"
          value={formatPercentage(overview.averageProgress)}
        />
      </View>

      {hasGoals && (
        <View style={styles.assistantHighlight}>
          <Text style={styles.assistantHighlightLabel}>
            Próxima meta em destaque
          </Text>

          <Text style={styles.assistantHighlightTitle}>
            {overview.nextGoal?.goal.title}
          </Text>

          <Text style={styles.assistantHighlightMessage}>
            {overview.nextGoal?.shortMessage}
          </Text>
        </View>
      )}
    </View>
  );
};

const OverviewItem = ({
  label,
  value
}: {
  label: string;
  value: string;
}) => (
  <View style={styles.overviewItem}>
    <Text style={styles.overviewItemValue}>
      {value}
    </Text>

    <Text style={styles.overviewItemLabel}>
      {label}
    </Text>
  </View>
);

const EmptyGoalsState = ({
  onCreateGoal
}: {
  onCreateGoal: () => void;
}) => (
  <View style={styles.emptyCard}>
    <View style={styles.emptyIconBox}>
      <MaterialCommunityIcons
        name="target"
        size={34}
        color="#1B365D"
      />
    </View>

    <Text style={styles.emptyTitle}>
      Nenhuma meta criada ainda
    </Text>

    <Text style={styles.emptyDescription}>
      Crie metas para acompanhar objetivos como reserva de emergência, viagens, estudos ou compras importantes.
    </Text>

    <TouchableOpacity
      style={styles.emptyButton}
      onPress={onCreateGoal}
    >
      <MaterialCommunityIcons
        name="plus"
        size={20}
        color="#FFF"
      />

      <Text style={styles.emptyButtonText}>
        Criar primeira meta
      </Text>
    </TouchableOpacity>
  </View>
);

const GoalCard = ({
  analyzedGoal,
  onAddAmount,
  onReplaceAmount,
  onEdit,
  onComplete,
  onReopen,
  onDelete
}: {
  analyzedGoal: AnalyzedGoal;
  onAddAmount: () => void;
  onReplaceAmount: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) => {
  const goal =
    analyzedGoal.goal;

  const progress =
    Math.max(
      0,
      Math.min(
        analyzedGoal.progressPercentage,
        100
      )
    );

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View
          style={[
            styles.goalIconBox,
            {
              backgroundColor: `${goal.color}15`
            }
          ]}
        >
          <MaterialCommunityIcons
            name={goal.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={30}
            color={goal.color}
          />
        </View>

        <View style={styles.goalTitleBox}>
          <Text
            style={styles.goalTitle}
            numberOfLines={1}
          >
            {goal.title}
          </Text>

          <Text style={styles.goalDeadline}>
            Prazo: {formatDeadline(goal.deadline)}
          </Text>
        </View>

        <Text style={styles.goalPercentage}>
          {formatPercentage(analyzedGoal.progressPercentage)}
        </Text>
      </View>

      {Boolean(goal.description) && (
        <Text style={styles.goalDescription}>
          {goal.description}
        </Text>
      )}

      <View style={styles.goalProgressTrack}>
        <View
          style={[
            styles.goalProgressFill,
            {
              width: `${progress}%`,
              backgroundColor: analyzedGoal.statusColor
            }
          ]}
        />
      </View>

      <View style={styles.goalValuesRow}>
        <Text style={styles.goalValuesText}>
          {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
        </Text>

        <View
          style={[
            styles.goalStatusPill,
            {
              backgroundColor: analyzedGoal.statusBackgroundColor
            }
          ]}
        >
          <Text
            style={[
              styles.goalStatusText,
              {
                color: analyzedGoal.statusColor
              }
            ]}
          >
            {analyzedGoal.statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.goalAssistantBox}>
        <View style={styles.goalAssistantIcon}>
          <MaterialCommunityIcons
            name="robot-outline"
            size={19}
            color="#1B365D"
          />
        </View>

        <View style={styles.goalAssistantContent}>
          <Text style={styles.goalAssistantTitle}>
            {analyzedGoal.assistantTitle}
          </Text>

          <Text style={styles.goalAssistantMessage}>
            {analyzedGoal.assistantMessage}
          </Text>
        </View>
      </View>

      <View style={styles.goalActions}>
        <TouchableOpacity
          style={styles.primaryGoalAction}
          onPress={onAddAmount}
        >
          <MaterialCommunityIcons
            name="cash-plus"
            size={18}
            color="#FFF"
          />

          <Text style={styles.primaryGoalActionText}>
            Adicionar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryGoalAction}
          onPress={onReplaceAmount}
        >
          <MaterialCommunityIcons
            name="pencil-outline"
            size={17}
            color="#1B365D"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryGoalAction}
          onPress={onEdit}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={17}
            color="#1B365D"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryGoalAction}
          onPress={
            analyzedGoal.status === 'concluida'
              ? onReopen
              : onComplete
          }
        >
          <MaterialCommunityIcons
            name={
              analyzedGoal.status === 'concluida'
                ? 'refresh'
                : 'check'
            }
            size={17}
            color="#1B365D"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteGoalAction}
          onPress={onDelete}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={17}
            color="#C0392B"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const GoalFormModal = ({
  visible,
  form,
  editingGoal,
  saving,
  onClose,
  onSave,
  onChangeForm
}: {
  visible: boolean;
  form: GoalFormState;
  editingGoal: FinancialGoal | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeForm: (
    field: keyof GoalFormState,
    value: string
  ) => void;
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="slide"
    onRequestClose={onClose}
  >
    <KeyboardAvoidingView
      style={styles.modalOverlay}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>
              {editingGoal
                ? 'Editar meta'
                : 'Nova meta financeira'}
            </Text>

            <Text style={styles.modalSubtitle}>
              Defina valores, prazo e projeção mensal.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <MaterialCommunityIcons
              name="close"
              size={22}
              color="#1B365D"
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.modalScroll}
        >
          <Text style={styles.inputLabel}>
            Nome da meta
          </Text>

          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(value) =>
              onChangeForm('title', value)
            }
            placeholder="Ex.: Notebook novo"
            placeholderTextColor="#A0AEC0"
          />

          <Text style={styles.inputLabel}>
            Descrição
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.textArea
            ]}
            value={form.description}
            onChangeText={(value) =>
              onChangeForm('description', value)
            }
            placeholder="Ex.: Compra de equipamento para estudos"
            placeholderTextColor="#A0AEC0"
            multiline
          />

          <View style={styles.formRow}>
            <View style={styles.formColumn}>
              <Text style={styles.inputLabel}>
                Valor-alvo
              </Text>

              <TextInput
                style={styles.input}
                value={form.targetAmount}
                onChangeText={(value) =>
                  onChangeForm(
                    'targetAmount',
                    applyMoneyMask(value)
                  )
                }
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor="#A0AEC0"
              />
            </View>

            <View style={styles.formColumn}>
              <Text style={styles.inputLabel}>
                Valor atual
              </Text>

              <TextInput
                style={styles.input}
                value={form.currentAmount}
                onChangeText={(value) =>
                  onChangeForm(
                    'currentAmount',
                    applyMoneyMask(value)
                  )
                }
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor="#A0AEC0"
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formColumn}>
              <Text style={styles.inputLabel}>
                Aporte mensal
              </Text>

              <TextInput
                style={styles.input}
                value={form.monthlyContribution}
                onChangeText={(value) =>
                  onChangeForm(
                    'monthlyContribution',
                    applyMoneyMask(value)
                  )
                }
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor="#A0AEC0"
              />
            </View>

            <View style={styles.formColumn}>
              <Text style={styles.inputLabel}>
                Prazo
              </Text>

            <TextInput
            style={styles.input}
            value={form.deadline}
            onChangeText={(value) =>
                onChangeForm(
                'deadline',
                applyDeadlineMask(value)
                )
            }
            keyboardType="numeric"
            placeholder="MM/AAAA"
            placeholderTextColor="#A0AEC0"
            maxLength={7}
            />
            </View>
          </View>

          <Text style={styles.inputLabel}>
            Ícone da meta
          </Text>

          <View style={styles.optionGrid}>
            {GOAL_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconOption,
                  form.icon === icon &&
                    styles.iconOptionSelected
                ]}
                onPress={() =>
                  onChangeForm('icon', icon)
                }
              >
                <MaterialCommunityIcons
                  name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={24}
                  color={
                    form.icon === icon
                      ? '#FFF'
                      : '#1B365D'
                  }
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>
            Cor da meta
          </Text>

          <View style={styles.colorGrid}>
            {GOAL_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  {
                    backgroundColor: color
                  },
                  form.color === color &&
                    styles.colorOptionSelected
                ]}
                onPress={() =>
                  onChangeForm('color', color)
                }
              >
                {form.color === color && (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color="#FFF"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              saving && styles.saveButtonDisabled
            ]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="#FFF"
              />
            ) : (
              <Text style={styles.saveButtonText}>
                {editingGoal
                  ? 'Salvar alterações'
                  : 'Criar meta'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const GoalAmountModal = ({
  visible,
  amountValue,
  amountMode,
  selectedGoal,
  saving,
  onClose,
  onSave,
  onChangeAmount,
  onChangeMode
}: {
  visible: boolean;
  amountValue: string;
  amountMode: 'add' | 'replace';
  selectedGoal: FinancialGoal | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeAmount: (value: string) => void;
  onChangeMode: (mode: 'add' | 'replace') => void;
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.amountModalOverlay}>
      <View style={styles.amountModalContent}>
        <Text style={styles.modalTitle}>
          Atualizar progresso
        </Text>

        <Text style={styles.modalSubtitle}>
          {selectedGoal?.title}
        </Text>

        <View style={styles.currentAmountBox}>
          <Text style={styles.currentAmountLabel}>
            Valor atual
          </Text>

          <Text style={styles.currentAmountValue}>
            {formatCurrency(selectedGoal?.current_amount || 0)}
          </Text>
        </View>

        <View style={styles.amountModeRow}>
          <TouchableOpacity
            style={[
              styles.amountModeButton,
              amountMode === 'add' &&
                styles.amountModeButtonActive
            ]}
            onPress={() =>
              onChangeMode('add')
            }
          >
            <Text
              style={[
                styles.amountModeText,
                amountMode === 'add' &&
                  styles.amountModeTextActive
              ]}
            >
              Adicionar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.amountModeButton,
              amountMode === 'replace' &&
                styles.amountModeButtonActive
            ]}
            onPress={() =>
              onChangeMode('replace')
            }
          >
            <Text
              style={[
                styles.amountModeText,
                amountMode === 'replace' &&
                  styles.amountModeTextActive
              ]}
            >
              Substituir
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>
          {amountMode === 'add'
            ? 'Valor a adicionar'
            : 'Novo valor atual'}
        </Text>

        <TextInput
          style={styles.input}
          value={amountValue}
          onChangeText={onChangeAmount}
          keyboardType="numeric"
          placeholder="0,00"
          placeholderTextColor="#A0AEC0"
        />

        <View style={styles.amountModalActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
          >
            <Text style={styles.cancelButtonText}>
              Cancelar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.confirmButton,
              saving && styles.saveButtonDisabled
            ]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="#FFF"
              />
            ) : (
              <Text style={styles.confirmButtonText}>
                Salvar
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8'
  },

  header: {
    backgroundColor: '#1B365D',
    minHeight: 82,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },

  headerTitle: {
    color: '#FFF',
    fontSize: 21,
    fontWeight: 'bold'
  },

  headerSubtitle: {
    color: '#DDE6F0',
    fontSize: 12,
    marginTop: 3
  },

  addButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center'
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },

  loadingText: {
    color: '#7F8C8D',
    fontSize: 14,
    marginTop: 12
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 100
  },

  assistantCard: {
    backgroundColor: '#1B365D',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16
  },

  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },

  robotBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13
  },

  assistantTextBox: {
    flex: 1
  },

  assistantTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },

  assistantSubtitle: {
    color: '#DDE6F0',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },

  overviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  overviewItem: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center'
  },

  overviewItemValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },

  overviewItemLabel: {
    color: '#DDE6F0',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center'
  },

  assistantHighlight: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    padding: 13,
    marginTop: 14
  },

  assistantHighlightLabel: {
    color: '#DDE6F0',
    fontSize: 11,
    marginBottom: 3
  },

  assistantHighlightTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold'
  },

  assistantHighlightMessage: {
    color: '#DDE6F0',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },

  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center'
  },

  emptyIconBox: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },

  emptyTitle: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6
  },

  emptyDescription: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16
  },

  emptyButton: {
    backgroundColor: '#1B365D',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },

  emptyButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 7
  },

  goalCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 17,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1
    },
    shadowOpacity: 0.08,
    shadowRadius: 3
  },

  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },

  goalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  goalTitleBox: {
    flex: 1
  },

  goalTitle: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold'
  },

  goalDeadline: {
    color: '#95A5A6',
    fontSize: 12,
    marginTop: 2
  },

  goalPercentage: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8
  },

  goalDescription: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12
  },

  goalProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5EAF0',
    overflow: 'hidden',
    marginBottom: 9
  },

  goalProgressFill: {
    height: '100%',
    borderRadius: 999
  },

  goalValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },

  goalValuesText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600'
  },

  goalStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },

  goalStatusText: {
    fontSize: 10,
    fontWeight: 'bold'
  },

  goalAssistantBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    marginBottom: 13
  },

  goalAssistantIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },

  goalAssistantContent: {
    flex: 1
  },

  goalAssistantTitle: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 3
  },

  goalAssistantMessage: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 17
  },

  goalActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  primaryGoalAction: {
    flex: 1,
    backgroundColor: '#1B365D',
    borderRadius: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },

  primaryGoalActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6
  },

  secondaryGoalAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6
  },

  deleteGoalAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FDEDEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end'
  },

  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '92%'
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },

  modalTitle: {
    color: '#1B365D',
    fontSize: 19,
    fontWeight: 'bold'
  },

  modalSubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 3
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center'
  },

  modalScroll: {
    paddingBottom: 18
  },

  inputLabel: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 7,
    marginTop: 10
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#DDE3EA',
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: '#1B365D',
    fontSize: 14
  },

  textArea: {
    minHeight: 76,
    textAlignVertical: 'top'
  },

  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  formColumn: {
    width: '48%'
  },

  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9
  },

  iconOption: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center'
  },

  iconOptionSelected: {
    backgroundColor: '#1B365D'
  },

  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16
  },

  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },

  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#DDE6F0'
  },

  saveButton: {
    backgroundColor: '#1B365D',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6
  },

  saveButtonDisabled: {
    opacity: 0.7
  },

  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },

  amountModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },

  amountModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    width: '100%'
  },

  currentAmountBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    marginBottom: 14
  },

  currentAmountLabel: {
    color: '#7F8C8D',
    fontSize: 12,
    marginBottom: 4
  },

  currentAmountValue: {
    color: '#1B365D',
    fontSize: 22,
    fontWeight: 'bold'
  },

  amountModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8
  },

  amountModeButton: {
    flex: 1,
    backgroundColor: '#EAF0F6',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center'
  },

  amountModeButtonActive: {
    backgroundColor: '#1B365D'
  },

  amountModeText: {
    color: '#1B365D',
    fontWeight: 'bold'
  },

  amountModeTextActive: {
    color: '#FFF'
  },

  amountModalActions: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10
  },

  cancelButton: {
    flex: 1,
    backgroundColor: '#EAF0F6',
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: 'center'
  },

  cancelButtonText: {
    color: '#1B365D',
    fontWeight: 'bold'
  },

  confirmButton: {
    flex: 1,
    backgroundColor: '#1B365D',
    borderRadius: 15,
    paddingVertical: 13,
    alignItems: 'center'
  },

  confirmButtonText: {
    color: '#FFF',
    fontWeight: 'bold'
  }
});