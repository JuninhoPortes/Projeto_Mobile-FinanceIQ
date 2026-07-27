import React, {
  useState,
  useCallback
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  useFocusEffect,
  useNavigation
} from '@react-navigation/native';

import { auth } from '../../firebaseConfig';

import {
  transactionService,
  Transaction
} from '../database/transactionService';

import { categoryService } from '../database/categoryService';

import {
  goalService
} from '../database/goalService';

import {
  economicIndicatorsService,
  EconomicIndicator
} from '../services/economicIndicatorsService';

import { periodService } from '../services/periodService';

import {
  ReportSummary,
  ReportCategoryItem,
  reportAnalysisService
} from '../services/reportAnalysisService';

import {
  GoalsOverview,
  goalAnalysisService
} from '../services/goalAnalysisService';

const formatCurrency = (value: number) => {
  return value.toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
};

const formatPercentage = (value: number) => {
  return `${value.toFixed(0).replace('.', ',')}%`;
};

type PanoramaStatus =
  | 'controlado'
  | 'atencao'
  | 'excedido'
  | 'sem_dados';

interface PanoramaVisualStatus {
  status: PanoramaStatus;
  title: string;
  badge: string;
  message: string;
  color: string;
  backgroundColor: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const getPanoramaVisualStatus = (
  report: ReportSummary
): PanoramaVisualStatus => {
  const spentPercentage =
    report.totalPlannedLimit > 0
      ? (report.totalOutcome / report.totalPlannedLimit) * 100
      : 0;

  const hasOutcome =
    report.totalOutcome > 0;

  const hasExceededCategory =
    report.topCategories.some(
      category => category.status === 'excedido'
    );

  const hasNearLimitCategory =
    report.topCategories.some(
      category => category.status === 'proximo_limite'
    );

  const hasAttentionCategory =
    report.topCategories.some(
      category => category.status === 'atencao'
    );

  if (!hasOutcome) {
    return {
      status: 'sem_dados',
      title: 'Mês pronto para começar',
      badge: 'Sem despesas',
      message:
        'Quando você registrar seus gastos, o FinanceIQ vai mostrar o avanço do mês e destacar as categorias mais importantes.',
      color: '#1B365D',
      backgroundColor: '#EAF0F6',
      icon: 'calendar-star'
    };
  }

  if (
    hasExceededCategory ||
    report.totalRemainingLimit < 0
  ) {
    return {
      status: 'excedido',
      title: 'Atenção aos limites',
      badge: 'Acima do planejado',
      message:
        'Algumas categorias passaram do limite definido. Vale observar os maiores gastos para recuperar o equilíbrio aos poucos.',
      color: '#C0392B',
      backgroundColor: '#FDEDEC',
      icon: 'alert-circle-outline'
    };
  }

  if (
    spentPercentage >= 85 ||
    hasNearLimitCategory
  ) {
    return {
      status: 'atencao',
      title: 'Perto do limite',
      badge: 'Acompanhe de perto',
      message:
        'Seu mês ainda está organizado, mas algumas categorias estão se aproximando do limite planejado.',
      color: '#B76300',
      backgroundColor: '#FEF0D9',
      icon: 'speedometer'
    };
  }

  if (
    spentPercentage >= 60 ||
    hasAttentionCategory
  ) {
    return {
      status: 'atencao',
      title: 'Mês em atenção',
      badge: 'Uso moderado',
      message:
        'Você já utilizou uma parte relevante do planejado. Acompanhar os próximos lançamentos ajuda a manter o controle.',
      color: '#9A6B00',
      backgroundColor: '#FFF7D6',
      icon: 'lightbulb-on-outline'
    };
  }

  return {
    status: 'controlado',
    title: 'Dentro do planejado',
    badge: 'Tudo certo até agora',
    message:
      'Seu mês está dentro dos limites definidos. Continue acompanhando as categorias com maior movimento para manter esse equilíbrio.',
    color: '#1E8449',
    backgroundColor: '#EAF7EE',
    icon: 'check-circle-outline'
  };
};

export default function Dashboard() {

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [monthlyReport, setMonthlyReport] =
    useState<ReportSummary | null>(null);

  const [goalsOverview, setGoalsOverview] =
    useState<GoalsOverview | null>(null);

  const [selic, setSelic] =
    useState<EconomicIndicator | null>(null);

  const [ipca, setIpca] =
    useState<EconomicIndicator | null>(null);

  const [dollar, setDollar] =
    useState<EconomicIndicator | null>(null);

  const [loadingIndicators, setLoadingIndicators] =
    useState(false);

  const user = auth.currentUser;
  const navigation = useNavigation<any>();

  // =========================
  // CARREGAR DADOS FIRESTORE
  // =========================
  const loadData = useCallback(async () => {

    if (!user?.uid) return;

    try {

      const currentPeriod =
        periodService.getCurrentMonthPeriod();

      const [
        transactionData,
        categoryData,
        goalData
      ] = await Promise.all([
        transactionService.listAll(user.uid),
        categoryService.listAll(user.uid),
        goalService.listAll(user.uid)
      ]);

      const generatedReport =
        reportAnalysisService.generateMonthlyReport(
          transactionData,
          categoryData,
          currentPeriod
        );

      const generatedGoalsOverview =
         goalAnalysisService.generateOverview(
         goalData
      );

      setTransactions(transactionData);

      setMonthlyReport(generatedReport);
      setGoalsOverview(generatedGoalsOverview);

    } catch (error) {

      console.error(
        'Erro ao carregar Dashboard:',
        error
      );

    }

  }, [user?.uid]);

  // =========================
  // CARREGAR INDICADORES VIA API
  // =========================
  const loadEconomicIndicators = useCallback(async () => {

    try {

      setLoadingIndicators(true);

      const [
        selicData,
        ipcaData,
        dollarData
      ] = await Promise.all([
        economicIndicatorsService.getSelic(),
        economicIndicatorsService.getIpca(),
        economicIndicatorsService.getDollar()
      ]);

      setSelic(selicData);

      setIpca(ipcaData);

      setDollar(dollarData);

    } catch (error) {

      console.error(
        'Erro ao carregar indicadores econômicos:',
        error
      );

      setSelic(null);

      setIpca(null);

      setDollar(null);

    } finally {

      setLoadingIndicators(false);

    }

  }, []);

  // =========================
  // ATUALIZA AO VOLTAR PRA TELA
  // =========================
  useFocusEffect(
    useCallback(() => {
      loadData();
      loadEconomicIndicators();
    }, [
      loadData,
      loadEconomicIndicators
    ])
  );

  // =========================
  // PEGAR INICIAIS
  // =========================
  const getInitials = (name: string | null) => {

    if (!name) return 'U';

    const names = name.trim().split(/\s+/);

    if (names.length > 1) {

      return (
        names[0][0] +
        names[names.length - 1][0]
      ).toUpperCase();

    }

    return names[0][0].toUpperCase();

  };

  // =========================
  // CÁLCULOS FINANCEIROS
  // =========================
  const totalEntradas =
    transactions
      .filter(item => item.type === 'income')
      .reduce(
        (acc, item) =>
          acc + (item.amount || 0),
        0
      );

  const totalSaidas =
    transactions
      .filter(item => item.type === 'outcome')
      .reduce(
        (acc, item) =>
          acc + (item.amount || 0),
        0
      );

  const saldoDisponivel =
    totalEntradas - totalSaidas;

  // =========================
  // APENAS RECENTES
  // =========================
  const recentTransactions =
    transactions.slice(0, 8);

  // =========================
  // PEGAR ÍCONE
  // =========================
  const getIcon = (item: Transaction) => {

    if (item.type === 'income')
      return 'cash-plus';

    const desc =
      item.description.toLowerCase();

    if (desc.includes('moradia'))
      return 'home-outline';

    if (desc.includes('transporte'))
      return 'car-outline';

    if (desc.includes('aliment'))
      return 'cart-outline';

    if (desc.includes('netflix'))
      return 'television-play';

    if (desc.includes('viagem'))
      return 'airplane';

    if (desc.includes('assinatura'))
      return 'tag';

    return 'cash-minus';

  };

  // =========================
  // FORMATAR INDICADOR
  // =========================
  const formatIndicatorValue = (
    indicator: EconomicIndicator | null,
    money?: boolean
  ) => {

    if (!indicator) return '--';

    if (money) {

      return `R$ ${indicator.value
        .toFixed(2)
        .replace('.', ',')}`;

    }

    const unit = '%';

    return `${indicator.value
      .toString()
      .replace('.', ',')} ${unit}`;

  };

  const goToGoals = () => {
  navigation.navigate('MetasFinanceiras');
  };

  return (

    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>

        <Text style={styles.brandText}>
          FinanceIQ
        </Text>

        <TouchableOpacity
          style={styles.profileBadge}
        >

          <Text style={styles.profileText}>
            {getInitials(
              user?.displayName || 'Usuário'
            )}
          </Text>

        </TouchableOpacity>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* GREETING */}
        <Text style={styles.greeting}>
          Bom dia, {
            user?.displayName
              ?.split(' ')[0] || 'Usuário'
          } 👋
        </Text>

        {/* SALDO */}
        <View style={styles.balanceCard}>

          <Text style={styles.balanceLabel}>
            Saldo Disponível
          </Text>

          <Text style={styles.balanceValue}>
            {formatCurrency(saldoDisponivel)}
          </Text>

          <View style={styles.row}>

            <View>

              <Text style={styles.subLabel}>
                Entradas
              </Text>

              <Text style={styles.incomeValue}>
                +{formatCurrency(totalEntradas)}
              </Text>

            </View>

            <View style={{ marginLeft: 25 }}>

              <Text style={styles.subLabel}>
                Saídas
              </Text>

              <Text style={styles.expenseValue}>
                -{formatCurrency(totalSaidas)}
              </Text>

            </View>

          </View>

        </View>

        {/* PANORAMA DO MÊS */}
        {monthlyReport && (
          <MonthPanoramaCard
            report={monthlyReport}
          />
        )}

        {/* METAS EM DESTAQUE */}
        {goalsOverview && (
          <GoalsHighlightCard
            overview={goalsOverview}
            onPress={goToGoals}
          />
        )}

        {/* INDICADORES ECONÔMICOS */}
        <View style={styles.whiteCard}>

          <View style={styles.indicatorsHeader}>

            <View style={styles.indicatorsTitleBox}>

              <MaterialCommunityIcons
                name="chart-line"
                size={22}
                color="#1B365D"
              />

              <Text style={styles.cardTitleNoMargin}>
                Indicadores Econômicos
              </Text>

            </View>

            {loadingIndicators && (

              <ActivityIndicator
                size="small"
                color="#1B365D"
              />

            )}

          </View>

          <Text style={styles.indicatorsDescription}>
            Indicadores econômicos reais obtidos via API FinanceIQ para apoiar a análise financeira do usuário.
          </Text>

          <View style={styles.indicatorGrid}>

            <IndicatorCard
              icon="percent-outline"
              title="Selic"
              value={formatIndicatorValue(selic)}
              subtitle="Taxa básica de juros"
            />

            <IndicatorCard
              icon="chart-bell-curve"
              title="IPCA"
              value={formatIndicatorValue(ipca)}
              subtitle="Inflação acumulada"
            />

            <IndicatorCard
              icon="currency-usd"
              title="Dólar"
              value={formatIndicatorValue(dollar, true)}
              subtitle="Cotação atual"
            />

          </View>

          <Text style={styles.indicatorsSource}>
            Fonte: BrasilAPI • ExchangeRate-API • via API FinanceIQ
          </Text>

        </View>

        {/* HISTÓRICO */}
        <View style={styles.whiteCard}>

          <Text style={styles.cardTitle}>
            Histórico Recente
          </Text>

          {
            recentTransactions.length === 0 ? (

              <Text style={styles.emptyText}>
                Nenhum lançamento encontrado.
              </Text>

            ) : (

              recentTransactions.map((item) => {

                const isSeeder = [
                  'Salário Mensal',
                  'Moradia',
                  'Transporte',
                  'Alimentação'
                ].includes(item.description);

                return (

                  <View
                    key={item.id}
                    style={styles.transactionItem}
                  >

                    <View style={styles.transactionLeft}>

                      <View style={styles.iconContainer}>

                        <MaterialCommunityIcons
                          name={getIcon(item) as any}
                          size={22}
                          color="#1B365D"
                        />

                      </View>

                      <View>

                        <Text style={styles.transactionTitle}>
                          {item.description}
                        </Text>

                        <Text style={styles.transactionCategory}>

                          {isSeeder
                            ? 'Categoria fixa'
                            : item.category}

                        </Text>

                      </View>

                    </View>

                    <Text
                      style={[
                        styles.transactionValue,
                        {
                          color:
                            item.type === 'income'
                              ? '#27AE60'
                              : '#E74C3C'
                        }
                      ]}
                    >

                      {item.type === 'income'
                        ? '+ '
                        : '- '}

                      {formatCurrency(item.amount)}

                    </Text>

                  </View>

                );
              })
            )
          }

        </View>

      </ScrollView>

    </SafeAreaView>

  );
}

