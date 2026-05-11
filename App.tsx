import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
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
  StyleSheet
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/AppNavigator';

export default function App() {
  const navigationRef = useNavigationContainerRef<any>();

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

  return (
    <SafeAreaProvider>
      {/* Protege apenas a parte de cima */}
      <SafeAreaView style={styles.topSafeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      </SafeAreaView>

      {/* Conteúdo principal sem afetar a parte de baixo */}
      <View style={styles.container}>
        <NavigationContainer ref={navigationRef}>
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
