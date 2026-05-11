import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Relatorios() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Header Padrão */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Relatórios</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Seletor de Mês */}
        <View style={styles.monthSelector}>
          <TouchableOpacity><MaterialCommunityIcons name="chevron-left" size={24} color="#1B365D" /></TouchableOpacity>
          <Text style={styles.monthText}>Março 2025</Text>
          <TouchableOpacity><MaterialCommunityIcons name="chevron-right" size={24} color="#1B365D" /></TouchableOpacity>
        </View>

        {/* Grid de Resumo */}
        <View style={styles.summaryGrid}>
          <View style={styles.smallCard}>
            <Text style={styles.smallCardLabel}>Entradas</Text>
            <Text style={[styles.smallCardValue, { color: '#27AE60' }]}>R$ 6.200</Text>
          </View>
          <View style={styles.smallCard}>
            <Text style={styles.smallCardLabel}>Saídas</Text>
            <Text style={[styles.smallCardValue, { color: '#E74C3C' }]}>R$ 3.780</Text>
          </View>
          <View style={styles.smallCard}>
            <Text style={styles.smallCardLabel}>Saldo</Text>
            <Text style={styles.smallCardValue}>R$ 2.420</Text>
          </View>
          <View style={styles.smallCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialCommunityIcons name="home-outline" size={16} color="#555" />
              <Text style={[styles.smallCardLabel, { marginLeft: 4 }]}>Maior Gasto</Text>
            </View>
            <Text style={[styles.smallCardValue, { color: '#F39C12' }]}>Moradia</Text>
          </View>
        </View>

        {/* Entradas vs Saídas Visual */}
        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Entradas vs Saídas</Text>
          <View style={styles.comparisonRow}>
            <View style={styles.comparisonBox}>
               <View style={[styles.barVisual, { backgroundColor: '#27AE60', height: 60 }]} />
               <Text style={[styles.barLabel, { color: '#27AE60' }]}>Entradas</Text>
            </View>
            <View style={styles.comparisonBox}>
               <View style={[styles.barVisual, { backgroundColor: '#E74C3C', height: 40 }]} />
               <Text style={[styles.barLabel, { color: '#E74C3C' }]}>Saídas</Text>
            </View>
          </View>
        </View>

        {/* Top Categorias */}
        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Top Categorias</Text>
          
          <RankingItem icon="home" label="Moradia" value="R$ 1800" color="#F39C12" percent={85} />
          <RankingItem icon="pizza" label="Alimentação" value="R$ 980" color="#27AE60" percent={60} />
          <RankingItem icon="car" label="Transporte" value="R$ 420" color="#2980B9" percent={30} />
        </View>

        {/* Botão Exportar PDF */}
        <TouchableOpacity style={styles.exportButton}>
          <MaterialCommunityIcons name="file-pdf-box" size={20} color="#FFF" />
          <Text style={styles.exportButtonText}>Exportar PDF</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const RankingItem = ({ icon, label, value, color, percent }: any) => (
  <View style={styles.rankingContainer}>
    <View style={styles.rankingHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MaterialCommunityIcons name={icon} size={18} color="#555" />
        <Text style={styles.rankingLabel}>{label}</Text>
      </View>
      <Text style={styles.rankingValue}>{value}</Text>
    </View>
    <View style={styles.rankBarBg}>
      <View style={[styles.rankBarFill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1B365D', height: 60, justifyContent: 'center', paddingHorizontal: 20 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  monthSelector: {
    backgroundColor: '#FFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
  },
  monthText: { fontSize: 16, fontWeight: 'bold', color: '#1B365D' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  smallCard: {
    backgroundColor: '#FFF',
    width: '48%',
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
    justifyContent: 'center',
  },
  smallCardLabel: { fontSize: 12, color: '#95A5A6', marginBottom: 5 },
  smallCardValue: { fontSize: 18, fontWeight: 'bold', color: '#1B365D' },
  chartCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1B365D', marginBottom: 20 },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-around' },
  comparisonBox: { alignItems: 'center', width: '40%' },
  barVisual: { width: '100%', borderRadius: 10, marginBottom: 10 },
  barLabel: { fontSize: 12, fontWeight: 'bold' },
  rankingContainer: { marginBottom: 15 },
  rankingHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rankingLabel: { marginLeft: 8, fontSize: 14, color: '#2C3E50', fontWeight: '500' },
  rankingValue: { fontSize: 14, fontWeight: 'bold', color: '#1B365D' },
  rankBarBg: { height: 6, backgroundColor: '#F0F2F5', borderRadius: 3 },
  rankBarFill: { height: '100%', borderRadius: 3 },
  exportButton: {
    backgroundColor: '#1B365D',
    flexDirection: 'row',
    height: 55,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  exportButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
});