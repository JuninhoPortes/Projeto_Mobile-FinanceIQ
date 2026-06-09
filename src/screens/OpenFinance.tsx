import React, {
  useCallback,
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
  Alert
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useFocusEffect } from '@react-navigation/native';

import { auth } from '../../firebaseConfig';

import {
  openFinanceService,
  OpenFinanceBalance,
  OpenFinanceTransaction
} from '../services/openFinanceService';

import {
  transactionService,
  Transaction
} from '../database/transactionService';

import {
  openFinanceConsentService,
  OpenFinancePermissions
} from '../database/openFinanceConsentService';

interface BankOption {
  id: string;
  name: string;
  accountId: string;
  accountType: string;
  balance: number;
  lastSync: string;
  color: string;
  icon: any;
  connected: boolean;
}

interface PermissionOption {
  id: 'balance' | 'transactions' | 'personalData';
  label: string;
  description: string;
  granted: boolean;
}

const INITIAL_BANKS: BankOption[] = [
  {
    id: 'nubank',
    name: 'Nubank',
    accountId: 'acc_nubank_mock',
    accountType: 'Conta Digital',
    balance: 0,
    lastSync: 'Não sincronizado',
    color: '#8A05BE',
    icon: 'cards-heart',
    connected: false
  },
  {
    id: 'itau',
    name: 'Itaú',
    accountId: 'acc_itau_mock',
    accountType: 'Conta Corrente',
    balance: 0,
    lastSync: 'Não sincronizado',
    color: '#FF7A33',
    icon: 'bank',
    connected: false
  },
  {
    id: 'bradesco',
    name: 'Bradesco',
    accountId: 'acc_bradesco_mock',
    accountType: 'Conta Corrente',
    balance: 0,
    lastSync: 'Não sincronizado',
    color: '#D9364B',
    icon: 'bank-outline',
    connected: false
  },
  {
    id: 'c6',
    name: 'C6 Bank',
    accountId: 'acc_c6_mock',
    accountType: 'Conta Digital',
    balance: 0,
    lastSync: 'Não sincronizado',
    color: '#3B3542',
    icon: 'credit-card-outline',
    connected: false
  }
];

const INITIAL_PERMISSIONS: PermissionOption[] = [
  {
    id: 'balance',
    label: 'Leitura de saldo',
    description:
      'Permite que o FinanceIQ visualize saldos simulados das instituições conectadas.',
    granted: false
  },
  {
    id: 'transactions',
    label: 'Histórico de transações',
    description:
      'Permite que o FinanceIQ visualize transações simuladas das instituições conectadas.',
    granted: false
  },
  {
    id: 'personalData',
    label: 'Dados cadastrais',
    description:
      'Permite que o FinanceIQ acesse dados cadastrais simulados vinculados à conta.',
    granted: false
  }
];

