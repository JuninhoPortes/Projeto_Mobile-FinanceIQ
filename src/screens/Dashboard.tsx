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
  TouchableOpacity
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

export default function Dashboard() {

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const user = auth.currentUser;

  // =========================
  // CARREGAR DADOS
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
  // ATUALIZA AO VOLTAR PRA TELA
  // =========================
  useFocusEffect(
    useCallback(() => {
      loadData();
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