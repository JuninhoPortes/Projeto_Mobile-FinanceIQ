import React from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { auth } from '../../firebaseConfig';

interface BankTransaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'outcome';
  category: string;
  date: string;
  source: string;
}

export default function OpenFinanceBankDetails({
  navigation,
  route
}: any) {

  const user = auth.currentUser;

  const {
    bankName = 'Banco Simulado',
    accountId = 'acc_mock_001',
    accountType = 'Conta Corrente',
    balance = 0,
    currency = 'BRL',
    connected = true,
    lastSync = 'Agora',
    transactions = [],
    permissions = {
      balance: false,
      transactions: false,
      personalData: false
    }
  } = route.params || {};

  const userName =
    user?.displayName || 'Usuário FinanceIQ';

  const userEmail =
    user?.email || 'E-mail não informado';

  const formattedBalance =
    Number(balance || 0).toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits: 2
      }
    );

  const getBankIcon = () => {

    const name =
      bankName.toLowerCase();

    if (name.includes('nubank')) {
      return 'cards-heart';
    }

    if (name.includes('itaú') || name.includes('itau')) {
      return 'bank';
    }

    if (name.includes('bradesco')) {
      return 'bank-outline';
    }

    if (name.includes('c6')) {
      return 'credit-card-outline';
    }

    return 'bank';
  };

  const getTransactionIcon = (
    type: 'income' | 'outcome'
  ) => {

    return type === 'income'
      ? 'cash-plus'
      : 'cash-minus';

  };

  const allowedTransactions =
    permissions.transactions
      ? transactions
      : [];

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
          Detalhes da Conta
        </Text>

        <View style={styles.headerButton} />

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* CARD PRINCIPAL */}
        <View style={styles.mainCard}>

          <View style={styles.bankHeader}>

            <View style={styles.bankIconBox}>

              <MaterialCommunityIcons
                name={getBankIcon() as any}
                size={34}
                color="#1B365D"
              />

            </View>

            <View style={{ flex: 1 }}>

              <Text style={styles.bankName}>
                {bankName}
              </Text>

              <Text style={styles.bankSubtitle}>
                {accountType} • {currency}
              </Text>

            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    connected
                      ? '#E8F5E9'
                      : '#F4F6F8'
                }
              ]}
            >

              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      connected
                        ? '#27AE60'
                        : '#95A5A6'
                  }
                ]}
              >
                {connected
                  ? 'Conectado'
                  : 'Desconectado'}
              </Text>

            </View>

          </View>

          <Text style={styles.balanceLabel}>
            Saldo sincronizado
          </Text>

          <Text style={styles.balanceValue}>
            {permissions.balance
              ? `R$ ${formattedBalance}`
              : 'Permissão necessária'}
          </Text>

          <Text style={styles.syncText}>
            Última sincronização: {lastSync}
          </Text>

        </View>

        {/* USUÁRIO VINCULADO */}
        <View style={styles.userCard}>

          <View style={styles.userIconBox}>

            <MaterialCommunityIcons
              name="account-check-outline"
              size={26}
              color="#1B365D"
            />

          </View>

          <View style={{ flex: 1 }}>

            <Text style={styles.userCardTitle}>
              Usuário FinanceIQ vinculado
            </Text>

            <Text style={styles.userCardName}>
              {userName}
            </Text>

            <Text style={styles.userCardEmail}>
              {userEmail}
            </Text>

          </View>

        </View>

        {/* INFORMAÇÕES DA CONTA */}
        <View style={styles.whiteCard}>

          <Text style={styles.cardTitle}>
            Informações da Conta Simulada
          </Text>

          <InfoRow
            icon="identifier"
            label="ID da Conta"
            value={accountId}
          />

          <InfoRow
            icon="bank-outline"
            label="Instituição"
            value={bankName}
          />

          <InfoRow
            icon="wallet-outline"
            label="Tipo"
            value={accountType}
          />

          <InfoRow
            icon="shield-check-outline"
            label="Origem"
            value="Open Finance Mock"
            isLast
          />

        </View>

        {/* PERMISSÕES */}
        <View style={styles.whiteCard}>

          <Text style={styles.cardTitle}>
            Permissões Concedidas
          </Text>

          <PermissionRow
            label="Leitura de saldo"
            granted={permissions.balance}
          />

          <PermissionRow
            label="Histórico de transações"
            granted={permissions.transactions}
          />

          <PermissionRow
            label="Dados cadastrais"
            granted={permissions.personalData}
            isLast
          />

        </View>

        {/* RESUMO DE SEGURANÇA */}
        <View style={styles.securityCard}>

          <View style={styles.securityIconBox}>

            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={28}
              color="#27AE60"
            />

          </View>

          <View style={{ flex: 1 }}>

            <Text style={styles.securityTitle}>
              Ambiente simulado seguro
            </Text>

            <Text style={styles.securityText}>
              A identificação exibida pertence ao usuário autenticado no FinanceIQ. Os dados bancários apresentados são simulados pela API Open Finance Mock.
            </Text>

          </View>

        </View>

        {/* TRANSAÇÕES */}
        <View style={styles.whiteCard}>

          <View style={styles.sectionHeader}>

            <Text style={styles.cardTitle}>
              Transações Simuladas
            </Text>

            <Text style={styles.countText}>
              {allowedTransactions.length} registros
            </Text>

          </View>

          {!permissions.transactions ? (

            <Text style={styles.emptyText}>
              A permissão de histórico de transações não foi concedida.
            </Text>

          ) : allowedTransactions.length === 0 ? (

            <Text style={styles.emptyText}>
              Nenhuma transação simulada retornada para esta instituição.
            </Text>

          ) : (

            allowedTransactions.map(
              (item: BankTransaction) => (

                <View
                  key={item.id}
                  style={styles.transactionItem}
                >

                  <View style={styles.transactionLeft}>

                    <View style={styles.transactionIconBox}>

                      <MaterialCommunityIcons
                        name={
                          getTransactionIcon(
                            item.type
                          ) as any
                        }
                        size={22}
                        color="#1B365D"
                      />

                    </View>

                    <View style={{ flex: 1 }}>

                      <Text style={styles.transactionTitle}>
                        {item.description}
                      </Text>

                      <Text style={styles.transactionSubtitle}>
                        {item.category} • {item.date}
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

              )
            )
          )}

        </View>

        {/* DADOS CADASTRAIS SIMULADOS */}
        <View style={styles.whiteCard}>

          <Text style={styles.cardTitle}>
            Dados Cadastrais Simulados
          </Text>

          {permissions.personalData ? (

            <>
              <InfoRow
                icon="account-outline"
                label="Usuário vinculado"
                value={userName}
              />

              <InfoRow
                icon="email-outline"
                label="E-mail no app"
                value={userEmail}
              />

              <InfoRow
                icon="card-account-details-outline"
                label="Tipo de vínculo"
                value="Pessoa Física"
              />

              <InfoRow
                icon="calendar-check-outline"
                label="Status"
                value="Consentimento simulado ativo"
                isLast
              />
            </>

          ) : (

            <Text style={styles.emptyText}>
              A permissão de dados cadastrais não foi concedida.
            </Text>

          )}

        </View>

        {/* AVISO */}
        <View style={styles.noticeCard}>

          <MaterialCommunityIcons
            name="information-outline"
            size={22}
            color="#1B365D"
          />

          <Text style={styles.noticeText}>
            Os dados apresentados nesta tela são simulados para fins acadêmicos. A integração representa um mock inspirado no Open Finance, sem conexão real com instituições bancárias.
          </Text>

        </View>

      </ScrollView>

    </SafeAreaView>

  );
}

