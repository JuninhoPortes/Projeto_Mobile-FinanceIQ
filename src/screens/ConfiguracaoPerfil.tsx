import React, { useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView
} from 'react-native';

// ✅ AUTH CENTRALIZADO
import { auth } from '../../firebaseConfig';

// ✅ SERVICE DO PERFIL
import {
  userProfileService
} from '../database/userProfileService';

// ✅ SERVICE DE LANÇAMENTOS
import {
  transactionService
} from '../database/transactionService';

export default function ConfiguracaoPerfil({
  navigation
}: any) {

  const [renda, setRenda] = useState('');

  const [perfilSelecionado, setPerfilSelecionado] = useState('');

  const user = auth.currentUser;

  // =========================
  // FINALIZAR CONFIGURAÇÃO
  // =========================
  const handleComecar = async () => {

    if (!renda || !perfilSelecionado) {

      Alert.alert(
        'Aviso',
        'Por favor, informe seu salário mensal e selecione um perfil.'
      );

      return;
    }

    if (!user?.uid) {

      Alert.alert(
        'Erro',
        'Sessão expirada. Faça login novamente.'
      );

      navigation.replace('Login');

      return;
    }

    const salarioMensal = parseFloat(
      renda.replace(',', '.')
    );

    if (isNaN(salarioMensal) || salarioMensal < 0) {

      Alert.alert(
        'Erro',
        'Informe um valor válido para o salário mensal.'
      );

      return;
    }

    try {

      // =========================
      // 1. SALVA APENAS O PERFIL DE RISCO
      // =========================
      await userProfileService.saveProfile(
        user.uid,
        {
          risk_profile: perfilSelecionado
        }
      );

      // =========================
      // 2. GARANTE QUE OS LANÇAMENTOS FIXOS EXISTEM
      // =========================
      const transactions = await transactionService.listAll(
        user.uid
      );

      // =========================
      // 3. LOCALIZA O LANÇAMENTO "SALÁRIO MENSAL"
      // =========================
      const salarioTransaction = transactions.find(
        item => item.description === 'Salário Mensal'
      );

      // =========================
      // 4. ATUALIZA O VALOR DO SALÁRIO MENSAL
      // =========================
      if (salarioTransaction?.id) {

        await transactionService.updateAmount(
          salarioTransaction.id,
          salarioMensal
        );

      }

      Alert.alert(
        'Sucesso',
        'Perfil configurado com sucesso!'
      );

      navigation.replace('Index');

    } catch (error) {

      console.error(error);

      Alert.alert(
        'Erro',
        'Não foi possível salvar seu perfil.'
      );

    }
  };

  return (

    <SafeAreaView style={styles.container}>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <Text style={styles.title}>
          Configure seu Perfil
        </Text>

        <Text style={styles.subtitle}>
          Olá, {user?.displayName?.split(' ')[0] || 'Usuário'}!
          Essas informações nos ajudam a personalizar seu app.
        </Text>

        {/* SALÁRIO */}
        <Text style={styles.label}>
          Salário Mensal (R$)
        </Text>

        <View style={styles.inputContainer}>

          <Text style={styles.icon}>
            💰
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Ex: 5000"
            keyboardType="numeric"
            value={renda}
            onChangeText={setRenda}
          />

        </View>

        <Text style={styles.helperText}>
          Esse valor será registrado como sua entrada fixa mensal em “Salário Mensal”.
        </Text>

        {/* PERFIL */}
        <Text style={styles.label}>
          Perfil de Risco
        </Text>

        <RiskCard
          title="Conservador"
          desc="Prioriza segurança e liquidez"
          selected={perfilSelecionado === 'Conservador'}
          onPress={() => setPerfilSelecionado('Conservador')}
        />

        <RiskCard
          title="Moderado"
          desc="Equilíbrio entre risco e retorno"
          selected={perfilSelecionado === 'Moderado'}
          onPress={() => setPerfilSelecionado('Moderado')}
        />

        <RiskCard
          title="Agressivo"
          desc="Aceita volatilidade por maiores ganhos"
          selected={perfilSelecionado === 'Agressivo'}
          onPress={() => setPerfilSelecionado('Agressivo')}
        />

        {/* BOTÃO */}
        <TouchableOpacity
          style={styles.btnStart}
          onPress={handleComecar}
        >

          <Text style={styles.btnStartText}>
            Finalizar Configuração →
          </Text>

        </TouchableOpacity>

      </ScrollView>

    </SafeAreaView>
  );
}

// =========================
// CARD
// =========================
const RiskCard = ({
  title,
  desc,
  selected,
  onPress
}: any) => (

  <TouchableOpacity
    style={[
      styles.card,
      selected && styles.cardSelected
    ]}
    onPress={onPress}
  >

    <Text
      style={[
        styles.cardTitle,
        selected && styles.cardTextSelected
      ]}
    >
      {title}
    </Text>

    <Text style={styles.cardDesc}>
      {desc}
    </Text>

  </TouchableOpacity>
);

// =========================
// STYLES
// =========================
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#FFF'
  },

  scrollContent: {
    padding: 25
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1B365D',
    marginTop: 20
  },

  subtitle: {
    fontSize: 15,
    color: '#7F8C8D',
    marginVertical: 15,
    lineHeight: 22
  },

  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B365D',
    marginTop: 20,
    marginBottom: 10
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    paddingHorizontal: 15,
    marginBottom: 8
  },

  icon: {
    fontSize: 20,
    marginRight: 10
  },

  input: {
    flex: 1,
    height: 55,
    fontSize: 16
  },

  helperText: {
    fontSize: 12,
    color: '#95A5A6',
    lineHeight: 18,
    marginBottom: 10
  },

  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    padding: 18,
    marginBottom: 12
  },

  cardSelected: {
    borderColor: '#1B365D',
    backgroundColor: '#F8FAFC',
    borderWidth: 2
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  cardTextSelected: {
    color: '#1B365D'
  },

  cardDesc: {
    fontSize: 13,
    color: '#95A5A6',
    marginTop: 4
  },

  btnStart: {
    backgroundColor: '#27AE60',
    height: 60,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30
  },

  btnStartText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  }

});