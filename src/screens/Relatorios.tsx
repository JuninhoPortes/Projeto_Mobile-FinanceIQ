import React, { useCallback, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';

import { categoryService } from '../database/categoryService';
import { transactionService } from '../database/transactionService';

import {
  MonthPeriod,
  periodService
} from '../services/periodService';

import {
  ReportSummary,
  ReportCategoryItem,
  reportAnalysisService
} from '../services/reportAnalysisService';

import { reportPdfService } from '../services/reportPdfService';

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

const formatPercentage = (value: number) => {
  return `${value.toFixed(1).replace('.', ',')}%`;
};

export default function Relatorios() {
  const [selectedPeriod, setSelectedPeriod] =
    useState<MonthPeriod>(
      periodService.getCurrentMonthPeriod()
    );

  const [report, setReport] =
    useState<ReportSummary | null>(null);

  const [loading, setLoading] = useState(true);

  const [exportingPdf, setExportingPdf] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        Alert.alert(
          'Usuário não autenticado',
          'Faça login novamente para carregar seus relatórios.'
        );

        return;
      }

      const [transactions, categories] =
        await Promise.all([
          transactionService.listByPeriod(
            user.uid,
            selectedPeriod.periodMonth
          ),
          categoryService.listAll(user.uid)
        ]);

      const generatedReport =
        reportAnalysisService.generateMonthlyReport(
          transactions,
          categories,
          selectedPeriod
        );

      setReport(generatedReport);
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);

      Alert.alert(
        'Erro',
        'Não foi possível carregar o relatório financeiro.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport])
  );

  const goToPreviousMonth = () => {
    setSelectedPeriod((currentPeriod) =>
      periodService.getPreviousPeriod(currentPeriod)
    );
  };

  const goToNextMonth = () => {
    setSelectedPeriod((currentPeriod) =>
      periodService.getNextPeriod(currentPeriod)
    );
  };

  const goToCurrentMonth = () => {
    setSelectedPeriod(
      periodService.getCurrentMonthPeriod()
    );
  };
  const handleExportPdf = async () => {
  if (!report) {
    Alert.alert(
      'Relatório indisponível',
      'Aguarde o carregamento dos dados antes de emitir o PDF.'
    );

    return;
  }

  try {
    setExportingPdf(true);

    const auth = getAuth();
    const user = auth.currentUser;

    const userName =
      user?.displayName ||
      user?.email ||
      'Usuário FinanceIQ';

    const result =
      await reportPdfService.exportMonthlyReport(
        report,
        {
          userName
        }
      );

    if (result.cancelled) {
      Alert.alert(
        'Exportação cancelada',
        'Nenhuma pasta foi selecionada para salvar o relatório.'
      );

      return;
    }

    if (result.saved) {
      Alert.alert(
        'Relatório salvo',
        `O arquivo ${result.fileName} foi salvo no dispositivo.`
      );
    }
  } catch (error) {
    console.error('Erro ao exportar relatório em PDF:', error);

    Alert.alert(
      'Erro ao gerar PDF',
      'Não foi possível emitir o relatório em PDF. Tente novamente em alguns instantes.'
    );
  } finally {
    setExportingPdf(false);
  }
};


  const canGoNext =
    !selectedPeriod.isCurrentMonth;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Relatórios
          </Text>

          <Text style={styles.headerSubtitle}>
            Acompanhe seus resultados por período.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.pdfButton,
            exportingPdf && styles.pdfButtonDisabled
          ]}
          onPress={handleExportPdf}
          disabled={exportingPdf || loading}
        >
          {exportingPdf ? (
            <ActivityIndicator
              size="small"
              color="#FFF"
            />
          ) : (
            <MaterialCommunityIcons
              name="tray-arrow-up"
              size={24}
              color="#FFF"
            />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={styles.periodButton}
          onPress={goToPreviousMonth}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color="#1B365D"
          />
        </TouchableOpacity>

        <View style={styles.periodCenter}>
          <Text style={styles.periodLabel}>
            {selectedPeriod.label}
          </Text>

          <Text style={styles.periodStatus}>
            {selectedPeriod.isCurrentMonth
              ? 'Mês em andamento'
              : 'Mês fechado'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.periodButton,
            !canGoNext && styles.periodButtonDisabled
          ]}
          onPress={goToNextMonth}
          disabled={!canGoNext}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={26}
            color={
              canGoNext
                ? '#1B365D'
                : '#BDC3C7'
            }
          />
        </TouchableOpacity>
      </View>

      {!selectedPeriod.isCurrentMonth && (
        <TouchableOpacity
          style={styles.currentMonthButton}
          onPress={goToCurrentMonth}
        >
          <MaterialCommunityIcons
            name="calendar-today"
            size={17}
            color="#1B365D"
          />

          <Text style={styles.currentMonthText}>
            Voltar para o mês atual
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#1B365D"
          />

          <Text style={styles.loadingText}>
            Gerando relatório...
          </Text>
        </View>
      ) : report ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
        <ReportOverview report={report} />

        <IncomeOutcomeCard report={report} />

        <FinancialInsightCard report={report} />

        <TopCategoriesSection
          categories={report.topCategories}
        />

        <ReportDetails report={report} />

        <ExportReportCard
          exportingPdf={exportingPdf}
          onExportPdf={handleExportPdf}
        />
        </ScrollView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            Nenhum relatório disponível.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

interface ReportOverviewProps {
  report: ReportSummary;
}

const ReportOverview = ({
  report
}: ReportOverviewProps) => {
  return (
    <View style={styles.overviewCard}>
      <View style={styles.overviewHeader}>
        <View>
          <Text style={styles.overviewTitle}>
            Resumo financeiro
          </Text>

          <Text style={styles.overviewSubtitle}>
            {report.period.isCurrentMonth
              ? 'Resultado parcial do mês atual.'
              : `Resultado consolidado de ${report.period.label}.`}
          </Text>
        </View>

        <View
          style={[
            styles.balanceBadge,
            report.balanceStatus === 'positivo' && styles.balancePositive,
            report.balanceStatus === 'negativo' && styles.balanceNegative,
            report.balanceStatus === 'neutro' && styles.balanceNeutral
          ]}
        >
          <Text
            style={[
              styles.balanceBadgeText,
              report.balanceStatus === 'positivo' && styles.balancePositiveText,
              report.balanceStatus === 'negativo' && styles.balanceNegativeText,
              report.balanceStatus === 'neutro' && styles.balanceNeutralText
            ]}
          >
            {report.balanceStatus === 'positivo'
              ? 'Positivo'
              : report.balanceStatus === 'negativo'
                ? 'Atenção'
                : 'Neutro'}
          </Text>
        </View>
      </View>

      <Text
        style={[
          styles.balanceValue,
          report.balance < 0 && styles.negativeValue
        ]}
      >
        {formatCurrency(report.balance)}
      </Text>

      <Text style={styles.balanceLabel}>
        Saldo do período
      </Text>

      <View style={styles.overviewGrid}>
        <MetricCard
          label="Entradas"
          value={formatCurrency(report.totalIncome)}
          icon="arrow-down-circle-outline"
          variant="income"
        />

        <MetricCard
          label="Saídas"
          value={formatCurrency(report.totalOutcome)}
          icon="arrow-up-circle-outline"
          variant="outcome"
        />

        <MetricCard
          label="Planejado"
          value={formatCurrency(report.totalPlannedLimit)}
          icon="target"
          variant="neutral"
        />

        <MetricCard
          label="Restante"
          value={formatCurrency(report.totalRemainingLimit)}
          icon="wallet-outline"
          variant={
            report.totalRemainingLimit >= 0
              ? 'income'
              : 'outcome'
          }
        />
      </View>
    </View>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  variant: 'income' | 'outcome' | 'neutral';
}

const MetricCard = ({
  label,
  value,
  icon,
  variant
}: MetricCardProps) => {
  return (
    <View style={styles.metricCard}>
      <View
        style={[
          styles.metricIconBox,
          variant === 'income' && styles.metricIncomeBg,
          variant === 'outcome' && styles.metricOutcomeBg,
          variant === 'neutral' && styles.metricNeutralBg
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={
            variant === 'income'
              ? '#1E8449'
              : variant === 'outcome'
                ? '#A93226'
                : '#1B365D'
          }
        />
      </View>

      <Text style={styles.metricLabel}>
        {label}
      </Text>

      <Text
        style={[
          styles.metricValue,
          variant === 'outcome' && styles.metricValueDanger
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
};

interface IncomeOutcomeCardProps {
  report: ReportSummary;
}

const IncomeOutcomeCard = ({
  report
}: IncomeOutcomeCardProps) => {
  return (
    <View style={styles.analysisCard}>
      <View style={styles.sectionTitleRow}>
        <View>
          <Text style={styles.sectionTitle}>
            Entradas x Saídas
          </Text>

          <Text style={styles.sectionSubtitle}>
            Participação no movimento financeiro do período.
          </Text>
        </View>

        <MaterialCommunityIcons
          name="chart-bar"
          size={24}
          color="#1B365D"
        />
      </View>

      <View style={styles.horizontalBarContainer}>
        <View style={styles.horizontalBarTrack}>
          <View
            style={[
              styles.horizontalBarIncome,
              {
                width: `${Math.min(report.incomePercentage, 100)}%`
              }
            ]}
          />

          <View
            style={[
              styles.horizontalBarOutcome,
              {
                width: `${Math.min(report.outcomePercentage, 100)}%`
              }
            ]}
          />
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={styles.legendIncomeDot} />

          <Text style={styles.legendText}>
            Entradas {formatPercentage(report.incomePercentage)}
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View style={styles.legendOutcomeDot} />

          <Text style={styles.legendText}>
            Saídas {formatPercentage(report.outcomePercentage)}
          </Text>
        </View>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {report.incomeTransactionsCount} entrada(s)
        </Text>

        <Text style={styles.countText}>
          {report.outcomeTransactionsCount} saída(s)
        </Text>

        <Text style={styles.countText}>
          {report.totalTransactionsCount} lançamento(s)
        </Text>
      </View>
    </View>
  );
};

interface FinancialInsightCardProps {
  report: ReportSummary;
}

const FinancialInsightCard = ({
  report
}: FinancialInsightCardProps) => {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIconBox}>
        <MaterialCommunityIcons
          name="lightbulb-on-outline"
          size={24}
          color="#F39C12"
        />
      </View>

      <View style={styles.insightContent}>
        <Text style={styles.insightTitle}>
          {report.insightTitle}
        </Text>

        <Text style={styles.insightMessage}>
          {report.insightMessage}
        </Text>
      </View>
    </View>
  );
};

interface TopCategoriesSectionProps {
  categories: ReportCategoryItem[];
}

const TopCategoriesSection = ({
  categories
}: TopCategoriesSectionProps) => {
  const topCategories =
    categories.slice(0, 5);

  return (
    <View style={styles.analysisCard}>
      <View style={styles.sectionTitleRow}>
        <View>
          <Text style={styles.sectionTitle}>
            Categorias com maior gasto
          </Text>

          <Text style={styles.sectionSubtitle}>
            Principais áreas que impactaram suas despesas.
          </Text>
        </View>

        <MaterialCommunityIcons
          name="podium"
          size={24}
          color="#1B365D"
        />
      </View>

      {topCategories.length === 0 ? (
        <View style={styles.emptyReportBox}>
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={36}
            color="#95A5A6"
          />

          <Text style={styles.emptyReportTitle}>
            Nenhuma saída registrada
          </Text>

          <Text style={styles.emptyReportText}>
            Cadastre despesas neste período para visualizar o ranking de categorias.
          </Text>
        </View>
      ) : (
        topCategories.map((category, index) => (
          <CategoryReportRow
            key={category.name}
            category={category}
            position={index + 1}
          />
        ))
      )}
    </View>
  );
};

interface CategoryReportRowProps {
  category: ReportCategoryItem;
  position: number;
}

const CategoryReportRow = ({
  category,
  position
}: CategoryReportRowProps) => {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryPosition}>
        <Text style={styles.categoryPositionText}>
          {position}
        </Text>
      </View>

      <View
        style={[
          styles.categoryIconBox,
          { backgroundColor: `${category.color}18` }
        ]}
      >
        <MaterialCommunityIcons
          name={category.icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={22}
          color={category.color}
        />
      </View>

      <View style={styles.categoryRowContent}>
        <View style={styles.categoryRowHeader}>
          <Text style={styles.categoryRowName}>
            {category.name}
          </Text>

          <Text style={styles.categoryRowAmount}>
            {formatCurrency(category.amount)}
          </Text>
        </View>

        <View style={styles.categoryProgressBg}>
          <View
            style={[
              styles.categoryProgressFill,
              {
                width: `${Math.min(category.percentageOfExpenses, 100)}%`,
                backgroundColor: getStatusColor(
                  category.status,
                  category.color
                )
              }
            ]}
          />
        </View>

        <View style={styles.categoryRowFooter}>
          <Text style={styles.categoryRowSmallText}>
            {formatPercentage(category.percentageOfExpenses)} das saídas
          </Text>

          <Text style={styles.categoryRowSmallText}>
            {category.transactionsCount} lançamento(s)
          </Text>
        </View>
      </View>
    </View>
  );
};

interface ReportDetailsProps {
  report: ReportSummary;
}

const ReportDetails = ({
  report
}: ReportDetailsProps) => {
  return (
    <View style={styles.detailsCard}>
      <Text style={styles.sectionTitle}>
        Detalhes do período
      </Text>

      <View style={styles.detailLine}>
        <Text style={styles.detailLineLabel}>
          Período analisado
        </Text>

        <Text style={styles.detailLineValue}>
          {report.period.label}
        </Text>
      </View>

      <View style={styles.detailLine}>
        <Text style={styles.detailLineLabel}>
          Status
        </Text>

        <Text style={styles.detailLineValue}>
          {report.period.isCurrentMonth
            ? 'Em andamento'
            : 'Fechado'}
        </Text>
      </View>

      <View style={styles.detailLine}>
        <Text style={styles.detailLineLabel}>
          Maior categoria
        </Text>

        <Text style={styles.detailLineValue}>
          {report.biggestExpenseCategory
            ? report.biggestExpenseCategory.name
            : 'Sem despesas'}
        </Text>
      </View>

      <View style={styles.detailLine}>
        <Text style={styles.detailLineLabel}>
          Situação do saldo
        </Text>

        <Text
          style={[
            styles.detailLineValue,
            report.balance < 0 && styles.negativeValue
          ]}
        >
          {report.balanceStatus === 'positivo'
            ? 'Saldo positivo'
            : report.balanceStatus === 'negativo'
              ? 'Saldo negativo'
              : 'Saldo neutro'}
        </Text>
      </View>
    </View>
  );
};

interface ExportReportCardProps {
  exportingPdf: boolean;
  onExportPdf: () => void;
}

const ExportReportCard = ({
  exportingPdf,
  onExportPdf
}: ExportReportCardProps) => {
  return (
    <View style={styles.exportCard}>
      <View style={styles.exportIconBox}>
        <MaterialCommunityIcons
          name="file-chart-outline"
          size={28}
          color="#1B365D"
        />
      </View>

      <View style={styles.exportContent}>
        <Text style={styles.exportTitle}>
          Emitir relatório financeiro
        </Text>

        <Text style={styles.exportDescription}>
          Gere um PDF profissional com o resumo, as categorias e a análise financeira deste período.
        </Text>

        <TouchableOpacity
          style={[
            styles.exportButton,
            exportingPdf && styles.exportButtonDisabled
          ]}
          onPress={onExportPdf}
          disabled={exportingPdf}
        >
          {exportingPdf ? (
            <ActivityIndicator
              size="small"
              color="#FFF"
            />
          ) : (
            <>
              <MaterialCommunityIcons
                name="tray-arrow-up"
                size={20}
                color="#FFF"
              />

              <Text style={styles.exportButtonText}>
                Baixar relatório em PDF
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },

  header: {
    backgroundColor: '#1B365D',
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12
  },

  headerTitle: {
    color: '#FFF',
    fontSize: 21,
    fontWeight: 'bold'
  },

  headerSubtitle: {
    color: '#DDE6F0',
    fontSize: 12,
    marginTop: 2
  },

  pdfButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },

  pdfButtonDisabled: {
  opacity: 0.6
  },

  periodSelector: {
    backgroundColor: '#FFF',
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2
  },

  periodButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center'
  },

  periodButtonDisabled: {
    backgroundColor: '#F4F6F8'
  },

  periodCenter: {
    alignItems: 'center',
    flex: 1
  },

  periodLabel: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold'
  },

  periodStatus: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 2
  },

  currentMonthButton: {
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: '#EAF0F6',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },

  currentMonthText: {
    color: '#1B365D',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6
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

  overviewCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3
  },

  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },

  overviewTitle: {
    color: '#1B365D',
    fontSize: 18,
    fontWeight: 'bold'
  },

  overviewSubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 3
  },

  balanceBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },

  balancePositive: {
    backgroundColor: '#EAF7EE'
  },

  balanceNegative: {
    backgroundColor: '#FDEDEC'
  },

  balanceNeutral: {
    backgroundColor: '#EAF0F6'
  },

  balanceBadgeText: {
    fontSize: 11,
    fontWeight: 'bold'
  },

  balancePositiveText: {
    color: '#1E8449'
  },

  balanceNegativeText: {
    color: '#A93226'
  },

  balanceNeutralText: {
    color: '#1B365D'
  },

  balanceValue: {
    color: '#1B365D',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 18
  },

  balanceLabel: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16
  },

  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },

  metricCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 13,
    marginBottom: 10
  },

  metricIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },

  metricIncomeBg: {
    backgroundColor: '#EAF7EE'
  },

  metricOutcomeBg: {
    backgroundColor: '#FDEDEC'
  },

  metricNeutralBg: {
    backgroundColor: '#EAF0F6'
  },

  metricLabel: {
    color: '#7F8C8D',
    fontSize: 11,
    marginBottom: 3
  },

  metricValue: {
    color: '#1B365D',
    fontSize: 14,
    fontWeight: 'bold'
  },

  metricValueDanger: {
    color: '#A93226'
  },

  negativeValue: {
    color: '#E74C3C'
  },

  analysisCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2
  },

  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14
  },

  sectionTitle: {
    color: '#1B365D',
    fontSize: 17,
    fontWeight: 'bold'
  },

  sectionSubtitle: {
    color: '#7F8C8D',
    fontSize: 12,
    marginTop: 3,
    maxWidth: 260
  },

  horizontalBarContainer: {
    marginTop: 6,
    marginBottom: 12
  },

  horizontalBarTrack: {
    height: 14,
    borderRadius: 10,
    backgroundColor: '#EAECEE',
    overflow: 'hidden',
    flexDirection: 'row'
  },

  horizontalBarIncome: {
    height: '100%',
    backgroundColor: '#27AE60'
  },

  horizontalBarOutcome: {
    height: '100%',
    backgroundColor: '#E74C3C'
  },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  legendIncomeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#27AE60',
    marginRight: 6
  },

  legendOutcomeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E74C3C',
    marginRight: 6
  },

  legendText: {
    color: '#7F8C8D',
    fontSize: 12
  },

  countRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  countText: {
    color: '#1B365D',
    fontSize: 11,
    fontWeight: 'bold'
  },

  insightCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#F9E6B3'
  },

  insightIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },

  insightContent: {
    flex: 1
  },

  insightTitle: {
    color: '#7D6608',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 5
  },

  insightMessage: {
    color: '#7D6608',
    fontSize: 12,
    lineHeight: 18
  },

  emptyReportBox: {
    alignItems: 'center',
    paddingVertical: 24
  },

  emptyReportTitle: {
    color: '#1B365D',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8
  },

  emptyReportText: {
    color: '#7F8C8D',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },

  categoryPosition: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#EAF0F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },

  categoryPositionText: {
    color: '#1B365D',
    fontSize: 12,
    fontWeight: 'bold'
  },

  categoryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11
  },

  categoryRowContent: {
    flex: 1
  },

  categoryRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7
  },

  categoryRowName: {
    color: '#1B365D',
    fontSize: 14,
    fontWeight: 'bold'
  },

  categoryRowAmount: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold'
  },

  categoryProgressBg: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EAECEE',
    overflow: 'hidden',
    marginBottom: 5
  },

  categoryProgressFill: {
    height: '100%',
    borderRadius: 4
  },

  categoryRowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  categoryRowSmallText: {
    color: '#7F8C8D',
    fontSize: 10
  },

  detailsCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16
  },

  detailLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  detailLineLabel: {
    color: '#7F8C8D',
    fontSize: 13
  },

  detailLineValue: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold'
  },
  exportCard: {
  backgroundColor: '#1B365D',
  borderRadius: 24,
  padding: 18,
  marginBottom: 18,
  flexDirection: 'row',
  alignItems: 'flex-start',
  elevation: 3,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.12,
  shadowRadius: 3
},

exportIconBox: {
  width: 50,
  height: 50,
  borderRadius: 16,
  backgroundColor: '#FFFFFF',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 14
},

exportContent: {
  flex: 1
},

exportTitle: {
  color: '#FFFFFF',
  fontSize: 17,
  fontWeight: 'bold',
  marginBottom: 5
},

exportDescription: {
  color: '#DDE6F0',
  fontSize: 12,
  lineHeight: 18,
  marginBottom: 14
},

exportButton: {
  backgroundColor: '#FFFFFF',
  borderRadius: 15,
  paddingVertical: 12,
  paddingHorizontal: 14,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center'
},

exportButtonDisabled: {
  opacity: 0.7
},

exportButtonText: {
  color: '#1B365D',
  fontSize: 13,
  fontWeight: 'bold',
  marginLeft: 7
}

});