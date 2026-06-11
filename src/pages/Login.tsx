import React, {
  useState,
  useEffect,
  useRef
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

import {
  MaterialCommunityIcons
} from '@expo/vector-icons';

// AUTH
import { auth } from '../../firebaseConfig';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';

const { width } =
  Dimensions.get('window');

const isWeb = width > 600;

export default function Login({
  navigation
}: any) {

  const [displayName, setDisplayName] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [isLoginTab, setIsLoginTab] =
    useState(true);

  // ESTADO PARA CONTROLAR A VISUALIZAÇÃO DA SENHA
  const [showPassword, setShowPassword] = 
    useState(false);

  // 📝 ESTADOS PARA MENSAGENS DE ERRO
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // REFS PARA NAVEGAÇÃO ENTRE CAMPOS COM O TECLADO
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // REF DA SCROLLVIEW PARA ROLAR QUANDO SENHA RECEBER FOCO
  const scrollRef = useRef<ScrollView>(null);

  // ==========================================
  // VALIDAÇÃO DO EMAIL — SOMENTE AO SAIR DO CAMPO
  // ==========================================
  const handleEmailBlur = () => {
    if (email.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setEmailError('Formato de e-mail inválido (ex: seu@email.com).');
      } else {
        setEmailError('');
      }
    } else {
      setEmailError('');
    }
  };

  // ==========================================
  // VALIDAÇÃO DA SENHA — EM TEMPO REAL
  // ==========================================
  useEffect(() => {
    if (!isLoginTab && password.length > 0) {
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[@$!%*?&#]/.test(password);
      
      if (password.length < 6) {
        setPasswordError('A senha deve ter pelo menos 6 caracteres.');
      } else if (!hasNumber) {
        setPasswordError('A senha precisa conter pelo menos 1 número.');
      } else if (!hasSpecial) {
        setPasswordError('A senha precisa conter pelo menos 1 caractere especial (ex: @, #, $, !).');
      } else {
        setPasswordError('');
      }
    } else {
      setPasswordError('');
    }
  }, [password, isLoginTab]);

  // =========================
  // LOGIN
  // =========================
  const handleLogin = async () => {

    const emailTratado =
      email.trim().toLowerCase();

    if (
      !emailTratado ||
      !password
    ) {

      Alert.alert(
        'Atenção',
        'Preencha e-mail e senha.'
      );

      return;
    }

    setLoading(true);

    try {

      await signInWithEmailAndPassword(
        auth,
        emailTratado,
        password
      );

      navigation.replace('Index');

    } catch (error: any) {

      console.log(error);

      let errorMessage =
        'Erro ao realizar login.';

      switch (error.code) {

        case 'auth/invalid-email':
          errorMessage =
            'E-mail inválido.';
          break;

        case 'auth/user-not-found':
          errorMessage =
            'Usuário não encontrado.';
          break;

        case 'auth/wrong-password':
          errorMessage =
            'Senha incorreta.';
          break;

        case 'auth/invalid-credential':
          errorMessage =
            'E-mail ou senha inválidos.';
          break;

        case 'auth/network-request-failed':
          errorMessage =
            'Falha de conexão.';
          break;

        default:
          errorMessage =
            error.message;
      }

      Alert.alert(
        'Erro',
        errorMessage
      );

    } finally {

      setLoading(false);

    }
  };

  // =========================
  // CADASTRO
  // =========================
  const handleSignUp = async () => {

    const nomeTratado =
      displayName.trim();

    const emailTratado =
      email.trim().toLowerCase();

    if (
      !nomeTratado ||
      !emailTratado ||
      !password
    ) {

      Alert.alert(
        'Atenção',
        'Preencha todos os campos.'
      );

      return;
    }

    // BLOQUEIA O CADASTRO SE O EMAIL TIVER ERRO
    if (emailError) {
      Alert.alert(
        'Atenção',
        'Corrija o e-mail antes de continuar.'
      );
      return;
    }

    // BLOQUEIA O CADASTRO SE A SENHA TIVER ERRO
    if (passwordError) {
      Alert.alert(
        'Atenção',
        'Corrija a senha antes de continuar.'
      );
      return;
    }

    if (password.length < 6) {

      Alert.alert(
        'Atenção',
        'Senha mínima de 6 caracteres.'
      );

      return;
    }

    // BLOQUEIA SE A SENHA NÃO TIVER NÚMERO OU CARACTERE ESPECIAL
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[@$!%*?&#]/.test(password);

    if (!hasNumber || !hasSpecial) {
      Alert.alert(
        'Atenção',
        'A senha precisa ter pelo menos 1 número e 1 caractere especial (ex: @, #, $, !).'
      );
      return;
    }

    setLoading(true);

    try {

      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          emailTratado,
          password
        );

      await updateProfile(
        userCredential.user,
        {
          displayName:
            nomeTratado
        }
      );

      Alert.alert(
        'Sucesso!',
        `Bem-vindo(a), ${nomeTratado}!`
      );

      navigation.replace(
        'ConfiguracaoPerfil'
      );

    } catch (error: any) {

      console.log(error);

      let errorMessage =
        'Erro ao criar conta.';

      switch (error.code) {

        case 'auth/email-already-in-use':
          errorMessage =
            'E-mail já está em uso.';
          break;

        case 'auth/invalid-email':
          errorMessage =
            'E-mail inválido.';
          break;

        case 'auth/weak-password':
          errorMessage =
            'Senha muito fraca.';
          break;

        default:
          errorMessage =
            error.message;
      }

      Alert.alert(
        'Erro',
        errorMessage
      );

    } finally {

      setLoading(false);

    }
  };

  // =========================
  // TROCAR ABA
  // =========================
  const handleChangeTab = (
    loginTab: boolean
  ) => {

    setIsLoginTab(loginTab);

    setDisplayName('');

    setEmail('');

    setPassword('');

    setEmailError('');

    setPasswordError('');
    
    // Reseta o olho para oculto ao trocar de aba
    setShowPassword(false);
  };

  return (

    <SafeAreaView
      style={styles.outsideContainer}
    >

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
      >

        <TouchableWithoutFeedback
          onPress={Keyboard.dismiss}
        >

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={
              styles.scrollContainer
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            <View style={styles.card}>

              {/* HEADER */}
              <View style={styles.header}>

                <View
                  style={styles.logoContainer}
                >

                  <MaterialCommunityIcons
                    name="diamond-stone"
                    size={40}
                    color="#5dade2"
                  />

                </View>

                <Text style={styles.title}>
                  FinanceIQ
                </Text>

                <Text
                  style={styles.subtitle}
                >
                  Inteligência Financeira
                </Text>

              </View>

              {/* TABS */}
              <View
                style={styles.tabContainer}
              >

                <TouchableOpacity
                  style={
                    isLoginTab
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                  onPress={() =>
                    handleChangeTab(true)
                  }
                >

                  <Text
                    style={
                      isLoginTab
                        ? styles.activeTabText
                        : styles.inactiveTabText
                    }
                  >
                    Entrar
                  </Text>

                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    !isLoginTab
                      ? styles.activeTab
                      : styles.inactiveTab
                  }
                  onPress={() =>
                    handleChangeTab(false)
                  }
                >

                  <Text
                    style={
                      !isLoginTab
                        ? styles.activeTabText
                        : styles.inactiveTabText
                    }
                  >
                    Criar Conta
                  </Text>

                </TouchableOpacity>

              </View>

              {/* FORM */}
              <View style={styles.form}>

                {!isLoginTab && (
                  <>

                    <Text
                      style={styles.label}
                    >
                      Nome Completo
                    </Text>

                    <View
                      style={
                        styles.inputContainer
                      }
                    >

                      <MaterialCommunityIcons
                        name="account-outline"
                        size={20}
                        color="#999"
                        style={styles.icon}
                      />

                      <TextInput
                        style={styles.input}
                        placeholder="Seu nome"
                        placeholderTextColor="#999"
                        value={displayName}
                        onChangeText={setDisplayName}
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                        blurOnSubmit={false}
                      />

                    </View>

                  </>
                )}

                {/* EMAIL */}
                <Text style={styles.label}>
                  E-mail
                </Text>

                <View
                  style={styles.inputContainer}
                >

                  <MaterialCommunityIcons
                    name="email-outline"
                    size={20}
                    color="#999"
                    style={styles.icon}
                  />

                  <TextInput
                    ref={emailRef}
                    style={styles.input}
                    placeholder="seu@email.com"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      // Limpa o erro enquanto o usuário corrige
                      if (emailError) setEmailError('');
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    blurOnSubmit={false}
                    onBlur={handleEmailBlur}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollTo({ y: 100, animated: true });
                      }, 300);
                    }}
                  />

                </View>

                {!!emailError && (
                  <Text style={styles.errorText}>
                    {emailError}
                  </Text>
                )}

                {/* SENHA */}
                <Text style={styles.label}>
                  Senha
                </Text>

                <View
                  style={styles.inputContainer}
                >

                  <MaterialCommunityIcons
                    name="lock-outline"
                    size={20}
                    color="#999"
                    style={styles.icon}
                  />

                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    placeholder="********"
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="done"
                    onSubmitEditing={
                      isLoginTab
                        ? handleLogin
                        : handleSignUp
                    }
                    blurOnSubmit={true}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 300);
                    }}
                  />

                  {/* BOTÃO DO OLHO IMPLEMENTADO */}
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeIcon}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color="#999"
                    />
                  </TouchableOpacity>

                </View>

                {/* ERRO DA SENHA — SÓ APARECE NA ABA CRIAR CONTA */}
                {!isLoginTab && !!passwordError && (
                  <Text style={styles.errorText}>
                    {passwordError}
                  </Text>
                )}

                {/* BOTÃO */}
                <TouchableOpacity
                  style={[
                    styles.button,
                    loading &&
                    styles.buttonDisabled
                  ]}
                  onPress={
                    isLoginTab
                      ? handleLogin
                      : handleSignUp
                  }
                  disabled={loading}
                >

                  {loading ? (

                    <ActivityIndicator
                      color="#fff"
                    />

                  ) : (

                    <Text
                      style={styles.buttonText}
                    >
                      {isLoginTab
                        ? 'Entrar'
                        : 'Cadastrar'}
                    </Text>

                  )}

                </TouchableOpacity>

              </View>

            </View>

          </ScrollView>

        </TouchableWithoutFeedback>

      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  outsideContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e'
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20
  },

  card: {
    backgroundColor: '#f8f9fc',
    width: isWeb
      ? 400
      : width * 0.9,
    borderRadius: 20,
    padding: 30,
    elevation: 5
  },

  header: {
    alignItems: 'center',
    marginBottom: 30
  },

  logoContainer: {
    backgroundColor: '#1b365d',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1b365d'
  },

  subtitle: {
    color: '#99abbd',
    fontSize: 14
  },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f2f5',
    borderRadius: 12,
    padding: 5,
    marginBottom: 30
  },

  activeTab: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center'
  },

  inactiveTab: {
    flex: 1,
    padding: 12,
    alignItems: 'center'
  },

  activeTabText: {
    fontWeight: 'bold',
    color: '#1b365d'
  },

  inactiveTabText: {
    color: '#99abbd'
  },

  form: {
    width: '100%'
  },

  label: {
    color: '#1b365d',
    fontWeight: '600',
    marginBottom: 8,
    fontSize: 14
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#edf2f7',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 20,
    height: 55
  },

  icon: {
    marginRight: 10
  },

  input: {
    flex: 1,
    color: '#333'
  },

  eyeIcon: {
    padding: 5
  },

  // ESTILO ÚNICO PARA TODOS OS ERROS
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginBottom: 15,
    paddingLeft: 5,
    fontWeight: '500'
  },

  button: {
    backgroundColor: '#1b365d',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center'
  },

  buttonDisabled: {
    opacity: 0.7
  },

  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  }

});