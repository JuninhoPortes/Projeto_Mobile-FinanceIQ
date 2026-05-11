import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Categorias() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Header fixo igual ao de Lançamentos */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Categorias</Text>
        <TouchableOpacity style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          
          <CategoryCard 
            icon="home-variant" 
            name="Moradia" 
            spent={1800} 
            limit={2000} 
            color="#F39C12" 
          />
          
          <CategoryCard 
            icon="pizza" 
            name="Alimentação" 
            spent={980} 
            limit={1200} 
            color="#27AE60" 
          />

          <CategoryCard 
            icon="car" 
            name="Transporte" 
            spent={420} 
            limit={500} 
            color="#2980B9" 
          />

          <CategoryCard 
            icon="pill" 
            name="Saúde" 
            spent={310} 
            limit={400} 
            color="#E74C3C" 
          />

          <CategoryCard 
            icon="theater" 
            name="Lazer" 
            spent={580} 
            limit={500} 
            color="#E74C3C" 
            isExceeded 
          />

          <CategoryCard 
            icon="book-open-variant" 
            name="Educação" 
            spent={280} 
            limit={400} 
            color="#1B365D" 
          />

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Componente para o Card de Categoria
const CategoryCard = ({ icon, name, spent, limit, color, isExceeded }: any) => {
  const progress = (spent / limit) * 100;
  
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={icon} size={22} color="#555" />
        </View>
        {isExceeded && (
          <View style={styles.exceededBadge}>
            <Text style={styles.exceededText}>Excedido</Text>
          </View>
        )}
      </View>

      <Text style={styles.categoryName}>{name}</Text>
      
      {/* Barra de Progresso */}
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress > 100 ? 100 : progress}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.priceText}>
        R$ {spent} <Text style={styles.limitText}>/ R$ {limit}</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#1B365D',
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  addButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { padding: 15, paddingBottom: 100 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#FFF',
    width: '48%', // Garante dois cards por linha com um pequeno espaço
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    backgroundColor: '#F0F4F8',
    padding: 8,
    borderRadius: 12,
  },
  exceededBadge: {
    backgroundColor: '#FDEDEC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  exceededText: { color: '#A93226', fontSize: 10, fontWeight: 'bold' },
  categoryName: { fontSize: 16, fontWeight: 'bold', color: '#1B365D', marginBottom: 8 },
  progressBarBg: {
    height: 6,
    backgroundColor: '#EAECEE',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', borderRadius: 3 },
  priceText: { fontSize: 12, fontWeight: 'bold', color: '#7F8C8D' },
  limitText: { fontWeight: 'normal', color: '#BDC3C7' },
});