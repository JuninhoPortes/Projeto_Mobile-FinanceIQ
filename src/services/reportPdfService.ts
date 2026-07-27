import { Platform } from 'react-native';

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  ReportSummary,
  ReportCategoryItem
} from './reportAnalysisService';

import type { CategoryStatus } from '../constants/financialRules';

interface ExportMonthlyReportOptions {
  userName?: string;
}

interface ExportMonthlyReportResult {
  uri: string;
  saved: boolean;
  cancelled: boolean;
  fileName: string;
}

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const formatPercentage = (value: number) => {
  return `${value.toFixed(1).replace('.', ',')}%`;
};

const formatDateTime = (date: Date) => {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const escapeHtml = (value: string) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const sanitizeFileName = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const createReportFileName = (
  report: ReportSummary
) => {
  const periodName =
    sanitizeFileName(report.period.label);

  const dateSuffix =
    new Date()
      .toISOString()
      .slice(0, 10);

  return `FinanceIQ-Relatorio-${periodName}-${dateSuffix}.pdf`;
};

const getBalanceLabel = (
  status: ReportSummary['balanceStatus']
) => {
  if (status === 'positivo') {
    return 'Saldo positivo';
  }

  if (status === 'negativo') {
    return 'Saldo negativo';
  }

  return 'Saldo neutro';
};

const getBalanceClass = (
  status: ReportSummary['balanceStatus']
) => {
  if (status === 'positivo') {
    return 'positive';
  }

  if (status === 'negativo') {
    return 'negative';
  }

  return 'neutral';
};

const getStatusLabel = (
  status: CategoryStatus
) => {
  const labels: Record<CategoryStatus, string> = {
    controlado: 'Controlado',
    atencao: 'Atenção',
    proximo_limite: 'Próximo do limite',
    excedido: 'Limite excedido',
    sem_limite: 'Sem limite'
  };

  return labels[status];
};

const getStatusClass = (
  status: CategoryStatus
) => {
  return `status-${status}`;
};

const getRemainingLabel = (
  category: ReportCategoryItem
) => {
  if (category.limit <= 0) {
    return 'Sem limite definido';
  }

  if (category.remaining >= 0) {
    return `${formatCurrency(category.remaining)} restantes`;
  }

  return `${formatCurrency(Math.abs(category.remaining))} acima`;
};

const getLimitUsage = (
  category: ReportCategoryItem
) => {
  if (category.limit <= 0) {
    return 'Sem limite';
  }

  return formatPercentage(category.percentageOfLimit);
};

const getSafeProgress = (
  value: number
) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(value, 100)
  );
};