// =========================
// COMPONENTE INFO
// =========================
const InfoRow = ({
  icon,
  label,
  value,
  isLast
}: any) => (

  <View
    style={[
      styles.infoRow,
      isLast && {
        borderBottomWidth: 0
      }
    ]}
  >

    <View style={styles.infoLeft}>

      <MaterialCommunityIcons
        name={icon}
        size={20}
        color="#1B365D"
      />

      <Text style={styles.infoLabel}>
        {label}
      </Text>

    </View>

    <Text style={styles.infoValue}>
      {value}
    </Text>

  </View>
);

// =========================
// COMPONENTE PERMISSÃO
// =========================
const PermissionRow = ({
  label,
  granted,
  isLast
}: any) => (

  <View
    style={[
      styles.permissionRow,
      isLast && {
        borderBottomWidth: 0
      }
    ]}
  >

    <Text style={styles.permissionLabel}>
      {label}
    </Text>

    <View
      style={[
        styles.permissionBadge,
        {
          backgroundColor:
            granted
              ? '#E8F5E9'
              : '#F4F6F8'
        }
      ]}
    >

      <MaterialCommunityIcons
        name={
          granted
            ? 'check-circle-outline'
            : 'close-circle-outline'
        }
        size={16}
        color={
          granted
            ? '#27AE60'
            : '#95A5A6'
        }
      />

      <Text
        style={[
          styles.permissionText,
          {
            color:
              granted
                ? '#27AE60'
                : '#95A5A6'
          }
        ]}
      >
        {granted
          ? 'Autorizado'
          : 'Negado'}
      </Text>

    </View>

  </View>
);

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F0F4F8'
  },

  header: {
    backgroundColor: '#FFF',
    height: 70,
    paddingTop: 10,
    paddingHorizontal: 18,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 100
  },

  mainCard: {
    backgroundColor: '#1B365D',
    borderRadius: 24,
    padding: 22,
    marginBottom: 20
  },

  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25
  },

  bankIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },

  bankName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF'
  },

  bankSubtitle: {
    fontSize: 13,
    color: '#DDE5ED',
    marginTop: 3
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20
  },

  statusText: {
    fontSize: 11,
    fontWeight: 'bold'
  },

  balanceLabel: {
    color: '#BDC3C7',
    fontSize: 13
  },

  balanceValue: {
    color: '#FFF',
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 6
  },

  syncText: {
    color: '#DDE5ED',
    fontSize: 12,
    marginTop: 8
  },

  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center'
  },

  userIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0F4F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },

  userCardTitle: {
    fontSize: 13,
    color: '#95A5A6',
    marginBottom: 3
  },

  userCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  userCardEmail: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 2
  },

  whiteCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 18
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 16
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    paddingVertical: 13
  },

  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },

  infoLabel: {
    fontSize: 14,
    color: '#2C3E50',
    marginLeft: 8,
    fontWeight: '600'
  },

  infoValue: {
    fontSize: 13,
    color: '#95A5A6',
    maxWidth: '48%',
    textAlign: 'right'
  },

  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    paddingVertical: 13
  },

  permissionLabel: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '600'
  },

  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20
  },

  permissionText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5
  },

  securityCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    borderLeftWidth: 5,
    borderLeftColor: '#27AE60'
  },

  securityIconBox: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13
  },

  securityTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 5
  },

  securityText: {
    fontSize: 13,
    color: '#2C3E50',
    lineHeight: 19
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },

  countText: {
    fontSize: 12,
    color: '#95A5A6',
    marginBottom: 16
  },

  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },

  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },

  transactionIconBox: {
    width: 42,
    height: 42,
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

  transactionSubtitle: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 2
  },

  transactionValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8
  },

  emptyText: {
    color: '#95A5A6',
    textAlign: 'center',
    marginVertical: 15,
    lineHeight: 20
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