import React, {
  useState,
  useEffect
} from 'react';

import {
  View,
  ActivityIndicator
} from 'react-native';

import {
  createNativeStackNavigator
} from '@react-navigation/native-stack';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  onAuthStateChanged,
  User
} from 'firebase/auth';

import { auth } from '../firebaseConfig';

import Onboarding from './screens/Onboarding';
import ConfiguracaoPerfil from './screens/ConfiguracaoPerfil';
import Login from './pages/Login';
import Routes from './routes';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {

  const [loading, setLoading] =
    useState(true);

  const [isFirstLaunch, setIsFirstLaunch] =
    useState<boolean>(false);

  const [currentUser, setCurrentUser] =
    useState<User | null>(null);

  // =========================
  // VERIFICAR ONBOARDING + AUTH
  // =========================
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        try {

          const hasSeen =
            await AsyncStorage.getItem(
              'hasSeenOnboarding'
            );

          setIsFirstLaunch(
            hasSeen === null
          );

          setCurrentUser(user);

        } catch (error) {

          console.error(
            'Erro ao verificar estado inicial:',
            error
          );

          setIsFirstLaunch(false);

          setCurrentUser(null);

        } finally {

          setLoading(false);

        }

      }
    );

    return unsubscribe;

  }, []);

  // =========================
  // LOADING
  // =========================
  if (loading) {

    return (

      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >

        <ActivityIndicator
          size="large"
          color="#1B365D"
        />

      </View>

    );
  }

  // =========================
  // DEFINIR ROTA INICIAL
  // =========================
  const getInitialRoute = () => {

    if (isFirstLaunch) {
      return 'Onboarding';
    }

    if (currentUser) {
      return 'Index';
    }

    return 'Login';
  };

  return (

    <Stack.Navigator
      screenOptions={{
        headerShown: false
      }}
      initialRouteName={getInitialRoute()}
    >

      <Stack.Screen
        name="Onboarding"
        component={Onboarding}
      />

      <Stack.Screen
        name="Login"
        component={Login}
      />

      <Stack.Screen
        name="ConfiguracaoPerfil"
        component={ConfiguracaoPerfil}
      />

      <Stack.Screen
        name="Index"
        component={Routes}
      />

    </Stack.Navigator>

  );
}