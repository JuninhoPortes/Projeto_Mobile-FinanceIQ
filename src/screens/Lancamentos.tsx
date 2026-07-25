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

import {
  categoryService,
  Category
} from '../database/categoryService';

import {
  categorySuggestionService,
  CategorySuggestion
} from '../services/categorySuggestionService';

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

  const [availableCategories, setAvailableCategories] =
    useState<Category[]>([]);

  const [selectedCategoryName, setSelectedCategoryName] =
    useState('');

  const [categorySuggestion, setCategorySuggestion] =
    useState<CategorySuggestion | null>(null);

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const user = auth.currentUser;

  // =========================
  // FUNÇÃO DE MÁSCARA MONETÁRIA
  // =========================
  const formatMoney = (text: string) => {
    const cleanText = text.replace(/\D/g, '');

    if (!cleanText) {
      return '';
    }

    const valueFloat = parseFloat(cleanText) / 100;

    return valueFloat.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const moneyToFloat = (valueStr: string): number => {
    if (!valueStr) return 0;

    const cleanStr = valueStr
      .replace(/\./g, '')
      .replace(',', '.');

    return parseFloat(cleanStr);
  };

  const floatToMoney = (valueNum: number): string => {
    return valueNum.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // =========================
  // AUXILIARES DE CATEGORIA
  // =========================
  const normalizeText = (value: string) => {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  const getDefaultCategoryForType = (
    selectedType: 'income' | 'outcome',
    categories: Category[]
  ) => {
    if (selectedType === 'income') {
      return (
        categories.find(
          category =>
            category.type === 'income' &&
            normalizeText(category.name) === 'receita'
        )?.name || 'Receita'
      );
    }

    return (
      categories.find(
        category =>
          category.type === 'outcome' &&
          normalizeText(category.name) === 'outros'
      )?.name ||
      categories.find(
        category => category.type === 'outcome'
      )?.name ||
      'Outros'
    );
  };

  const getCategoriesByType = () => {
    return availableCategories.filter(
      category =>
        category.is_active &&
        category.type === type
    );
  };

  const handleChangeType = (
    selectedType: 'income' | 'outcome'
  ) => {
    setType(selectedType);

    setSelectedCategoryName('');

    setCategorySuggestion(null);
  };

  const applySuggestedCategory = () => {
    if (categorySuggestion?.category) {
      setSelectedCategoryName(
        categorySuggestion.category.name
      );
    }
  };

  const isFixedTransaction = (
    transaction?: Transaction | null
  ) => {
    if (!transaction) {
      return false;
    }

    return [
      'Salário Mensal',
      'Moradia',
      'Transporte',
      'Alimentação'
    ].includes(transaction.description);
  };
  
  const handleSelectCategory = (categoryName: string) => {
  setSelectedCategoryName((currentCategory) => {
    if (currentCategory === categoryName) {
      return '';
    }

    return categoryName;
  });
};

  // =========================
  // CARREGAR DADOS
  // =========================
  const loadData = async () => {

    if (!user?.uid) return;

    try {

      const [data, categories] =
        await Promise.all([
          transactionService.listAll(user.uid),
          categoryService.listAll(user.uid)
        ]);

      setTransactions(data);

      setAvailableCategories(categories);

    } catch (error) {

      console.error(
        'Erro ao carregar lista:',
        error
      );

    }
  };

  // =========================
  // EFFECT: CARREGAR DADOS
  // =========================
  useEffect(() => {

    loadData();

  }, []);

  // =========================
  // EFFECT: SUGESTÃO DE CATEGORIA
  // =========================
  useEffect(() => {
    if (editingTransaction) {
      return;
    }

    const suggestion =
      categorySuggestionService.suggestCategory({
        description,
        type,
        categories: availableCategories
      });

    setCategorySuggestion(suggestion);

    if (
      suggestion?.category &&
      suggestion.shouldAutoSelect
    ) {
      setSelectedCategoryName(
        suggestion.category.name
      );
    }
  }, [
    description,
    type,
    availableCategories,
    editingTransaction
  ]);

  // =========================
  // BOTÃO VOLTAR ANDROID
  // =========================
  useEffect(() => {

    const backAction = () => {

      if (modalVisible) {

        closeModal();

        return true;
      }

      return false;
    };

    const backHandler =
      BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );

    return () => backHandler.remove();

  }, [modalVisible, availableCategories]);

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
      floatToMoney(transaction.amount)
    );

    setType(transaction.type);

    setSelectedCategoryName(
      transaction.category
    );

    setCategorySuggestion(null);

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

    if (!amount) {

      Alert.alert(
        'Erro',
        'Preencha o valor.'
      );

      return;
    }

    if (!editingTransaction && !description.trim()) {

      Alert.alert(
        'Erro',
        'Preencha a descrição.'
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

      const parsedAmount = moneyToFloat(amount);

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        Alert.alert(
          'Erro',
          'Insira um valor válido maior que zero.'
        );

        return;
      }

      if (!selectedCategoryName) {
        Alert.alert(
          'Categoria obrigatória',
          'Selecione uma categoria antes de salvar o lançamento.'
        );

        return;
      }

      const categoryToSave = selectedCategoryName;

      // =========================
      // EDITAR
      // =========================
      if (
        editingTransaction &&
        editingTransaction.id
      ) {

        const updateData: Partial<Pick<Transaction, 'amount' | 'category'>> = {
          amount: parsedAmount
        };

        if (!isFixedTransaction(editingTransaction)) {
          if (!selectedCategoryName) {
            Alert.alert(
              'Categoria obrigatória',
              'Selecione uma categoria antes de salvar o lançamento.'
            );

            return;
          }

          updateData.category = selectedCategoryName;
        }

        await transactionService.update(
          editingTransaction.id,
          updateData
        );

      } else {

        // =========================
        // NOVO LANÇAMENTO
        // =========================
        await transactionService.add(
          user.uid,
          {
            description: description.trim(),
            amount: parsedAmount,
            type,
            category: categoryToSave
          }
        );
      }

      setDescription('');

      setAmount('');

      setType('outcome');

      setSelectedCategoryName('');

      setCategorySuggestion(null);

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

    setSelectedCategoryName('');

    setCategorySuggestion(null);
  };

  // =========================
  // ÍCONES
  // =========================
  const getIcon = (
    item: Transaction
  ) => {

    if (item.type === 'income')
      return 'briefcase-outline';

    const category =
      normalizeText(item.category || '');

    const desc =
      normalizeText(item.description || '');

    if (
      category.includes('moradia') ||
      desc.includes('moradia')
    )
      return 'home-outline';

    if (
      category.includes('transporte') ||
      desc.includes('transporte') ||
      desc.includes('uber') ||
      desc.includes('gasolina')
    )
      return 'car-outline';

    if (
      category.includes('alimentacao') ||
      desc.includes('ifood') ||
      desc.includes('pizza') ||
      desc.includes('restaurante')
    )
      return 'food';

    if (
      category.includes('compras') ||
      desc.includes('mercado') ||
      desc.includes('supermercado') ||
      desc.includes('amazon') ||
      desc.includes('shopee')
    )
      return 'cart-outline';

    if (
      category.includes('saude') ||
      desc.includes('farmacia') ||
      desc.includes('consulta')
    )
      return 'medical-bag';

    if (
      category.includes('lazer') ||
      desc.includes('netflix') ||
      desc.includes('spotify')
    )
      return 'theater';

    if (
      category.includes('educacao') ||
      desc.includes('faculdade') ||
      desc.includes('curso')
    )
      return 'book-open-variant';

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

            setSelectedCategoryName('');

            setCategorySuggestion(null);

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
                        handleChangeType('income')
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
                        handleChangeType('outcome')
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
                  onChangeText={(text) => {
                    const formatted = formatMoney(text);
                    setAmount(formatted);
                  }}
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

                    {categorySuggestion &&
                      description.trim() !== '' && (

                        <View style={styles.suggestionBox}>

                          <MaterialCommunityIcons
                            name={
                              categorySuggestion.requiresConfirmation
                                ? 'alert-circle-outline'
                                : 'lightbulb-on-outline'
                            }
                            size={20}
                            color={
                              categorySuggestion.requiresConfirmation
                                ? '#F39C12'
                                : '#27AE60'
                            }
                          />

                          <View style={styles.suggestionTextContainer}>

                            <Text style={styles.suggestionText}>
                              {categorySuggestion.message}
                            </Text>

                            {categorySuggestion.category &&
                              categorySuggestion.requiresConfirmation && (

                                <TouchableOpacity
                                  style={styles.useSuggestionButton}
                                  onPress={applySuggestedCategory}
                                >

                                  <Text style={styles.useSuggestionText}>
                                    Usar {categorySuggestion.category.name}
                                  </Text>

                                </TouchableOpacity>
                              )}

                          </View>

                        </View>
                      )}
                  </>

                )}

                {/* CATEGORIA */}
                {(!editingTransaction ||
                  !isFixedTransaction(editingTransaction)) && (

                  <>
                    <Text style={styles.inputLabel}>
                      Categoria
                    </Text>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.categoryScroll}
                    >

                      {getCategoriesByType().map((category) => {

                        const isSelected =
                          selectedCategoryName === category.name;

                        return (

                          <TouchableOpacity
                            key={category.id || category.name}
                            style={[
                              styles.categoryChip,
                              isSelected && {
                                backgroundColor: category.color,
                                borderColor: category.color
                              }
                            ]}
                            onPress={() =>
                              handleSelectCategory(category.name)
                            }
                          >

                            <MaterialCommunityIcons
                              name={category.icon as any}
                              size={16}
                              color={
                                isSelected
                                  ? '#FFF'
                                  : category.color
                              }
                            />

                            <Text
                              style={[
                                styles.categoryChipText,
                                isSelected &&
                                styles.categoryChipTextActive
                              ]}
                            >
                              {category.name}
                            </Text>

                          </TouchableOpacity>
                        );
                      })}

                    </ScrollView>
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

  suggestionBox: {
    backgroundColor: '#FFF8E7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },

  suggestionTextContainer: {
    flex: 1,
    marginLeft: 8
  },

  suggestionText: {
    color: '#7D6608',
    fontSize: 12,
    lineHeight: 17
  },

  useSuggestionButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#1B365D',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10
  },

  useSuggestionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold'
  },

  categoryScroll: {
    marginBottom: 20
  },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDE3EA',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    marginRight: 8
  },

  categoryChipText: {
    color: '#1B365D',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6
  },

  categoryChipTextActive: {
    color: '#FFF'
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