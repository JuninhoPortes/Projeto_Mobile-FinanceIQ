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
  Switch,
  Alert
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { signOut } from 'firebase/auth';

import { useFocusEffect } from '@react-navigation/native';

import { auth } from '../../firebaseConfig';

import {
  userProfileService,
  UserProfile
} from '../database/userProfileService';

import {
  transactionService,
  Transaction
} from '../database/transactionService';

export default function Perfil({ navigation }: any) {

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [salaryTransaction, setSalaryTransaction] =
    useState<Transaction | null>(null);

  const user = auth.currentUser;

  // =========================
  // CARREGAR DADOS DO PERFIL
  // =========================
  const loadProfileData = async () => {

    if (!user?.uid) {
      setProfile(null);
      setSalaryTransaction(null);
      return;
    }

    try {

      const profileData =
        await userProfileService.getProfile(user.uid);

      const transactions =
        await transactionService.listAll(user.uid);

      const salarioMensal =
        transactions.find(
          item => item.description === 'Salário Mensal'
        ) || null;

      setProfile(profileData);

      setSalaryTransaction(salarioMensal);

    } catch (error) {

      console.error(
        'Erro ao carregar perfil:',
        error
      );

    }
  };

  // Atualiza sempre que voltar para a tela
  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [])
  );

  // =========================
  // LOGOUT
  // =========================
  const handleLogout = async () => {

    Alert.alert(
      'Sair da Conta',
      'Deseja realmente sair?',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },

        {
          text: 'Sair',
          style: 'destructive',

          onPress: async () => {

            try {

              setProfile(null);

              setSalaryTransaction(null);

              await signOut(auth);

              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'Login'
                  }
                ]
              });

            } catch (error) {

              console.error(
                'Erro ao deslogar:',
                error
              );

              Alert.alert(
                'Erro',
                'Não foi possível encerrar a sessão.'
              );

            }
          }
        }
      ]
    );
  };

  // =========================
  // INICIAIS
  // =========================
  const getInitials = (
    name: string | null
  ) => {

    if (!name) return 'U';

    const names =
      name.trim().split(/\s+/);

    if (names.length > 1) {

      const firstInitial =
        names[0][0];

      const lastInitial =
        names[names.length - 1][0];

      return `${firstInitial}${lastInitial}`
        .toUpperCase();

    }

    return names[0][0].toUpperCase();
  };

  const salarioMensal =
    salaryTransaction?.amount || 0;

  return (

    <SafeAreaView style={styles.container}>

      <View style={styles.header}>

        <Text style={styles.headerTitle}>
          Perfil
        </Text>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* CABEÇALHO DO PERFIL */}
        <View style={styles.profileHeader}>

          <View style={styles.avatarLarge}>

            <Text style={styles.avatarTextLarge}>
              {getInitials(
                user?.displayName || 'Usuário'
              )}
            </Text>

          </View>

          <Text style={styles.userName}>
            {user?.displayName || 'Usuário FinanceIQ'}
          </Text>

          <Text style={styles.userEmail}>
            {user?.email || 'email@exemplo.com'}
          </Text>

          <View style={styles.badgeModerado}>

            <Text style={styles.badgeText}>
              Perfil {profile?.risk_profile || 'Moderado'}
            </Text>

          </View>

        </View>

        {/* CONTA */}
        <Text style={styles.sectionTitle}>
          Conta
        </Text>

        <View style={styles.menuGroup}>

          <MenuItem
            icon="account-outline"
            title="Dados Pessoais"
            subtitle={`${user?.displayName || 'Usuário'} - ${user?.email || ''}`}
          />

          <MenuItem
            icon="cash-plus"
            title="Salário Mensal"
            subtitle={`R$ ${salarioMensal.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}`}
            isLast
          />

        </View>

        {/* CONFIGURAÇÕES */}
        <Text style={styles.sectionTitle}>
          Configurações
        </Text>

        <View style={styles.menuGroup}>

          <MenuItem
            icon="bank-outline"
            title="Open Finance"
            subtitle="Nenhum banco conectado"
          />

          <MenuItem
            icon="target"
            title="Perfil de Risco"
            subtitle={profile?.risk_profile || 'Moderado'}
            isLast
          />

        </View>

        {/* APARÊNCIA */}
        <Text style={styles.sectionTitle}>
          Aparência
        </Text>

        <View style={styles.menuGroup}>

          <MenuSwitch
            icon="weather-night"
            title="Modo Escuro"
            subtitle="Desativado"
            value={false}
          />

          <MenuSwitch
            icon="bell-outline"
            title="Notificações Push"
            value={true}
          />

          <MenuSwitch
            icon="email-outline"
            title="Notificações por E-mail"
            value={false}
            isLast
          />

        </View>

        {/* LOGOUT */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >

          <Text style={styles.logoutText}>
            Sair da Conta
          </Text>

        </TouchableOpacity>

        <Text style={styles.versionText}>
          FinanceIQ v1.0.0 • © 2026
        </Text>

      </ScrollView>

    </SafeAreaView>
  );
}