// =========================
// PANORAMA DO MÊS
// =========================
const MonthPanoramaCard = ({
  report
}: {
  report: ReportSummary;
}) => {

  const status =
    getPanoramaVisualStatus(report);

  const spentPercentage =
    report.totalPlannedLimit > 0
      ? (report.totalOutcome / report.totalPlannedLimit) * 100
      : 0;

  const progress =
    Math.max(
      0,
      Math.min(spentPercentage, 100)
    );

  const biggestCategory =
    report.biggestExpenseCategory;

  return (

    <View style={styles.panoramaCard}>

<View style={styles.panoramaHeader}>

  <View style={styles.panoramaTitleGroup}>

    <View
      style={[
        styles.panoramaMainIcon,
        {
          backgroundColor: status.backgroundColor
        }
      ]}
    >

      <MaterialCommunityIcons
        name={status.icon}
        size={23}
        color={status.color}
      />

    </View>

    <View style={styles.panoramaTitleTextBox}>

      <Text
        style={styles.panoramaTitle}
        numberOfLines={1}
      >
        Panorama do mês
      </Text>

      <View style={styles.panoramaMetaRow}>

        <Text style={styles.panoramaSubtitle}>
          {report.period.label}
        </Text>

        <View
          style={[
            styles.panoramaBadge,
            {
              backgroundColor: status.backgroundColor
            }
          ]}
        >

          <Text
            style={[
              styles.panoramaBadgeText,
              {
                color: status.color
              }
            ]}
          >
            {status.badge}
          </Text>

        </View>

      </View>

    </View>

  </View>

</View>

      <Text style={styles.panoramaHeadline}>
        {status.title}
      </Text>

      <Text style={styles.panoramaMessage}>
        {status.message}
      </Text>

      <View style={styles.panoramaProgressBox}>

        <View style={styles.panoramaProgressInfo}>

          <Text style={styles.panoramaProgressLabel}>
            Uso do planejado
          </Text>

          <Text style={styles.panoramaProgressPercent}>
            {report.totalPlannedLimit > 0
              ? formatPercentage(spentPercentage)
              : 'Sem limite'}
          </Text>

        </View>

        <View style={styles.panoramaProgressTrack}>

          <View
            style={[
              styles.panoramaProgressFill,
              {
                width: `${progress}%`,
                backgroundColor: status.color
              }
            ]}
          />

        </View>

      </View>

      <View style={styles.panoramaMetricsGrid}>

        <PanoramaMetric
          label="Gasto"
          value={formatCurrency(report.totalOutcome)}
          icon="cash-minus"
          color="#E74C3C"
        />

        <PanoramaMetric
          label="Planejado"
          value={formatCurrency(report.totalPlannedLimit)}
          icon="target"
          color="#1B365D"
        />

        <PanoramaMetric
          label={report.totalRemainingLimit >= 0
            ? 'Restante'
            : 'Acima'}
          value={formatCurrency(
            Math.abs(report.totalRemainingLimit)
          )}
          icon={report.totalRemainingLimit >= 0
            ? 'wallet-outline'
            : 'alert-outline'}
          color={report.totalRemainingLimit >= 0
            ? '#27AE60'
            : '#E74C3C'}
        />

      </View>

      <View style={styles.panoramaBottomBox}>

        <View style={styles.biggestCategoryIcon}>

          <MaterialCommunityIcons
            name={
              biggestCategory
                ? biggestCategory.icon as keyof typeof MaterialCommunityIcons.glyphMap
                : 'chart-box-outline'
            }
            size={22}
            color="#1B365D"
          />

        </View>

        <View style={styles.biggestCategoryContent}>

          <Text style={styles.biggestCategoryLabel}>
            Maior impacto no mês
          </Text>

          <Text style={styles.biggestCategoryTitle}>
            {biggestCategory
              ? biggestCategory.name
              : 'Sem despesas registradas'}
          </Text>

          <Text style={styles.biggestCategorySubtitle}>
            {biggestCategory
              ? `${formatCurrency(biggestCategory.amount)} • ${formatPercentage(biggestCategory.percentageOfExpenses)} das saídas`
              : 'Adicione lançamentos para visualizar o destaque do período.'}
          </Text>

        </View>

      </View>

    </View>

  );
};

