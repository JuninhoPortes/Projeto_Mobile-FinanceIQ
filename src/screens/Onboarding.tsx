import React, { useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { MaterialCommunityIcons } from '@expo/vector-icons';

const SLIDES = [
  {
    title: 'Inteligência Financeira',
    desc: 'Entenda para onde vai cada centavo do seu dinheiro com dashboards claros e objetivos.',
    icon: 'lightbulb-on-outline'
  },
  {
    title: 'Metas que se Cumprem',
    desc: 'Defina objetivos, acompanhe o progresso e receba projeções inteligentes de conclusão.',
    icon: 'target'
  },
  {
    title: 'IA ao seu Favor',
    desc: 'Receba sugestões personalizadas de economia e investimento baseadas no seu perfil.',
    icon: 'robot-outline'
  }
];

export default function Onboarding({ navigation }: any) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // =========================
  // FINALIZAR ONBOARDING
  // =========================
  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem(
        'hasSeenOnboarding',
        'true'
      );

      navigation.replace('Login');

    } catch (error) {
      console.error('Erro ao finalizar onboarding:', error);

      Alert.alert(
        'Erro',
        'Não foi possível finalizar a introdução.'
      );
    }
  };

  // =========================
  // PRÓXIMO SLIDE
  // =========================
  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      finishOnboarding();
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.content}>

        <MaterialCommunityIcons
          name={SLIDES[currentSlide].icon as any}
          size={100}
          color="#F1C40F"
        />

        <Text style={styles.title}>
          {SLIDES[currentSlide].title}
        </Text>

        <Text style={styles.desc}>
          {SLIDES[currentSlide].desc}
        </Text>

        <View style={styles.pagination}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                currentSlide === i && styles.activeDot
              ]}
            />
          ))}
        </View>

      </View>

      <View style={styles.footer}>

        <TouchableOpacity
          style={styles.btnNext}
          onPress={handleNext}
        >
          <Text style={styles.btnNextText}>
            {currentSlide === SLIDES.length - 1
              ? 'Começar →'
              : 'Próximo →'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={finishOnboarding}>
          <Text style={styles.btnSkip}>
            Pular introdução
          </Text>
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B365D'
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40
  },

  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40
  },

  desc: {
    color: '#BDC3C7',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 24
  },

  pagination: {
    flexDirection: 'row',
    marginTop: 40
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 5
  },

  activeDot: {
    backgroundColor: '#27AE60',
    width: 20
  },

  footer: {
    padding: 20,
    paddingBottom: 40
  },

  btnNext: {
    backgroundColor: '#27AE60',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15
  },

  btnNextText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },

  btnSkip: {
    color: '#BDC3C7',
    textAlign: 'center',
    fontSize: 14
  }
});