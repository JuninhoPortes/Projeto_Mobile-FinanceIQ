import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef
} from '@react-navigation/native';
import {
  BackHandler,
  Alert,
  Platform,
  StatusBar,
  View,
  StyleSheet,
  PanResponder
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/AppNavigator';

// ✅ Importa o Auth do Firebase para fazer o SignOut
import { auth } from './firebaseConfig';
import { signOut } from 'firebase/auth';

// CONFIGURAÇÃO DE TEMPO (Para testes mantenha em 10000 (10segundos))
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; //5minutos

export default function App() {
  const navigationRef = useNavigationContainerRef<any>();
  const timerRef = useRef<any>(null);
  
  const isExpiringRef = useRef<boolean>(false);

  // =========================
  // LOGICA DE SESSÃO EXPIRADA
  // =========================
  const resetInactivityTimer = () => {
    if (isExpiringRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (auth.currentUser) {
      timerRef.current = setTimeout(() => {
        handleSessionTimeout();
      }, INACTIVITY_TIMEOUT);
    }
  };

  const handleSessionTimeout = async () => {
    if (isExpiringRef.current || !auth.currentUser) return;

    try {
      isExpiringRef.current = true;

      await signOut(auth);
      
      if (timerRef.current) clearTimeout(timerRef.current);

      if (navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
      
      Alert.alert(
        'Sessão Expirada',
        'Sua sessão expirou por inatividade para sua segurança. Por favor, faça login novamente.',
        [
          {
            text: 'OK',
            onPress: () => {
              setTimeout(() => {
                isExpiringRef.current = false;
              }, 500);
            }
          }
        ]
      );
    } catch (error) {
      console.error('Erro ao encerrar sessão por inatividade:', error);
      isExpiringRef.current = false;
    }
  };

  // Escuta as interações capturadas pela View padrão
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => { resetInactivityTimer(); return false; },
      onMoveShouldSetPanResponderCapture: () => { resetInactivityTimer(); return false; },
      onStartShouldSetPanResponder: () => { resetInactivityTimer(); return false; },
      onMoveShouldSetPanResponder: () => { resetInactivityTimer(); return false; }
    })
  ).current;

  // Monitora interações extras e mudanças de estado de navegação
  const handleStateChange = () => {
    resetInactivityTimer(); // Reseta o timer sempre que o usuário muda de tela ou interage com abas
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // =========================
  // BOTÃO VOLTAR ANDROID
  // =========================
  const getActiveRouteName = (state: any): string => {
    const route = state.routes[state.index];
    if (route.state) {
      return getActiveRouteName(route.state);
    }
    return route.name;
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backAction = () => {
      const rootState = navigationRef.getRootState();
      if (!rootState) return false;

      const currentRouteName = getActiveRouteName(rootState);

      if (currentRouteName !== 'Início') {
        navigationRef.navigate('Início');
        return true;
      }

      Alert.alert(
        'Sair',
        'Deseja realmente sair do aplicativo?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', onPress: () => BackHandler.exitApp() }
        ]
      );

      return true;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => subscription.remove();
  }, []);

  // =========================
  // RENDER WITH NAVIGATION LISTENER
  // =========================
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.topSafeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      </SafeAreaView>

      <View 
        style={styles.container} 
        {...panResponder.panHandlers}
      >
        {/* ✅ O onStateChange captura mudanças de foco e cliques na TabBar, 
            garantindo que o Dashboard seja monitorado pelo roteador */}
        <NavigationContainer 
          ref={navigationRef}
          onStateChange={handleStateChange}
        >
          <AppNavigator />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  topSafeArea: {
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});