// =========================
// MÉTRICA DO PANORAMA
// =========================
const PanoramaMetric = ({
  label,
  value,
  icon,
  color
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
}) => (

  <View style={styles.panoramaMetricCard}>

    <View
      style={[
        styles.panoramaMetricIcon,
        {
          backgroundColor: `${color}14`
        }
      ]}
    >

      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={color}
      />

    </View>

    <Text style={styles.panoramaMetricLabel}>
      {label}
    </Text>

    <Text
      style={styles.panoramaMetricValue}
      numberOfLines={1}
    >
      {value}
    </Text>

  </View>

);

// =========================
// METAS EM DESTAQUE
// =========================
const GoalsHighlightCard = ({
  overview,
  onPress
}: {
  overview: GoalsOverview;
  onPress: () => void;
}) => {
  const hasGoals =
    overview.totalGoals > 0;

  const highlightedGoals =
    overview.highlightedGoals.slice(0, 2);

  return (
    <TouchableOpacity
      style={styles.goalsHighlightCard}
      activeOpacity={0.86}
      onPress={onPress}
    >
      <View style={styles.goalsHighlightHeader}>
        <View style={styles.goalsHeaderLeft}>
          <View style={styles.goalsRobotBox}>
            <MaterialCommunityIcons
              name="robot-happy-outline"
              size={27}
              color="#1B365D"
            />
          </View>

          <View style={styles.goalsTitleBox}>
            <Text style={styles.goalsTitle}>
              Metas em destaque
            </Text>

            <Text style={styles.goalsSubtitle}>
              Assistente FinanceIQ acompanhando seus objetivos.
            </Text>
          </View>
        </View>

        <View style={styles.goalsChevronBox}>
          <MaterialCommunityIcons
            name="chevron-right"
            size={25}
            color="#1B365D"
          />
        </View>
      </View>

      {!hasGoals ? (
        <View style={styles.goalsEmptyBox}>
          <Text style={styles.goalsEmptyTitle}>
            Crie sua primeira meta financeira
          </Text>

          <Text style={styles.goalsEmptyText}>
            Defina um objetivo, informe o valor desejado e deixe o FinanceIQ calcular progresso, previsão e próximos passos.
          </Text>

          <View style={styles.goalsEmptyChip}>
            <MaterialCommunityIcons
              name="lightbulb-on-outline"
              size={15}
              color="#1B365D"
            />

            <Text style={styles.goalsEmptyChipText}>
              Tocar para começar
            </Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.goalsSummaryRow}>
            <View style={styles.goalsSummaryItem}>
              <Text style={styles.goalsSummaryValue}>
                {overview.activeGoals}
              </Text>

              <Text style={styles.goalsSummaryLabel}>
                ativa(s)
              </Text>
            </View>

            <View style={styles.goalsSummaryItem}>
              <Text style={styles.goalsSummaryValue}>
                {overview.completedGoals}
              </Text>

              <Text style={styles.goalsSummaryLabel}>
                concluída(s)
              </Text>
            </View>

            <View style={styles.goalsSummaryItem}>
              <Text style={styles.goalsSummaryValue}>
                {formatPercentage(overview.averageProgress)}
              </Text>

              <Text style={styles.goalsSummaryLabel}>
                progresso médio
              </Text>
            </View>
          </View>

          <View style={styles.goalsListBox}>
            {highlightedGoals.map((item) => {
              const goal =
                item.goal;

              const progress =
                Math.max(
                  0,
                  Math.min(
                    item.progressPercentage,
                    100
                  )
                );

              return (
                <View
                  key={goal.id}
                  style={styles.goalPreviewItem}
                >
                  <View
                    style={[
                      styles.goalPreviewIcon,
                      {
                        backgroundColor: `${goal.color}16`
                      }
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={goal.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={20}
                      color={goal.color}
                    />
                  </View>

                  <View style={styles.goalPreviewContent}>
                    <View style={styles.goalPreviewHeader}>
                      <Text
                        style={styles.goalPreviewTitle}
                        numberOfLines={1}
                      >
                        {goal.title}
                      </Text>

                      <Text style={styles.goalPreviewPercent}>
                        {formatPercentage(item.progressPercentage)}
                      </Text>
                    </View>

                    <View style={styles.goalPreviewTrack}>
                      <View
                        style={[
                          styles.goalPreviewFill,
                          {
                            width: `${progress}%`,
                            backgroundColor: item.statusColor
                          }
                        ]}
                      />
                    </View>

                    <Text
                      style={styles.goalPreviewMessage}
                      numberOfLines={1}
                    >
                      {item.shortMessage}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.goalsAssistantLine}>
            <MaterialCommunityIcons
              name="lightbulb-on-outline"
              size={17}
              color="#1B365D"
            />

            <Text
              style={styles.goalsAssistantText}
              numberOfLines={2}
            >
              {overview.nextGoal?.assistantTitle}: {overview.nextGoal?.shortMessage}
            </Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

// =========================
// CARD DE INDICADOR
// =========================
const IndicatorCard = ({
  icon,
  title,
  value,
  subtitle
}: any) => (

  <View style={styles.indicatorCard}>

    <View style={styles.indicatorIconBox}>

      <MaterialCommunityIcons
        name={icon}
        size={22}
        color="#1B365D"
      />

    </View>

    <Text style={styles.indicatorTitle}>
      {title}
    </Text>

    <Text style={styles.indicatorValue}>
      {value}
    </Text>

    <Text style={styles.indicatorSubtitle}>
      {subtitle}
    </Text>

  </View>
);

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F0F4F8'
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1B365D'
  },

  brandText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },

  profileBadge: {
    backgroundColor: '#34495E',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },

  profileText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 100
  },

  greeting: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 15
  },

  balanceCard: {
    backgroundColor: '#1B365D',
    borderRadius: 20,
    padding: 20,
    marginBottom: 18
  },

  balanceLabel: {
    color: '#BDC3C7',
    fontSize: 13
  },

  balanceValue: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginVertical: 8
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  subLabel: {
    color: '#BDC3C7',
    fontSize: 11
  },

  incomeValue: {
    color: '#4CD964',
    fontWeight: 'bold',
    fontSize: 15
  },

  expenseValue: {
    color: '#FF5E57',
    fontWeight: 'bold',
    fontSize: 15
  },

  panoramaCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1
    },
    shadowOpacity: 0.08,
    shadowRadius: 3
  },

  panoramaHeader: {
    marginBottom: 14
  },

  panoramaTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },


  panoramaTitleTextBox: {
    flex: 1
  },

  panoramaMainIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  panoramaTitle: {
    color: '#1B365D',
    fontSize: 17,
    fontWeight: 'bold'
  },

  panoramaSubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginRight: 8
  },

  panoramaMetaRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  marginTop: 3
  },

  panoramaBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 4
  },

  panoramaBadgeText: {
    fontSize: 10,
    fontWeight: 'bold'
  },

  panoramaHeadline: {
    color: '#1B365D',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6
  },

  panoramaMessage: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16
  },

  panoramaProgressBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14
  },

  panoramaProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },

  panoramaProgressLabel: {
    color: '#7F8C8D',
    fontSize: 12
  },

  panoramaProgressPercent: {
    color: '#1B365D',
    fontSize: 12,
    fontWeight: 'bold'
  },

  panoramaProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5EAF0',
    overflow: 'hidden'
  },

  panoramaProgressFill: {
    height: '100%',
    borderRadius: 999
  },

  panoramaMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },

  panoramaMetricCard: {
    width: '31.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 11
  },

  panoramaMetricIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },

  panoramaMetricLabel: {
    color: '#7F8C8D',
    fontSize: 10,
    marginBottom: 3
  },

  panoramaMetricValue: {
    color: '#1B365D',
    fontSize: 12,
    fontWeight: 'bold'
  },

  panoramaBottomBox: {
    backgroundColor: '#EEF3F8',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },

  biggestCategoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  biggestCategoryContent: {
    flex: 1
  },

  biggestCategoryLabel: {
    color: '#7F8C8D',
    fontSize: 11,
    marginBottom: 2
  },

  biggestCategoryTitle: {
    color: '#1B365D',
    fontSize: 15,
    fontWeight: 'bold'
  },

  biggestCategorySubtitle: {
    color: '#667085',
    fontSize: 11,
    marginTop: 2
  },

  whiteCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 20
  },

  cardTitleNoMargin: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D',
    marginLeft: 8
  },

  indicatorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },

  indicatorsTitleBox: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  indicatorsDescription: {
    fontSize: 13,
    color: '#7F8C8D',
    lineHeight: 19,
    marginBottom: 16
  },

  indicatorGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  indicatorCard: {
    width: '31%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center'
  },

  indicatorIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF3F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },

  indicatorTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  indicatorValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#27AE60',
    marginTop: 5,
    textAlign: 'center'
  },

  indicatorSubtitle: {
    fontSize: 10,
    color: '#95A5A6',
    marginTop: 4,
    textAlign: 'center'
  },

  indicatorsSource: {
    fontSize: 11,
    color: '#95A5A6',
    marginTop: 14,
    textAlign: 'center'
  },

  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18
  },

  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },

  iconContainer: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },

  transactionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  transactionCategory: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 2
  },

  transactionValue: {
    fontWeight: 'bold',
    fontSize: 15
  },

  emptyText: {
    textAlign: 'center',
    color: '#95A5A6',
    marginTop: 10
  },

  goalsHighlightCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 24,
  padding: 18,
  marginBottom: 20,
  borderWidth: 1,
  borderColor: '#E5EAF0',
  elevation: 3,
  shadowColor: '#000',
  shadowOffset: {
    width: 0,
    height: 1
  },
  shadowOpacity: 0.08,
  shadowRadius: 3
},

goalsHighlightHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14
},

goalsHeaderLeft: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1
},

goalsRobotBox: {
  width: 48,
  height: 48,
  borderRadius: 17,
  backgroundColor: '#EAF0F6',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 12
},

goalsTitleBox: {
  flex: 1
},

goalsTitle: {
  color: '#1B365D',
  fontSize: 17,
  fontWeight: 'bold'
},

goalsSubtitle: {
  color: '#667085',
  fontSize: 12,
  lineHeight: 17,
  marginTop: 2
},

goalsChevronBox: {
  width: 38,
  height: 38,
  borderRadius: 14,
  backgroundColor: '#F0F4F8',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 10
},

goalsEmptyBox: {
  backgroundColor: '#F8FAFC',
  borderRadius: 18,
  padding: 15
},

goalsEmptyTitle: {
  color: '#1B365D',
  fontSize: 15,
  fontWeight: 'bold',
  marginBottom: 5
},

goalsEmptyText: {
  color: '#667085',
  fontSize: 12,
  lineHeight: 18,
  marginBottom: 12
},

goalsEmptyChip: {
  alignSelf: 'flex-start',
  backgroundColor: '#EAF0F6',
  borderRadius: 999,
  paddingHorizontal: 11,
  paddingVertical: 7,
  flexDirection: 'row',
  alignItems: 'center'
},

