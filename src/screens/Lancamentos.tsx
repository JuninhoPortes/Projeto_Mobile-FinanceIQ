import React, { useState, useEffect } from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  BackHandler
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  transactionService,
  Transaction
} from '../database/transactionService';

// ✅ AUTH CENTRALIZADO
import { auth } from '../../firebaseConfig';

export default function Lancamentos() {

  // =========================
  // STATES
  // =========================
  const [modalVisible, setModalVisible] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [description, setDescription] = useState('');

  const [amount, setAmount] = useState('');

  const [type, setType] =
    useState<'income' | 'outcome'>('outcome');

  // ✅ MODO EDIÇÃO
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const user = auth.currentUser;

  // =========================
  // CARREGAR DADOS
  // =========================
  const loadData = async () => {

    if (!user?.uid) return;

    try {

      const data =
        await transactionService.listAll(
          user.uid
        );

      setTransactions(data);

    } catch (error) {

      console.error(
        'Erro ao carregar lista:',
        error
      );

    }
  };

  // =========================
  // EFFECT
  // =========================
  useEffect(() => {

    loadData();

  }, []);

  // =========================
  // BOTÃO VOLTAR ANDROID
  // =========================
  useEffect(() => {

    const backAction = () => {

      // ✅ FECHA O MODAL
      if (modalVisible) {

        closeModal();

        return true;
      }

      // ❌ LIBERA O RESTO DA NAVEGAÇÃO
      return false;
    };

    const backHandler =
      BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );

    return () => backHandler.remove();

  }, [modalVisible]);

  // =========================
  // ABRIR MODAL PARA EDITAR
  // =========================
  const handleEdit = (
    transaction: Transaction
  ) => {

    setEditingTransaction(transaction);

    setDescription(
      transaction.description
    );

    setAmount(
      transaction.amount.toString()
    );

    setType(transaction.type);

    setModalVisible(true);
  };

  // =========================
  // EXCLUIR
  // =========================
  const handleDelete = async (
    id: string
  ) => {

    Alert.alert(
      'Excluir Lançamento',
      'Deseja realmente apagar este registro?',
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

              await transactionService.remove(id);

              loadData();

            } catch {

              Alert.alert(
                'Erro',
                'Não foi possível excluir.'
              );

            }
          }
        }
      ]
    );
  };

  // =========================
  // SALVAR
  // =========================
  const handleSave = async () => {

    if (!description || !amount) {

      Alert.alert(
        'Erro',
        'Preencha todos os campos.'
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

    try {

      const parsedAmount = parseFloat(
        amount.replace(',', '.')
      );

      // =========================
      // EDITAR
      // =========================
      if (
        editingTransaction &&
        editingTransaction.id
      ) {

        await transactionService.updateAmount(
          editingTransaction.id,
          parsedAmount
        );

      } else {

        // =========================
        // NOVO LANÇAMENTO
        // =========================
        await transactionService.add(
          user.uid,
          {
            description,
            amount: parsedAmount,
            type,
            category:
              type === 'income'
                ? 'Receita'
                : 'Geral'
          }
        );
      }

      // =========================
      // RESET
      // =========================
      setDescription('');

      setAmount('');

      setType('outcome');

      setEditingTransaction(null);

      setModalVisible(false);

      loadData();

      Alert.alert(
        'Sucesso',
        'Lançamento salvo com sucesso!'
      );

    } catch (error) {

      console.error(error);

      Alert.alert(
        'Erro',
        'Não foi possível salvar.'
      );
    }
  };

  // =========================
  // FECHAR MODAL
  // =========================
  const closeModal = () => {

    setModalVisible(false);

    setEditingTransaction(null);

    setDescription('');

    setAmount('');

    setType('outcome');
  };

  // =========================
  // ÍCONES
  // =========================
  const getIcon = (
    item: Transaction
  ) => {

    if (item.type === 'income')
      return 'briefcase-outline';

    const desc =
      item.description.toLowerCase();

    if (
      desc.includes('moradia')
    )
      return 'home-outline';

    if (
      desc.includes('transporte')
    )
      return 'car-outline';

    if (
      desc.includes('alimentação')
    )
      return 'cart-outline';

    if (
      desc.includes('uber') ||
      desc.includes('pizza') ||
      desc.includes('ifood')
    )
      return 'food';

    return 'cash-multiple';
  };

  // =========================
  // RENDER
  // =========================
  return (

    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>

        <Text style={styles.headerTitle}>
          Lançamentos
        </Text>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {

            setEditingTransaction(null);

            setDescription('');

            setAmount('');

            setType('outcome');

            setModalVisible(true);
          }}
        >

          <MaterialCommunityIcons
            name="plus"
            size={24}
            color="#FFF"
          />

        </TouchableOpacity>

      </View>

      {/* LISTA */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.scrollContent
        }
      >

        {transactions.map((item) => {

          const isSeeder = [
            'Salário Mensal',
            'Moradia',
            'Transporte',
            'Alimentação'
          ].includes(item.description);

          return (

            <TouchableOpacity
              key={item.id}
              style={styles.itemContainer}
              onPress={() => handleEdit(item)}
              activeOpacity={0.8}
            >

              {/* ÍCONE */}
              <View style={styles.iconBox}>

                <MaterialCommunityIcons
                  name={getIcon(item) as any}
                  size={24}
                  color="#555"
                />

              </View>

              {/* INFO */}
              <View style={styles.infoBox}>

                <Text style={styles.itemTitle}>
                  {item.description}
                </Text>

                <Text style={styles.itemSubtitle}>
                  {isSeeder
                    ? 'Categoria fixa'
                    : item.category}
                </Text>

              </View>

              {/* VALOR */}
              <View
                style={
                  styles.valueAndDeleteContainer
                }
              >

                <Text
                  style={[
                    styles.itemValue,
                    {
                      color:
                        item.type === 'outcome'
                          ? '#A04444'
                          : '#27AE60'
                    }
                  ]}
                >

                  {item.type === 'outcome'
                    ? '-'
                    : '+'}

                  {' '}R$ {' '}

                  {item.amount
                    .toFixed(2)
                    .replace('.', ',')}

                </Text>

                {/* LIXEIRA APENAS NOS EXTRAS */}
                {!isSeeder &&
                  item.id && (

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() =>
                        handleDelete(item.id!)
                      }
                    >

                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={18}
                        color="#D0D3D4"
                      />

                    </TouchableOpacity>

                  )}

              </View>

            </TouchableOpacity>
          );
        })}

        <View style={{ height: 30 }} />

      </ScrollView>

      {/* MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >

        <KeyboardAvoidingView
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : 'height'
          }
          style={{ flex: 1 }}
        >

          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
          >

            <View style={styles.modalOverlay}>

              <View style={styles.modalContent}>

                <View style={styles.modalHandle} />

                <Text style={styles.modalTitle}>

                  {editingTransaction
                    ? 'Editar Lançamento'
                    : 'Novo Lançamento'}

                </Text>

                {/* TIPO */}
                {!editingTransaction && (

                  <View
                    style={styles.typeContainer}
                  >

                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        type === 'income' &&
                        styles.typeButtonInActive
                      ]}
                      onPress={() =>
                        setType('income')
                      }
                    >

                      <Text
                        style={[
                          styles.typeButtonText,
                          type === 'income' &&
                          { color: '#FFF' }
                        ]}
                      >
                        ↑ Entrada
                      </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        type === 'outcome' &&
                        styles.typeButtonOutActive
                      ]}
                      onPress={() =>
                        setType('outcome')
                      }
                    >

                      <Text
                        style={[
                          styles.typeButtonText,
                          type === 'outcome' &&
                          { color: '#FFF' }
                        ]}
                      >
                        ↓ Saída
                      </Text>

                    </TouchableOpacity>

                  </View>

                )}

                {/* VALOR */}
                <Text style={styles.inputLabel}>
                  Valor (R$)
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="0,00"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />

                {/* DESCRIÇÃO */}
                {!editingTransaction && (

                  <>
                    <Text
                      style={styles.inputLabel}
                    >
                      Descrição
                    </Text>

                    <TextInput
                      style={styles.input}
                      placeholder="Ex: Netflix"
                      value={description}
                      onChangeText={
                        setDescription
                      }
                    />
                  </>

                )}

                {/* FOOTER */}
                <View style={styles.modalFooter}>

                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={closeModal}
                  >

                    <Text
                      style={
                        styles.cancelButtonText
                      }
                    >
                      Cancelar
                    </Text>

                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                  >

                    <Text
                      style={
                        styles.saveButtonText
                      }
                    >
                      Salvar
                    </Text>

                  </TouchableOpacity>

                </View>

              </View>

            </View>

          </TouchableWithoutFeedback>

        </KeyboardAvoidingView>

      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
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
    backgroundColor:
      'rgba(255,255,255,0.1)',
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10
  },

  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5'
  },

  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F0F9F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },

  infoBox: {
    flex: 1
  },

  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B365D'
  },

  itemSubtitle: {
    fontSize: 13,
    color: '#95A5A6',
    marginTop: 2
  },

  valueAndDeleteContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  itemValue: {
    fontSize: 16,
    fontWeight: 'bold'
  },

  deleteButton: {
    marginLeft: 10,
    padding: 5
  },

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },

  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25
  },

  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 20
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 20
  },

  typeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },

  typeButton: {
    flex: 0.48,
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
    alignItems: 'center'
  },

  typeButtonInActive: {
    backgroundColor: '#1B365D'
  },

  typeButtonOutActive: {
    backgroundColor: '#E74C3C'
  },

  typeButtonText: {
    fontWeight: 'bold',
    color: '#7F8C8D'
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 8
  },

  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    fontSize: 16
  },

  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },

  cancelButton: {
    flex: 0.48,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1B365D',
    alignItems: 'center'
  },

  cancelButtonText: {
    color: '#1B365D',
    fontWeight: 'bold'
  },

  saveButton: {
    flex: 0.48,
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#27AE60',
    alignItems: 'center'
  },

  saveButtonText: {
    color: '#FFF',
    fontWeight: 'bold'
  }

});