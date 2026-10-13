import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { acquireReceiptDocument, releaseReceiptDocument } from '../services/receiptAcquisitionService';
import { receiptAnalysisService } from '../services/receiptAnalysisService';
import type { ReceiptAnalysisContext, ReceiptAnalysisResult, ReceiptDocument, ReceiptSource } from '../types/receipt';

interface ReceiptImportSectionProps {
  categories: ReceiptAnalysisContext['categories'];
  onApply: (result: ReceiptAnalysisResult) => boolean;
  disabled?: boolean;
}

export default function ReceiptImportSection(props: ReceiptImportSectionProps) {
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'selecting' | 'selected' | 'analyzing' | 'success' | 'partial' | 'cancelled' | 'error'>('idle');
  const [selectedDocument, setSelectedDocument] = useState<ReceiptDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [analysisMessage, setAnalysisMessage] = useState('');
  const operationRef = useRef<AbortController | null>(null);
  const documentRef = useRef<ReceiptDocument | null>(null);
  const isFocused = useIsFocused();
  const propsRef = useRef(props);
  propsRef.current = props;
  const busy = status === 'selecting' || status === 'analyzing';

  const cancelSelection = () => {
    operationRef.current?.abort();
    operationRef.current = null;
    setStatus('cancelled');
  };

  const closeOptions = () => {
    if (operationRef.current) cancelSelection();
    setOptionsVisible(false);
  };

  useEffect(() => {
    if (!isFocused) {
      operationRef.current?.abort();
      operationRef.current = null;
      if (documentRef.current) releaseReceiptDocument(documentRef.current);
      documentRef.current = null;
      setSelectedDocument(null);
      setStatus('idle');
      setOptionsVisible(false);
    }
  }, [isFocused]);

  useEffect(() => () => {
    operationRef.current?.abort();
    operationRef.current = null;
    if (documentRef.current) releaseReceiptDocument(documentRef.current);
    documentRef.current = null;
  }, []);

  const selectDocument = async (source: ReceiptSource) => {
    if (operationRef.current || propsRef.current.disabled) return;
    const controller = new AbortController();
    operationRef.current = controller;
    setErrorMessage('');
    setStatus('selecting');

    try {
      // A chamada inicia o seletor web no mesmo evento de clique, antes de qualquer await.
      const result = await acquireReceiptDocument(source, controller.signal);
      if (operationRef.current !== controller || controller.signal.aborted) {
        if (result.status === 'selected') releaseReceiptDocument(result.document);
        return;
      }
      if (result.status === 'error') {
        setErrorMessage(result.message);
        setStatus('error');
        return;
      }
      if (result.status === 'cancelled') {
        setStatus('cancelled');
        return;
      }

      if (documentRef.current) releaseReceiptDocument(documentRef.current);
      documentRef.current = result.document;
      setSelectedDocument(result.document);
      setStatus('selected');
      setStatus('analyzing');
      const analysis = await receiptAnalysisService.analyze(
        result.document, { categories: propsRef.current.categories }, controller.signal
      );
      if (operationRef.current !== controller || controller.signal.aborted) return;
      if (analysis.status === 'success' || analysis.status === 'partial') {
        if (propsRef.current.disabled || !propsRef.current.onApply(analysis)) {
          setStatus('cancelled');
          return;
        }
        setAnalysisMessage(analysis.message);
        setStatus(analysis.status);
      } else if (analysis.status === 'error') {
        setErrorMessage(analysis.message);
        setStatus('error');
      } else {
        setStatus('cancelled');
      }
    } catch {
      if (operationRef.current === controller && !controller.signal.aborted) {
        setErrorMessage('Não foi possível analisar a nota. Continue preenchendo manualmente ou tente novamente.');
        setStatus('error');
      }
    } finally {
      if (operationRef.current === controller) operationRef.current = null;
    }
  };

  const notice = status === 'selecting'
    ? 'Aguardando seleção... Você pode cancelar e continuar preenchendo manualmente.'
    : status === 'analyzing'
      ? 'Analisando nota fiscal... Análise simulada, sem leitura real do documento.'
      : status === 'success' || status === 'partial'
        ? analysisMessage
        : status === 'selected'
          ? 'Arquivo selecionado.'
          : status === 'cancelled'
            ? 'Operação cancelada. Os campos do formulário foram preservados.'
            : status === 'error'
              ? errorMessage
              : 'Selecione JPG/JPEG, PNG ou PDF de até 10 MB. A análise retorna dados simulados e pode substituir campos preenchidos. Nenhum documento será enviado a serviços externos.';

  return (
    <>
      <TouchableOpacity
        style={styles.importButton}
        accessibilityRole="button"
        disabled={props.disabled}
        accessibilityState={{ disabled: !!props.disabled }}
        onPress={() => {
          Keyboard.dismiss();
          setOptionsVisible(true);
        }}
      >
        <MaterialCommunityIcons name="receipt" size={20} color="#1B365D" />
        <Text style={styles.buttonText}>Importar nota fiscal</Text>
      </TouchableOpacity>

      {(status === 'success' || status === 'partial') && (
        <Text style={styles.formNotice} accessibilityLiveRegion="polite">
          {status === 'partial'
            ? 'Leitura parcial simulada. Revise os campos antes de salvar.'
            : 'Dados simulados preenchidos. Revise antes de salvar.'}
        </Text>
      )}

      <Modal
        visible={optionsVisible && isFocused}
        transparent
        animationType="fade"
        onRequestClose={closeOptions}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Importar nota fiscal</Text>
              <Text style={styles.description}>Como deseja selecionar a nota?</Text>

              <TouchableOpacity
                style={styles.option}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => selectDocument('camera')}
              >
                <MaterialCommunityIcons name="camera-outline" size={22} color="#1B365D" />
                <Text style={styles.buttonText}>Tirar foto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => selectDocument('file')}
              >
                <MaterialCommunityIcons name="file-outline" size={22} color="#1B365D" />
                <Text style={styles.buttonText}>Escolher arquivo</Text>
              </TouchableOpacity>

              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {notice}
              </Text>

              {status === 'analyzing' && (
                <ActivityIndicator color="#1B365D" accessibilityLabel="Analisando nota fiscal, simulação" />
              )}

              {selectedDocument && (
                <Text style={styles.notice} numberOfLines={3}>
                  Documento: {selectedDocument.name}{'\n'}
                  {(selectedDocument.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
              )}

              {Platform.OS === 'web' && (
                <Text style={styles.notice}>
                  No navegador, Tirar foto usa a câmera quando o dispositivo permite.
                  Caso o navegador abra um seletor de imagens, escolha uma foto existente
                  ou use Escolher arquivo. Se o cancelamento não for detectado, toque em Cancelar seleção.
                </Text>
              )}

              {busy && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  accessibilityRole="button"
                  onPress={cancelSelection}
                >
                  <Text style={styles.cancelText}>
                    {status === 'analyzing' ? 'Cancelar análise' : 'Cancelar seleção'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                accessibilityRole="button"
                onPress={closeOptions}
              >
                <Text style={styles.cancelText}>Voltar ao formulário</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDE3EA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    backgroundColor: '#F8F9FA'
  },
  buttonText: {
    color: '#1B365D',
    fontWeight: 'bold',
    marginLeft: 8,
    flexShrink: 1
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FFF'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B365D',
    marginBottom: 8
  },
  description: {
    color: '#555',
    marginBottom: 16
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10
  },
  notice: {
    color: '#555',
    fontSize: 13,
    lineHeight: 19,
    marginVertical: 8
  },
  formNotice: {
    color: '#7D6608',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12
  },
  cancelButton: {
    padding: 12,
    alignItems: 'center',
    marginTop: 8
  },
  cancelText: {
    color: '#1B365D',
    fontWeight: 'bold'
  }
});