goalsEmptyChipText: {
  color: '#1B365D',
  fontSize: 11,
  fontWeight: 'bold',
  marginLeft: 5
},

goalsSummaryRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  marginBottom: 14
},

goalsSummaryItem: {
  width: '31.5%',
  backgroundColor: '#F8FAFC',
  borderRadius: 16,
  padding: 11,
  alignItems: 'center'
},

goalsSummaryValue: {
  color: '#1B365D',
  fontSize: 17,
  fontWeight: 'bold'
},

goalsSummaryLabel: {
  color: '#7F8C8D',
  fontSize: 10,
  marginTop: 3,
  textAlign: 'center'
},

goalsListBox: {
  gap: 11
},

goalPreviewItem: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#F8FAFC',
  borderRadius: 18,
  padding: 12
},

goalPreviewIcon: {
  width: 40,
  height: 40,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 11
},

goalPreviewContent: {
  flex: 1
},

goalPreviewHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 7
},

goalPreviewTitle: {
  flex: 1,
  color: '#1B365D',
  fontSize: 13,
  fontWeight: 'bold',
  marginRight: 8
},

goalPreviewPercent: {
  color: '#1B365D',
  fontSize: 12,
  fontWeight: 'bold'
},

goalPreviewTrack: {
  height: 7,
  borderRadius: 999,
  backgroundColor: '#E5EAF0',
  overflow: 'hidden',
  marginBottom: 5
},

goalPreviewFill: {
  height: '100%',
  borderRadius: 999
},

goalPreviewMessage: {
  color: '#667085',
  fontSize: 11
},

goalsAssistantLine: {
  backgroundColor: '#EAF0F6',
  borderRadius: 16,
  padding: 12,
  marginTop: 13,
  flexDirection: 'row',
  alignItems: 'center'
},

goalsAssistantText: {
  flex: 1,
  color: '#1B365D',
  fontSize: 12,
  lineHeight: 17,
  marginLeft: 8
}

});