export default function OpenFinance({
  navigation
}: any) {

  const [balances, setBalances] =
    useState<OpenFinanceBalance[]>([]);

  const [transactions, setTransactions] =
    useState<OpenFinanceTransaction[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [banks, setBanks] =
    useState<BankOption[]>(INITIAL_BANKS);

  const [permissions, setPermissions] =
    useState<PermissionOption[]>(INITIAL_PERMISSIONS);

  const user = auth.currentUser;

  // =========================
  // CONVERTER PERMISSÕES
  // =========================
  const getPermissionsObject = (
    permissionList: PermissionOption[]
  ): OpenFinancePermissions => {

    return {
      balance:
        permissionList.find(
          item => item.id === 'balance'
        )?.granted || false,

      transactions:
        permissionList.find(
          item => item.id === 'transactions'
        )?.granted || false,

      personalData:
        permissionList.find(
          item => item.id === 'personalData'
        )?.granted || false
    };

  };

  // =========================
  // APLICAR SALDOS DA API NOS BANCOS
  // =========================
  const applyApiBalancesToBanks = (
    bankList: BankOption[],
    apiBalances: OpenFinanceBalance[]
  ): BankOption[] => {

    return bankList.map((bank) => {

      const apiBalance =
        apiBalances.find(
          item => item.accountId === bank.accountId
        );

      if (!apiBalance) {
        return bank;
      }

      return {
        ...bank,
        balance: apiBalance.balance
      };

    });

  };

  // =========================
  // CARREGAR DADOS DA API
  // =========================
  const loadApiData = async (): Promise<{
    balancesData: OpenFinanceBalance[];
    transactionsData: OpenFinanceTransaction[];
  }> => {

    if (!user?.uid) {

      Alert.alert(
        'Erro',
        'Usuário não autenticado.'
      );

      return {
        balancesData: [],
        transactionsData: []
      };
    }

    try {

      const [
        balancesData,
        transactionsData
      ] = await Promise.all([
        openFinanceService.getBalances(user.uid),
        openFinanceService.getTransactions(user.uid)
      ]);

      setBalances(balancesData);

      setTransactions(transactionsData);

      return {
        balancesData,
        transactionsData
      };

    } catch (error) {

      console.error(
        'Erro ao consumir API Open Finance:',
        error
      );

      Alert.alert(
        'Erro de conexão',
        'Não foi possível carregar os dados do Open Finance Mock. Verifique se o backend está rodando e se o endereço em src/services/api.ts está correto.'
      );

      return {
        balancesData: [],
        transactionsData: []
      };

    }

  };

  // =========================
  // CARREGAR CONSENTIMENTOS
  // =========================
  const loadConsents = async (
    apiBalances: OpenFinanceBalance[]
  ) => {

    if (!user?.uid) return;

    const consents =
      await openFinanceConsentService.listByUser(
        user.uid
      );

    const banksWithApiBalances =
      applyApiBalancesToBanks(
        INITIAL_BANKS,
        apiBalances
      );

    const updatedBanks =
      banksWithApiBalances.map((bank) => {

        const consent =
          consents.find(
            item =>
              item.bank_id === bank.id &&
              item.connected === true
          );

        if (!consent) {
          return {
            ...bank,
            connected: false,
            lastSync: 'Não sincronizado'
          };
        }

        return {
          ...bank,
          connected: true,
          lastSync:
            consent.last_sync
              ? 'Sincronizado'
              : 'Agora'
        };

      });

    setBanks(updatedBanks);

    const connectedConsent =
      consents.find(
        item => item.connected === true
      );

    if (connectedConsent?.permissions) {

      setPermissions((prevPermissions) =>
        prevPermissions.map((permission) => ({
          ...permission,
          granted:
            connectedConsent.permissions[
              permission.id
            ] || false
        }))
      );

    } else {

      setPermissions(INITIAL_PERMISSIONS);

    }

  };

  // =========================
  // CARREGAR TELA
  // =========================
  const loadScreenData = async () => {

    try {

      setLoading(true);

      const {
        balancesData
      } = await loadApiData();

      await loadConsents(
        balancesData
      );

    } catch (error) {

      console.error(
        'Erro ao carregar Open Finance:',
        error
      );

    } finally {

      setLoading(false);

    }

  };

  // =========================
  // ATUALIZAR AO ENTRAR NA TELA
  // =========================
  useFocusEffect(
    useCallback(() => {
      loadScreenData();
    }, [])
  );

  // =========================
  // SALVAR PERMISSÕES NOS BANCOS CONECTADOS
  // =========================
  const syncPermissionsWithConnectedBanks = async (
    updatedPermissions: PermissionOption[],
    updatedBanks: BankOption[]
  ) => {

    if (!user?.uid) return;

    const permissionsObject =
      getPermissionsObject(updatedPermissions);

    const connectedBanks =
      updatedBanks.filter(
        bank => bank.connected
      );

    for (const bank of connectedBanks) {

      await openFinanceConsentService.updatePermissions(
        user.uid,
        bank.id,
        permissionsObject
      );

    }

  };

  // =========================
  // SOLICITAR AUTORIZAÇÃO DO BANCO
  // =========================
  const handleToggleBank = (
    selectedBank: BankOption
  ) => {

    if (!user?.uid) {

      Alert.alert(
        'Erro',
        'Usuário não autenticado.'
      );

      return;
    }

    if (selectedBank.connected) {

      Alert.alert(
        'Desconectar instituição',
        `Deseja remover a autorização simulada do ${selectedBank.name}? As transações importadas deste banco também serão removidas dos seus lançamentos, fazendo a Dashboard voltar ao valor anterior.`,
        [
          {
            text: 'Cancelar',
            style: 'cancel'
          },
          {
            text: 'Desconectar',
            style: 'destructive',
            onPress: async () => {

              try {

                setLoading(true);

                await openFinanceConsentService
                  .removeBankConsent(
                    user.uid,
                    selectedBank.id
                  );

                const removeResult =
                  await transactionService
                    .removeOpenFinanceTransactionsByBank(
                      user.uid,
                      selectedBank.accountId
                    );

                const updatedBanks =
                  banks.map((bank) =>
                    bank.id === selectedBank.id
                      ? {
                          ...bank,
                          connected: false,
                          lastSync: 'Não sincronizado'
                        }
                      : bank
                  );

                setBanks(updatedBanks);

                const stillHasConnectedBank =
                  updatedBanks.some(
                    bank => bank.connected
                  );

                if (!stillHasConnectedBank) {
                  setPermissions(INITIAL_PERMISSIONS);
                }

                Alert.alert(
                  'Banco desconectado',
                  `${selectedBank.name} foi desconectado.\n${removeResult.removedCount} transação(ões) importada(s) foram removida(s).`
                );

              } catch (error) {

                console.error(
                  'Erro ao desconectar banco:',
                  error
                );

                Alert.alert(
                  'Erro',
                  'Não foi possível desconectar o banco e remover os dados importados.'
                );

              } finally {

                setLoading(false);

              }

            }
          }
        ]
      );

      return;
    }

    Alert.alert(
      `Autorizar ${selectedBank.name}`,
      `Deseja permitir que o FinanceIQ acesse dados simulados do ${selectedBank.name} por meio do Open Finance Mock?`,
      [
        {
          text: 'Negar',
          style: 'cancel'
        },
        {
          text: 'Autorizar',
          onPress: async () => {

            try {

              setLoading(true);

              const updatedBanks =
                banks.map((bank) =>
                  bank.id === selectedBank.id
                    ? {
                        ...bank,
                        connected: true,
                        lastSync: 'Agora'
                      }
                    : bank
                );

              const permissionsObject =
                getPermissionsObject(permissions);

              await openFinanceConsentService
                .saveBankConsent({
                  user_id: user.uid,
                  bank_id: selectedBank.id,
                  bank_name: selectedBank.name,
                  account_id: selectedBank.accountId,
                  account_type: selectedBank.accountType,
                  connected: true,
                  permissions: permissionsObject
                });

              setBanks(updatedBanks);

            } catch (error) {

              console.error(
                'Erro ao autorizar banco:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível salvar a autorização do banco.'
              );

            } finally {

              setLoading(false);

            }

          }
        }
      ]
    );

  };

  // =========================
  // SOLICITAR PERMISSÃO
  // =========================
  const handleTogglePermission = (
    selectedPermission: PermissionOption
  ) => {

    const connectedBanks =
      banks.filter(
        bank => bank.connected
      );

    if (connectedBanks.length === 0) {

      Alert.alert(
        'Nenhum banco conectado',
        'Autorize pelo menos uma instituição antes de conceder permissões.'
      );

      return;
    }

    if (selectedPermission.granted) {

      Alert.alert(
        'Revogar permissão',
        `Deseja revogar a permissão de ${selectedPermission.label.toLowerCase()}?`,
        [
          {
            text: 'Cancelar',
            style: 'cancel'
          },
          {
            text: 'Revogar',
            style: 'destructive',
            onPress: async () => {

              try {

                const updatedPermissions =
                  permissions.map((permission) =>
                    permission.id === selectedPermission.id
                      ? {
                          ...permission,
                          granted: false
                        }
                      : permission
                  );

                setPermissions(updatedPermissions);

                await syncPermissionsWithConnectedBanks(
                  updatedPermissions,
                  banks
                );

              } catch (error) {

                console.error(
                  'Erro ao revogar permissão:',
                  error
                );

                Alert.alert(
                  'Erro',
                  'Não foi possível revogar a permissão.'
                );

              }

            }
          }
        ]
      );

      return;
    }

    Alert.alert(
      'Conceder permissão',
      selectedPermission.description,
      [
        {
          text: 'Negar',
          style: 'cancel'
        },
        {
          text: 'Permitir',
          onPress: async () => {

            try {

              const updatedPermissions =
                permissions.map((permission) =>
                  permission.id === selectedPermission.id
                    ? {
                        ...permission,
                        granted: true
                      }
                    : permission
                );

              setPermissions(updatedPermissions);

              await syncPermissionsWithConnectedBanks(
                updatedPermissions,
                banks
              );

            } catch (error) {

              console.error(
                'Erro ao conceder permissão:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível salvar a permissão.'
              );

            }

          }
        }
      ]
    );

  };

  // =========================
  // ABRIR DETALHES DO BANCO
  // =========================
  const handleOpenBankDetails = (
    bank: BankOption
  ) => {

    if (!bank.connected) {

      Alert.alert(
        'Instituição não autorizada',
        `Para visualizar os dados do ${bank.name}, autorize primeiro a integração pelo botão ao lado da instituição.`
      );

      return;
    }

    const bankTransactions =
      transactions.filter(
        item => item.accountId === bank.accountId
      );

    navigation.navigate(
      'OpenFinanceBankDetails',
      {
        bankName: bank.name,
        accountId: bank.accountId,
        accountType: bank.accountType,
        balance: bank.balance,
        currency: 'BRL',
        connected: bank.connected,
        lastSync: bank.lastSync,
        transactions: bankTransactions,
        permissions: getPermissionsObject(permissions)
      }
    );

  };

  // =========================
  // SINCRONIZAÇÃO + IMPORTAÇÃO FIRESTORE
  // =========================
  const handleSync = async () => {

    const connectedBanks =
      banks.filter(
        bank => bank.connected
      );

    const connectedAccountIds =
      connectedBanks.map(
        bank => bank.accountId
      );

    const canReadTransactions =
      permissions.find(
        item => item.id === 'transactions'
      )?.granted || false;

    if (connectedBanks.length === 0) {

      Alert.alert(
        'Nenhum banco conectado',
        'Autorize pelo menos uma instituição antes de sincronizar os dados.'
      );

      return;
    }

    if (!canReadTransactions) {

      Alert.alert(
        'Permissão necessária',
        'Para importar dados do Open Finance Mock, conceda a permissão de Histórico de transações.'
      );

      return;
    }

    if (!user?.uid) {

      Alert.alert(
        'Erro',
        'Usuário não autenticado.'
      );

      return;
    }

    Alert.alert(
      'Importar transações',
      'Deseja importar as transações simuladas dos bancos autorizados para seus lançamentos financeiros? As transações já importadas não serão duplicadas.',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Importar',
          onPress: async () => {

            try {

              setLoading(true);

              const result =
                await openFinanceService.syncTransactions(
                  user.uid
                );

              const apiTransactions: OpenFinanceTransaction[] =
                result?.transactions?.length > 0
                  ? result.transactions
                  : transactions;

              const authorizedTransactions =
                apiTransactions.filter(
                  item =>
                    connectedAccountIds.includes(
                      item.accountId
                    )
                );

              const transactionsToImport: Transaction[] =
                authorizedTransactions.map(
                  (item: OpenFinanceTransaction) => ({
                    description: item.description,
                    amount: item.amount,
                    type: item.type,
                    category: item.category,

                    external_id: item.id,
                    source: 'open_finance_mock',
                    bank_name: item.bankName,
                    account_id: item.accountId,
                    original_date: item.date,
                    is_fixed: false
                  })
                );

              const importResult =
                await transactionService
                  .importFromOpenFinance(
                    user.uid,
                    transactionsToImport
                  );

              for (const bank of connectedBanks) {

                await openFinanceConsentService
                  .updateLastSync(
                    user.uid,
                    bank.id
                  );

              }

              const updatedBanks =
                banks.map((bank) =>
                  bank.connected
                    ? {
                        ...bank,
                        lastSync: 'Agora'
                      }
                    : bank
                );

              setBanks(updatedBanks);

              Alert.alert(
                'Sincronização concluída',
                `${importResult.importedCount} transação(ões) importada(s).\n${importResult.skippedCount} transação(ões) ignorada(s) por já existirem ou por dados inválidos.`
              );

              loadScreenData();

            } catch (error) {

              console.error(
                'Erro ao importar transações:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível importar as transações para o Firestore.'
              );

            } finally {

              setLoading(false);

            }

          }
        }
      ]
    );

  };

  const connectedBanks =
    banks.filter(
      bank => bank.connected
    );

  const totalConnectedBalance =
    connectedBanks.reduce(
      (acc, bank) => acc + bank.balance,
      0
    );

  return (

    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >

          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color="#1B365D"
          />

        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Open Finance
        </Text>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={loadScreenData}
        >

          <MaterialCommunityIcons
            name="refresh"
            size={22}
            color="#1B365D"
          />

        </TouchableOpacity>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {loading && (

          <View style={styles.loadingBox}>

            <ActivityIndicator
              size="large"
              color="#1B365D"
            />

            <Text style={styles.loadingText}>
              Carregando dados do Open Finance...
            </Text>

          </View>

        )}

        {/* CARD INFORMATIVO */}
        <View style={styles.infoCard}>

          <View style={styles.infoIconBox}>

            <MaterialCommunityIcons
              name="link-variant"
              size={34}
              color="#9B8BB4"
            />

          </View>

          <View style={{ flex: 1 }}>

            <Text style={styles.infoTitle}>
              Conecte seus Bancos
            </Text>

            <Text style={styles.infoDescription}>
              Suas credenciais são protegidas pelo padrão Open Finance. Nesta versão, a integração é simulada para fins acadêmicos.
            </Text>

          </View>

        </View>

        {/* RESUMO */}
        <View style={styles.summaryCard}>

          <Text style={styles.summaryLabel}>
            Saldo autorizado simulado
          </Text>

          <Text style={styles.summaryValue}>
            R$ {
              totalConnectedBalance.toLocaleString(
                'pt-BR',
                {
                  minimumFractionDigits: 2
                }
              )
            }
          </Text>

          <Text style={styles.summaryDescription}>
            {connectedBanks.length === 0
              ? 'Nenhuma instituição autorizada.'
              : `${connectedBanks.length} instituição(ões) autorizada(s).`}
          </Text>

        </View>

        {/* BANCOS */}
        <Text style={styles.sectionTitle}>
          Instituições Disponíveis
        </Text>

        {banks.map((bank) => (

          <TouchableOpacity
            key={bank.id}
            style={styles.bankCard}
            activeOpacity={0.85}
            onPress={() =>
              handleOpenBankDetails(bank)
            }
          >

            <View
              style={[
                styles.bankIconCircle,
                {
                  backgroundColor: bank.color
                }
              ]}
            >

              <MaterialCommunityIcons
                name={bank.icon}
                size={28}
                color="#FFF"
              />

            </View>

            <View style={styles.bankInfo}>

              <Text style={styles.bankName}>
                {bank.name}
              </Text>

              <Text style={styles.bankSubtitle}>
                {bank.connected
                  ? `Saldo: R$ ${bank.balance.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2
                    })} · Sync ${bank.lastSync}`
                  : 'Não conectado'}
              </Text>

            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                handleToggleBank(bank)
              }
              style={[
                styles.switchTrack,
                {
                  backgroundColor:
                    bank.connected
                      ? '#27AE60'
                      : '#DDE5ED'
                }
              ]}
            >

              <View
                style={[
                  styles.switchThumb,
                  {
                    alignSelf:
                      bank.connected
                        ? 'flex-end'
                        : 'flex-start',
                    backgroundColor:
                      bank.connected
                        ? '#009688'
                        : '#95A5A6'
                  }
                ]}
              />

            </TouchableOpacity>

          </TouchableOpacity>

        ))}

        {/* PERMISSÕES */}
        <Text style={styles.sectionTitle}>
          Permissões
        </Text>

        <View style={styles.permissionsCard}>

          {permissions.map((permission, index) => (

            <View
              key={permission.id}
              style={[
                styles.permissionItem,
                index === permissions.length - 1 && {
                  borderBottomWidth: 0
                }
              ]}
            >

              <View style={{ flex: 1 }}>

                <Text style={styles.permissionLabel}>
                  {permission.label}
                </Text>

                <Text style={styles.permissionStatus}>
                  {permission.granted
                    ? 'Permissão concedida'
                    : 'Permissão não concedida'}
                </Text>

              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  handleTogglePermission(permission)
                }
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor:
                      permission.granted
                        ? '#27AE60'
                        : '#DDE5ED'
                  }
                ]}
              >

                <View
                  style={[
                    styles.switchThumb,
                    {
                      alignSelf:
                        permission.granted
                          ? 'flex-end'
                          : 'flex-start',
                      backgroundColor:
                        permission.granted
                          ? '#009688'
                          : '#95A5A6'
                    }
                  ]}
                />

              </TouchableOpacity>

            </View>

          ))}

        </View>

        {/* BOTÃO SINCRONIZAR */}
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSync}
        >

          <MaterialCommunityIcons
            name="cloud-sync-outline"
            size={20}
            color="#FFF"
          />

          <Text style={styles.syncButtonText}>
            Sincronizar dados autorizados
          </Text>

        </TouchableOpacity>

        {/* AVISO */}
        <View style={styles.noticeCard}>

          <MaterialCommunityIcons
            name="information-outline"
            size={22}
            color="#1B365D"
          />

          <Text style={styles.noticeText}>
            Esta tela representa uma simulação acadêmica inspirada no Open Finance. Nenhum dado bancário real é coletado ou compartilhado automaticamente.
          </Text>

        </View>

      </ScrollView>

    </SafeAreaView>

  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F7FB'
  },

  header: {
    backgroundColor: '#FFF',
    height: 70,
    paddingHorizontal: 18,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5'
  },

  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },

  headerTitle: {
    color: '#1B365D',
    fontSize: 20,
    fontWeight: 'bold'
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 100
  },

  loadingBox: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20
  },

  loadingText: {
    marginTop: 10,
    color: '#1B365D',
    fontWeight: '600'
  },

  infoCard: {
    backgroundColor: '#EAF6FD',
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },

  infoIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F3EAF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },

  infoTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 5
  },

  infoDescription: {
    fontSize: 13,
    color: '#607D94',
    lineHeight: 20
  },

  summaryCard: {
    backgroundColor: '#1B365D',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20
  },

  summaryLabel: {
    color: '#BDC3C7',
    fontSize: 13
  },

  summaryValue: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 6
  },

  summaryDescription: {
    color: '#DDE5ED',
    fontSize: 12,
    marginTop: 6
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 14,
    marginTop: 4
  },

  bankCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },

  bankIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },

  bankInfo: {
    flex: 1
  },

  bankName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  bankSubtitle: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 3
  },

  switchTrack: {
    width: 52,
    height: 28,
    borderRadius: 20,
    padding: 3,
    justifyContent: 'center'
  },

  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11
  },

  permissionsCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    marginBottom: 20
  },

  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5'
  },

  permissionLabel: {
    fontSize: 15,
    color: '#1B365D',
    fontWeight: '600'
  },

  permissionStatus: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 3
  },

  syncButton: {
    backgroundColor: '#27AE60',
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 18
  },

  syncButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8
  },

  noticeCard: {
    backgroundColor: '#EAF3FB',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },

  noticeText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#2C3E50',
    lineHeight: 19
  }

});