const renderCategoryRows = (
  categories: ReportCategoryItem[]
) => {
  if (categories.length === 0) {
    return `
      <tr>
        <td colspan="7" class="empty-cell">
          Nenhuma despesa registrada neste período.
        </td>
      </tr>
    `;
  }

  return categories
    .map((category, index) => {
      const progress =
        getSafeProgress(category.percentageOfLimit);

      return `
        <tr>
          <td class="rank-cell">${index + 1}</td>

          <td>
            <strong>${escapeHtml(category.name)}</strong>
            <span class="muted-text">
              ${category.transactionsCount} lançamento(s)
            </span>
          </td>

          <td>${formatCurrency(category.amount)}</td>

          <td>
            ${
              category.limit > 0
                ? formatCurrency(category.limit)
                : 'Sem limite'
            }
          </td>

          <td>${getRemainingLabel(category)}</td>

          <td>
            <div class="progress-line">
              <div
                class="progress-fill ${getStatusClass(category.status)}"
                style="width: ${progress}%"
              ></div>
            </div>

            <span class="muted-text">
              ${getLimitUsage(category)}
            </span>
          </td>

          <td>
            <span class="status-pill ${getStatusClass(category.status)}">
              ${getStatusLabel(category.status)}
            </span>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderTopCategoryCards = (
  categories: ReportCategoryItem[]
) => {
  const topCategories =
    categories.slice(0, 3);

  if (topCategories.length === 0) {
    return `
      <div class="empty-box">
        Nenhuma categoria de despesa foi identificada neste período.
      </div>
    `;
  }

  return topCategories
    .map((category, index) => {
      return `
        <div class="top-category-card">
          <div class="top-category-rank">
            ${index + 1}
          </div>

          <div class="top-category-content">
            <span class="top-category-name">
              ${escapeHtml(category.name)}
            </span>

            <strong>
              ${formatCurrency(category.amount)}
            </strong>

            <small>
              ${formatPercentage(category.percentageOfExpenses)} das saídas
            </small>
          </div>
        </div>
      `;
    })
    .join('');
};

const buildReportHtml = (
  report: ReportSummary,
  options: ExportMonthlyReportOptions
) => {
  const generatedAt =
    formatDateTime(new Date());

  const userName =
    options.userName?.trim()
      ? options.userName.trim()
      : 'Usuário FinanceIQ';

  const balanceClass =
    getBalanceClass(report.balanceStatus);

  const incomeWidth =
    getSafeProgress(report.incomePercentage);

  const outcomeWidth =
    getSafeProgress(report.outcomePercentage);

  const categories =
    report.topCategories;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />

        <style>
          @page {
            size: A4;
            margin: 24px;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            background: #F4F7FB;
            color: #1F2933;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }

          .document {
            background: #FFFFFF;
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid #E5EAF0;
          }

          .hero {
            background: #1B365D;
            color: #FFFFFF;
            padding: 28px 30px;
          }

          .hero-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }

          .brand {
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
            opacity: 0.86;
            margin-bottom: 10px;
          }

          h1 {
            font-size: 28px;
            margin: 0 0 8px 0;
            line-height: 1.15;
          }

          .subtitle {
            color: #DDE6F0;
            margin: 0;
            line-height: 1.5;
            max-width: 480px;
          }

          .period-pill {
            background: rgba(255, 255, 255, 0.13);
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 16px;
            padding: 12px 14px;
            text-align: right;
            min-width: 165px;
          }

          .period-pill span {
            display: block;
            color: #DDE6F0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 5px;
          }

          .period-pill strong {
            display: block;
            font-size: 17px;
          }

          .content {
            padding: 26px 30px 24px 30px;
          }

          .section {
            margin-bottom: 24px;
            page-break-inside: avoid;
          }

          .section-title {
            font-size: 17px;
            color: #1B365D;
            margin: 0 0 5px 0;
          }

          .section-subtitle {
            color: #6B7280;
            margin: 0 0 14px 0;
            line-height: 1.45;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 18px;
          }

          .info-line {
            background: #F8FAFC;
            border: 1px solid #E5EAF0;
            border-radius: 14px;
            padding: 12px;
          }

          .info-line span {
            display: block;
            color: #6B7280;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 5px;
          }

          .info-line strong {
            color: #1B365D;
            font-size: 13px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
          }

          .summary-card {
            background: #F8FAFC;
            border: 1px solid #E5EAF0;
            border-radius: 16px;
            padding: 14px;
            min-height: 90px;
          }

          .summary-card span {
            display: block;
            color: #6B7280;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 8px;
          }

          .summary-card strong {
            display: block;
            color: #1B365D;
            font-size: 17px;
            line-height: 1.2;
          }

          .summary-card small {
            display: block;
            color: #6B7280;
            margin-top: 7px;
            line-height: 1.35;
          }

          .summary-card.positive strong {
            color: #1E8449;
          }

          .summary-card.negative strong {
            color: #C0392B;
          }

          .summary-card.neutral strong {
            color: #1B365D;
          }

          .movement-box {
            background: #F8FAFC;
            border: 1px solid #E5EAF0;
            border-radius: 18px;
            padding: 16px;
          }

          .movement-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            gap: 16px;
          }

          .movement-item {
            flex: 1;
          }

          .movement-item span {
            display: block;
            color: #6B7280;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 4px;
          }

          .movement-item strong {
            color: #1B365D;
            font-size: 15px;
          }

          .movement-track {
            height: 14px;
            background: #E5EAF0;
            border-radius: 999px;
            overflow: hidden;
            display: flex;
            margin: 14px 0 10px 0;
          }

          .income-bar {
            background: #27AE60;
            height: 100%;
          }

          .outcome-bar {
            background: #E74C3C;
            height: 100%;
          }

          .legend {
            display: flex;
            justify-content: space-between;
            color: #6B7280;
            font-size: 11px;
          }

          .top-categories {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }

          .top-category-card {
            background: #FFFFFF;
            border: 1px solid #E5EAF0;
            border-radius: 16px;
            padding: 13px;
            display: flex;
            gap: 10px;
            align-items: flex-start;
          }

          .top-category-rank {
            width: 26px;
            height: 26px;
            border-radius: 10px;
            background: #EAF0F6;
            color: #1B365D;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .top-category-content {
            flex: 1;
          }

          .top-category-name {
            display: block;
            color: #1B365D;
            font-weight: bold;
            margin-bottom: 5px;
          }

          .top-category-content strong {
            display: block;
            color: #111827;
            font-size: 14px;
            margin-bottom: 4px;
          }

          .top-category-content small {
            color: #6B7280;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E5EAF0;
            border-radius: 14px;
            overflow: hidden;
          }

          th {
            background: #F1F5F9;
            color: #1B365D;
            text-align: left;
            font-size: 11px;
            padding: 11px 10px;
            border-bottom: 1px solid #E5EAF0;
          }

          td {
            padding: 11px 10px;
            border-bottom: 1px solid #EEF2F6;
            vertical-align: top;
            color: #1F2933;
          }

          tr:last-child td {
            border-bottom: 0;
          }

          .rank-cell {
            font-weight: bold;
            color: #1B365D;
            width: 34px;
            text-align: center;
          }

          .muted-text {
            display: block;
            color: #6B7280;
            font-size: 10px;
            margin-top: 4px;
          }

          .progress-line {
            width: 100%;
            height: 8px;
            background: #E5EAF0;
            border-radius: 999px;
            overflow: hidden;
            margin-bottom: 4px;
          }

          .progress-fill {
            height: 100%;
            border-radius: 999px;
          }

          .status-pill {
            display: inline-block;
            border-radius: 999px;
            padding: 5px 8px;
            font-size: 10px;
            font-weight: bold;
            white-space: nowrap;
          }

          .status-controlado {
            background: #EAF7EE;
            color: #1E8449;
          }

          .status-atencao {
            background: #FFF7D6;
            color: #9A6B00;
          }

          .status-proximo_limite {
            background: #FEF0D9;
            color: #B76300;
          }

          .status-excedido {
            background: #FDEDEC;
            color: #C0392B;
          }

          .status-sem_limite {
            background: #EAF0F6;
            color: #1B365D;
          }

          .empty-cell {
            text-align: center;
            color: #6B7280;
            padding: 24px;
          }

          .empty-box {
            background: #F8FAFC;
            border: 1px dashed #CBD5E1;
            border-radius: 16px;
            padding: 18px;
            color: #6B7280;
            text-align: center;
          }

          .insight-box {
            background: #FFF8E7;
            border: 1px solid #F9E6B3;
            border-radius: 18px;
            padding: 18px;
          }

          .insight-label {
            color: #9A6B00;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            font-weight: bold;
            margin-bottom: 8px;
          }

          .insight-title {
            color: #7D6608;
            font-size: 16px;
            margin: 0 0 8px 0;
          }

          .insight-message {
            color: #7D6608;
            line-height: 1.6;
            margin: 0;
          }

          .details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            border: 1px solid #E5EAF0;
            border-radius: 16px;
            overflow: hidden;
          }

          .detail-item {
            padding: 12px;
            border-bottom: 1px solid #E5EAF0;
            border-right: 1px solid #E5EAF0;
          }

          .detail-item:nth-child(2n) {
            border-right: 0;
          }

          .detail-item:nth-last-child(-n + 2) {
            border-bottom: 0;
          }

          .detail-item span {
            display: block;
            color: #6B7280;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            margin-bottom: 5px;
          }

          .detail-item strong {
            color: #1B365D;
            font-size: 13px;
          }

          .footer {
            border-top: 1px solid #E5EAF0;
            padding: 16px 30px;
            color: #6B7280;
            display: flex;
            justify-content: space-between;
            gap: 16px;
            font-size: 10px;
          }
        </style>
      </head>

      <body>
        <div class="document">
          <header class="hero">
            <div class="hero-top">
              <div>
                <div class="brand">FinanceIQ</div>

                <h1>Relatório Financeiro Mensal</h1>

                <p class="subtitle">
                  Análise consolidada de entradas, saídas, saldo e comportamento por categoria.
                </p>
              </div>

              <div class="period-pill">
                <span>Período</span>
                <strong>${escapeHtml(report.period.label)}</strong>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-line">
                <span>Usuário</span>
                <strong>${escapeHtml(userName)}</strong>
              </div>

              <div class="info-line">
                <span>Status do período</span>
                <strong>
                  ${
                    report.period.isCurrentMonth
                      ? 'Mês em andamento'
                      : 'Mês fechado'
                  }
                </strong>
              </div>

              <div class="info-line">
                <span>Situação geral</span>
                <strong>${getBalanceLabel(report.balanceStatus)}</strong>
              </div>

              <div class="info-line">
                <span>Emitido em</span>
                <strong>${generatedAt}</strong>
              </div>
            </div>
          </header>

          <main class="content">
            <section class="section">
              <h2 class="section-title">Resumo financeiro</h2>

              <p class="section-subtitle">
                Visão geral dos principais números registrados no período selecionado.
              </p>

              <div class="summary-grid">
                <div class="summary-card">
                  <span>Entradas</span>
                  <strong>${formatCurrency(report.totalIncome)}</strong>
                  <small>${report.incomeTransactionsCount} lançamento(s)</small>
                </div>

                <div class="summary-card">
                  <span>Saídas</span>
                  <strong>${formatCurrency(report.totalOutcome)}</strong>
                  <small>${report.outcomeTransactionsCount} lançamento(s)</small>
                </div>

                <div class="summary-card ${balanceClass}">
                  <span>Saldo</span>
                  <strong>${formatCurrency(report.balance)}</strong>
                  <small>${getBalanceLabel(report.balanceStatus)}</small>
                </div>

                <div class="summary-card">
                  <span>Planejado nas categorias</span>
                  <strong>${formatCurrency(report.totalPlannedLimit)}</strong>
                  <small>
                    ${
                      report.totalRemainingLimit >= 0
                        ? `${formatCurrency(report.totalRemainingLimit)} restantes`
                        : `${formatCurrency(Math.abs(report.totalRemainingLimit))} acima`
                    }
                  </small>
                </div>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Entradas x Saídas</h2>

              <p class="section-subtitle">
                Comparação entre o volume de entradas e saídas dentro do movimento financeiro do período.
              </p>

              <div class="movement-box">
                <div class="movement-header">
                  <div class="movement-item">
                    <span>Entradas</span>
                    <strong>${formatCurrency(report.totalIncome)}</strong>
                  </div>

                  <div class="movement-item">
                    <span>Saídas</span>
                    <strong>${formatCurrency(report.totalOutcome)}</strong>
                  </div>
                </div>

                <div class="movement-track">
                  <div
                    class="income-bar"
                    style="width: ${incomeWidth}%"
                  ></div>

                  <div
                    class="outcome-bar"
                    style="width: ${outcomeWidth}%"
                  ></div>
                </div>

                <div class="legend">
                  <span>Entradas: ${formatPercentage(report.incomePercentage)}</span>
                  <span>Saídas: ${formatPercentage(report.outcomePercentage)}</span>
                </div>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Categorias de maior impacto</h2>

              <p class="section-subtitle">
                As categorias abaixo representam as maiores despesas identificadas no período.
              </p>

              <div class="top-categories">
                ${renderTopCategoryCards(categories)}
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Análise por categoria</h2>

              <p class="section-subtitle">
                Comparativo entre valor gasto, limite mensal definido e situação de cada categoria.
              </p>

              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Categoria</th>
                    <th>Gasto</th>
                    <th>Limite</th>
                    <th>Restante</th>
                    <th>Uso do limite</th>
                    <th>Situação</th>
                  </tr>
                </thead>

                <tbody>
                  ${renderCategoryRows(categories)}
                </tbody>
              </table>
            </section>

            <section class="section">
              <div class="insight-box">
                <div class="insight-label">
                  Insight financeiro do período
                </div>

                <h2 class="insight-title">
                  ${escapeHtml(report.insightTitle)}
                </h2>

                <p class="insight-message">
                  ${escapeHtml(report.insightMessage)}
                </p>
              </div>
            </section>

            <section class="section">
              <h2 class="section-title">Detalhes do relatório</h2>

              <p class="section-subtitle">
                Informações complementares usadas na geração desta análise.
              </p>

              <div class="details-grid">
                <div class="detail-item">
                  <span>Período analisado</span>
                  <strong>${escapeHtml(report.period.label)}</strong>
                </div>

                <div class="detail-item">
                  <span>Total de lançamentos</span>
                  <strong>${report.totalTransactionsCount}</strong>
                </div>

                <div class="detail-item">
                  <span>Maior categoria</span>
                  <strong>
                    ${
                      report.biggestExpenseCategory
                        ? escapeHtml(report.biggestExpenseCategory.name)
                        : 'Sem despesas'
                    }
                  </strong>
                </div>

                <div class="detail-item">
                  <span>Resultado</span>
                  <strong>${getBalanceLabel(report.balanceStatus)}</strong>
                </div>
              </div>
            </section>
          </main>

          <footer class="footer">
            <span>
              Documento gerado automaticamente pelo FinanceIQ.
            </span>

            <span>
              Relatório de uso acadêmico e gerencial.
            </span>
          </footer>
        </div>
      </body>
    </html>
  `;
};

const savePdfOnAndroid = async (
  base64: string,
  fileName: string
) => {
  const permissions =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

  if (!permissions.granted) {
    return {
      uri: '',
      saved: false,
      cancelled: true
    };
  }

  const fileUri =
    await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'application/pdf'
    );

  await FileSystem.writeAsStringAsync(
    fileUri,
    base64,
    {
      encoding: FileSystem.EncodingType.Base64
    }
  );

  return {
    uri: fileUri,
    saved: true,
    cancelled: false
  };
};

const savePdfOnAppDirectory = async (
  base64: string,
  fileName: string
) => {
  const directory =
    `${FileSystem.documentDirectory}FinanceIQ/`;

  const directoryInfo =
    await FileSystem.getInfoAsync(directory);

  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(
      directory,
      {
        intermediates: true
      }
    );
  }

  const fileUri =
    `${directory}${fileName}`;

  await FileSystem.writeAsStringAsync(
    fileUri,
    base64,
    {
      encoding: FileSystem.EncodingType.Base64
    }
  );

  return {
    uri: fileUri,
    saved: true,
    cancelled: false
  };
};

export const reportPdfService = {
  exportMonthlyReport: async (
    report: ReportSummary,
    options: ExportMonthlyReportOptions = {}
  ): Promise<ExportMonthlyReportResult> => {
    const html =
      buildReportHtml(
        report,
        options
      );

    const fileName =
      createReportFileName(report);

    const file =
      await Print.printToFileAsync({
        html,
        base64: true
      });

    if (!file.base64) {
      throw new Error(
        'Não foi possível gerar o conteúdo do PDF.'
      );
    }

    const savedFile =
      Platform.OS === 'android'
        ? await savePdfOnAndroid(
            file.base64,
            fileName
          )
        : await savePdfOnAppDirectory(
            file.base64,
            fileName
          );

    return {
      uri: savedFile.uri,
      saved: savedFile.saved,
      cancelled: savedFile.cancelled,
      fileName
    };
  }
};