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
  useFocusEffect
} from '@react-navigation/native';

import { auth } from '../../firebaseConfig';

import {
  userProfileService,
  UserProfile
} from '../database/userProfileService';

import {
  transactionService,
  Transaction
} from '../database/transactionService';

import {
  economicIndicatorsService,
  EconomicIndicator
} from '../services/economicIndicatorsService';

export default function Dashboard() {

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [selic, setSelic] =
    useState<EconomicIndicator | null>(null);

  const [ipca, setIpca] =
    useState<EconomicIndicator | null>(null);

  const [dollar, setDollar] =
    useState<EconomicIndicator | null>(null);

  const [loadingIndicators, setLoadingIndicators] =
    useState(false);

  const user = auth.currentUser;

  // =========================
  // CARREGAR DADOS FIRESTORE
  // =========================
  const loadData = async () => {

    if (!user?.uid) return;

    try {

      const profileData =
        await userProfileService.getProfile(user.uid);

      const transactionData =
        await transactionService.listAll(user.uid);

      setProfile(profileData);

      setTransactions(transactionData);

    } catch (error) {

      console.error(
        'Erro ao carregar Dashboard:',
        error
      );

    }

  };

  // =========================
  // CARREGAR INDICADORES VIA API
  // =========================
  const loadEconomicIndicators = async () => {

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

  };

  // =========================
  // ATUALIZA AO VOLTAR PRA TELA
  // =========================
  useFocusEffect(
    useCallback(() => {
      loadData();
      loadEconomicIndicators();
    }, [])
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
            R$ {
              saldoDisponivel.toLocaleString(
                'pt-BR',
                {
                  minimumFractionDigits: 2
                }
              )
            }
          </Text>

          <View style={styles.row}>

            <View>

              <Text style={styles.subLabel}>
                Entradas
              </Text>

              <Text style={styles.incomeValue}>
                +R$ {
                  totalEntradas.toLocaleString(
                    'pt-BR',
                    {
                      minimumFractionDigits: 2
                    }
                  )
                }
              </Text>

            </View>

            <View style={{ marginLeft: 25 }}>

              <Text style={styles.subLabel}>
                Saídas
              </Text>

              <Text style={styles.expenseValue}>
                -R$ {
                  totalSaidas.toLocaleString(
                    'pt-BR',
                    {
                      minimumFractionDigits: 2
                    }
                  )
                }
              </Text>

            </View>

          </View>

        </View>

        {/* PERFIL */}
        <View style={styles.insightCard}>

          <View style={styles.insightHeader}>

            <MaterialCommunityIcons
              name="lightbulb-outline"
              size={20}
              color="#F1C40F"
            />

            <Text style={styles.insightTitle}>
              Perfil Financeiro
            </Text>

          </View>

          <Text style={styles.insightDescription}>
            Perfil atual:{' '}
            <Text style={{ fontWeight: 'bold' }}>
              {profile?.risk_profile || 'Moderado'}
            </Text>
          </Text>

        </View>

        {/*
          FUTURO: GASTOS POR CATEGORIA

          Este bloco será utilizado posteriormente para exibir
          gráficos de distribuição de gastos por categoria.

          A implementação futura deverá consumir os dados consolidados
          da aba Categorias e/ou das transações categorizadas.

          Exemplo previsto:
          - Moradia
          - Alimentação
          - Transporte
          - Saúde
          - Outros
        */}

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
            Dados econômicos simulados via API FinanceIQ para apoiar a análise financeira do usuário.
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
              subtitle="Cotação simulada"
            />

          </View>

          <Text style={styles.indicatorsSource}>
            Fonte: API FinanceIQ • Open Finance Mock + Indicadores Econômicos
          </Text>

        </View>

        {/*
          FUTURO: EVOLUÇÃO MENSAL

          Este bloco poderá retornar futuramente para exibir
          comparação mensal de entradas, saídas e saldo.

          Nesta etapa, o espaço equivalente foi utilizado para
          Indicadores Econômicos, pois a API já está funcional.
        */}

        {/*
          FUTURO: METAS EM DESTAQUE

          Este bloco será implementado quando o módulo de metas
          financeiras estiver disponível.

          Estrutura prevista:
          - Nome da meta
          - Valor atual
          - Valor-alvo
          - Barra de progresso
          - Prazo estimado
        */}

        {/*
          FUTURO: SUGESTÃO INTELIGENTE

          Este bloco será implementado futuramente com base em:
          - regras financeiras simples;
          - análise das categorias;
          - perfil de risco;
          - possível IA ou motor de recomendações.
        */}

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

                      R$ {
                        item.amount.toLocaleString(
                          'pt-BR',
                          {
                            minimumFractionDigits: 2
                          }
                        )
                      }

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
    marginBottom: 20
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

  insightCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    padding: 20,
    borderLeftWidth: 5,
    borderLeftColor: '#27AE60',
    marginBottom: 20
  },

  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },

  insightTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B365D',
    marginLeft: 8
  },

  insightDescription: {
    fontSize: 14,
    color: '#2C3E50'
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
    alignItems: 'center'
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
  }

});