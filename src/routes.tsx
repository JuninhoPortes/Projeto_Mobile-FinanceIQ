import React from 'react';

import {
  createBottomTabNavigator
} from '@react-navigation/bottom-tabs';

import {
  MaterialCommunityIcons
} from '@expo/vector-icons';

import {
  useSafeAreaInsets
} from 'react-native-safe-area-context';

// Screens
import Dashboard from './screens/Dashboard';
import Lancamentos from './screens/Lancamentos';
import Categorias from './screens/Categorias';
import Relatorios from './screens/Relatorios';
import Perfil from './screens/Perfil';

const Tab = createBottomTabNavigator();

export default function Routes() {

  const insets =
    useSafeAreaInsets();

  return (

    <Tab.Navigator
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: '#2C3E50',

        tabBarInactiveTintColor: '#BDC3C7',

        tabBarStyle: {

          backgroundColor: '#FFFFFF',

          borderTopWidth: 1,

          borderTopColor: '#EEEEEE',

          height: 65 + insets.bottom,

          paddingBottom:
            insets.bottom > 0
              ? insets.bottom
              : 10,

          paddingTop: 5
        }
      }}
    >

      <Tab.Screen
        name="Início"
        component={Dashboard}
        options={{
          tabBarIcon: ({
            color,
            size
          }) => (

            <MaterialCommunityIcons
              name="home-outline"
              color={color}
              size={size}
            />

          ),
        }}
      />

      <Tab.Screen
        name="Lançamentos"
        component={Lancamentos}
        options={{
          tabBarIcon: ({
            color,
            size
          }) => (

            <MaterialCommunityIcons
              name="swap-vertical"
              color={color}
              size={size}
            />

          ),
        }}
      />

      <Tab.Screen
        name="Categorias"
        component={Categorias}
        options={{
          tabBarIcon: ({
            color,
            size
          }) => (

            <MaterialCommunityIcons
              name="grid-large"
              color={color}
              size={size}
            />

          ),
        }}
      />

      <Tab.Screen
        name="Relatórios"
        component={Relatorios}
        options={{
          tabBarIcon: ({
            color,
            size
          }) => (

            <MaterialCommunityIcons
              name="file-document-outline"
              color={color}
              size={size}
            />

          ),
        }}
      />

      <Tab.Screen
        name="Perfil"
        component={Perfil}
        options={{
          tabBarIcon: ({
            color,
            size
          }) => (

            <MaterialCommunityIcons
              name="account-circle-outline"
              color={color}
              size={size}
            />

          ),
        }}
      />

    </Tab.Navigator>
  );
}