// =========================
// COMPONENTE MENU ITEM
// =========================
const MenuItem = ({
  icon,
  title,
  subtitle,
  isLast
}: any) => (

  <TouchableOpacity
    style={[
      styles.menuItem,
      isLast && {
        borderBottomWidth: 0
      }
    ]}
  >

    <View style={styles.menuIconBox}>

      <MaterialCommunityIcons
        name={icon}
        size={22}
        color="#555"
      />

    </View>

    <View style={{ flex: 1 }}>

      <Text style={styles.menuTitle}>
        {title}
      </Text>

      {subtitle && (
        <Text style={styles.menuSubtitle}>
          {subtitle}
        </Text>
      )}

    </View>

    <MaterialCommunityIcons
      name="chevron-right"
      size={20}
      color="#BDC3C7"
    />

  </TouchableOpacity>
);

// =========================
// COMPONENTE SWITCH
// =========================
const MenuSwitch = ({
  icon,
  title,
  subtitle,
  value,
  isLast
}: any) => (

  <View
    style={[
      styles.menuItem,
      isLast && {
        borderBottomWidth: 0
      }
    ]}
  >

    <View style={styles.menuIconBox}>

      <MaterialCommunityIcons
        name={icon}
        size={22}
        color="#555"
      />

    </View>

    <View style={{ flex: 1 }}>

      <Text style={styles.menuTitle}>
        {title}
      </Text>

      {subtitle && (
        <Text style={styles.menuSubtitle}>
          {subtitle}
        </Text>
      )}

    </View>

    <Switch
      value={value}
      trackColor={{
        false: '#DDE5ED',
        true: '#1B365D'
      }}
      thumbColor={
        value
          ? '#4CD964'
          : '#F4F3F4'
      }
    />

  </View>
);

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },

  header: {
    backgroundColor: '#1B365D',
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 20
  },

  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold'
  },

  scrollContent: {
    paddingBottom: 100
  },

  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#FFF',
    marginBottom: 10
  },

  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1B365D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15
  },

  avatarTextLarge: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold'
  },

  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  userEmail: {
    fontSize: 14,
    color: '#95A5A6',
    marginVertical: 4
  },

  badgeModerado: {
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 8
  },

  badgeText: {
    color: '#1B365D',
    fontSize: 12,
    fontWeight: 'bold'
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7F8C8D',
    marginLeft: 20,
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase'
  },

  menuGroup: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5'
  },

  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },

  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50'
  },

  menuSubtitle: {
    fontSize: 12,
    color: '#95A5A6',
    marginTop: 2
  },

  logoutButton: {
    backgroundColor: '#E74C3C',
    margin: 20,
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center'
  },

  logoutText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },

  versionText: {
    textAlign: 'center',
    color: '#BDC3C7',
    fontSize: 12,
    marginBottom: 20
  }

});