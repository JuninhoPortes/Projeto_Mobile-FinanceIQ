# FinanceIQ

**FinanceIQ** é um aplicativo mobile de controle financeiro pessoal desenvolvido com **React Native**, **Expo** e **TypeScript**. A aplicação permite registrar receitas e despesas, organizar gastos por categorias, acompanhar o desempenho financeiro mensal, gerar relatórios, definir metas financeiras e receber orientações automáticas baseadas em regras e cálculos.

Os dados do usuário são persistidos em nuvem com **Firebase Authentication** e **Cloud Firestore**, permitindo que as informações permaneçam associadas à conta autenticada e possam ser acessadas em diferentes dispositivos.

Além do aplicativo mobile, o projeto possui uma API própria em **Node.js + Express + TypeScript**, consumida via **Axios**, responsável por:

- simular recursos de **Open Finance Mock**;
- fornecer **Indicadores Econômicos reais** para a Dashboard;
- separar a camada mobile do consumo direto de serviços externos.

> O Open Finance implementado no projeto é um **mock acadêmico**. Ele não se conecta a bancos reais e não solicita credenciais bancárias reais.

---

## Funcionalidades

### Autenticação de usuários

O sistema utiliza **Firebase Authentication**, permitindo:

- criação de novas contas;
- login com e-mail e senha;
- logout seguro;
- identificação individual por `uid` do Firebase;
- separação dos dados financeiros por usuário.

Cada usuário autenticado acessa apenas os dados associados à própria conta dentro da lógica da aplicação.

---

### Onboarding inicial

Na primeira abertura do aplicativo em um dispositivo, o usuário visualiza uma sequência de telas introdutórias com uma apresentação das principais funcionalidades do FinanceIQ.

Após concluir ou pular o onboarding, o app registra localmente essa informação por meio do **AsyncStorage**.

Fluxo:

```text
Primeira abertura no dispositivo
→ Onboarding
→ Login/Cadastro
```

Nas próximas aberturas no mesmo dispositivo, o onboarding não é exibido novamente.

---

### Cadastro e configuração de perfil

Ao criar uma nova conta, o usuário é direcionado para a tela de configuração inicial.

Nessa etapa são definidos:

- salário mensal;
- perfil de risco:
  - Conservador;
  - Moderado;
  - Agressivo.

O perfil de risco é persistido na coleção `users` do Firestore.

O salário mensal é registrado como uma transação fixa positiva chamada **Salário Mensal**, mantendo a lógica financeira centralizada no módulo de lançamentos.

Fluxo:

```text
Criar Conta
→ Configurar Perfil
→ Tela Principal
```

---

## Lançamentos financeiros

A tela de lançamentos permite registrar e administrar movimentações financeiras positivas e negativas.

Tipos de lançamento:

```text
income  → Entrada
outcome → Saída
```

### Lançamentos fixos

O sistema cria automaticamente, por período mensal, quatro lançamentos fixos:

- Salário Mensal;
- Moradia;
- Transporte;
- Alimentação.

Esses lançamentos são criados inicialmente com valor `0` e não podem ser excluídos.

Durante a edição de um lançamento fixo, o usuário pode escolher entre:

- **Adicionar ao valor atual**;
- **Substituir o valor atual**.

Exemplo:

```text
Valor atual: R$ 30,00
Valor informado: R$ 20,00

Adicionar    → R$ 50,00
Substituir   → R$ 20,00
```

### Lançamentos personalizados

O usuário também pode cadastrar movimentações adicionais, por exemplo:

- Netflix;
- Uber;
- iFood;
- Freelance;
- PIX recebido;
- Academia;
- Mercado.

Lançamentos personalizados podem ter valor, descrição, categoria e período editados, além de poderem ser excluídos.

---

## Controle mensal dos lançamentos

O FinanceIQ trabalha com uma referência mensal para organizar os dados financeiros.

As transações utilizam campos como:

```text
date         → data real do lançamento
period_month → mês de referência no formato AAAA-MM
```

Exemplo:

```text
2026-09
```

Essa estrutura permite:

- visualizar lançamentos por mês;
- manter lançamentos fixos independentes para cada período;
- gerar relatórios mensais;
- diferenciar mês atual de meses já encerrados;
- preparar comparações e análises históricas.

---

## Categorias financeiras

O FinanceIQ possui um módulo de categorias persistido no **Cloud Firestore**.

### Categorias padrão

O sistema possui categorias iniciais como:

- Moradia;
- Alimentação;
- Transporte;
- Saúde;
- Lazer;
- Educação;
- Compras;
- Outros;
- Receita.

As categorias padrão podem ser ajustadas, mas não podem ser excluídas.

### Categorias personalizadas

O usuário pode criar suas próprias categorias, definindo:

- nome;
- ícone;
- cor;
- limite mensal;
- tipo.

Categorias personalizadas podem ser excluídas sem apagar os lançamentos antigos relacionados a elas.

### Limites mensais

Cada categoria de saída pode possuir um limite mensal.

O FinanceIQ calcula automaticamente:

- total gasto na categoria;
- valor restante;
- percentual utilizado;
- situação atual da categoria.

Status utilizados:

```text
controlado
atencao
proximo_limite
excedido
sem_limite
```

As regras atuais utilizam referências como:

```text
60%  → atenção
85%  → próximo do limite
100% → excedido
```

---

## Sugestão automática de categorias

O FinanceIQ possui um mecanismo de sugestão de categorias baseado em **palavras-chave e correspondência com categorias cadastradas pelo usuário**.

Exemplos:

```text
Netflix → Lazer
Uber    → Transporte
iFood   → Alimentação
```

Compras como supermercado, Amazon, Shopee e lojas podem gerar sugestão para a categoria **Compras**.

Para categorias personalizadas:

- digitar parte do nome pode apresentar a opção **Usar categoria**;
- digitar o nome completo pode selecionar a categoria automaticamente.

Esse recurso é baseado em regras locais e não depende de API de IA paga.

---

## Educação financeira e análises por regras

O FinanceIQ utiliza serviços de análise para gerar orientações educativas a partir dos dados financeiros registrados.

Essas mensagens são produzidas por regras e cálculos definidos no próprio projeto, sem uso obrigatório de modelos generativos externos.

Entre as análises estão:

- acompanhamento do limite mensal;
- identificação de categorias próximas ou acima do limite;
- mensagens educativas sem julgamento;
- cálculo de economia ou excesso mensal;
- projeções em horizontes de 6, 12 e 24 meses.

O objetivo é apresentar informações úteis de forma clara e amigável, evitando tratar projeções como garantias de resultado.

---

## Dashboard financeira

A Dashboard é a tela principal após o login e apresenta uma visão consolidada da situação financeira do usuário.

O saldo disponível é calculado por:

```text
Saldo Disponível = Total de Entradas - Total de Saídas
```

A Dashboard atual apresenta:

- saudação ao usuário;
- saldo disponível;
- panorama financeiro do mês;
- metas financeiras em destaque;
- indicadores econômicos;
- histórico recente de lançamentos.

### Panorama do mês

O card **Panorama do mês** utiliza os mesmos dados do módulo de relatórios para apresentar um resumo rápido do período atual.

Ele pode exibir:

- gasto acumulado;
- valor planejado nas categorias;
- valor restante ou excedido;
- percentual de uso do planejamento;
- categoria de maior impacto no mês;
- status visual do período.

Exemplos de status:

```text
Dentro do planejado
Mês em atenção
Perto do limite
Acima do planejado
Sem despesas
```

### Metas em destaque

A Dashboard também possui um card de **Metas em destaque**.

Esse card apresenta um resumo das metas financeiras e funciona como acesso à tela completa de metas, sem adicionar uma nova opção fixa à barra inferior de navegação.

A navegação principal continua com:

```text
Início | Lançamentos | Categorias | Relatórios | Perfil
```

---

## Metas Financeiras

O FinanceIQ possui um módulo de metas financeiras persistido no **Cloud Firestore**.

Cada meta pode possuir:

- nome;
- descrição;
- valor-alvo;
- valor atual;
- aporte mensal planejado;
- prazo;
- ícone;
- cor;
- status de conclusão.

O usuário pode:

- criar metas;
- editar metas;
- excluir metas;
- adicionar um valor ao progresso atual;
- substituir o valor acumulado;
- concluir uma meta;
- reabrir uma meta concluída.

### Assistente FinanceIQ para metas

O módulo calcula automaticamente:

- percentual concluído;
- valor restante;
- quantidade estimada de meses para conclusão;
- relação entre aporte mensal e prazo definido;
- prioridade das metas exibidas em destaque.

Status possíveis incluem:

```text
Concluída
Quase lá
Em andamento
Prazo apertado
Atrasada
Sem aporte
```

As mensagens do **Assistente FinanceIQ** são geradas por regras e projeções matemáticas, sem depender de uma API de inteligência artificial paga.

---

## Relatórios financeiros

A tela de relatórios permite analisar o histórico financeiro por período mensal.

O usuário pode navegar entre os meses utilizando o seletor de período.

O relatório calcula:

- total de entradas;
- total de saídas;
- saldo do período;
- limite total planejado nas categorias;
- valor restante em relação ao planejamento;
- quantidade de lançamentos;
- categoria de maior gasto;
- principais categorias do período;
- proporção entre entradas e saídas;
- insight financeiro consolidado.

As mensagens são adaptadas ao contexto:

- no mês atual, a análise utiliza linguagem como **até agora neste mês**;
- em meses encerrados, o relatório utiliza uma visão consolidada do período selecionado.

---

## Exportação de relatório em PDF

Os relatórios financeiros podem ser exportados em **PDF** diretamente pelo aplicativo.

O serviço utiliza principalmente:

- `expo-print`;
- `expo-file-system`.

O PDF inclui:

- identificação do FinanceIQ;
- período analisado;
- resumo financeiro;
- entradas e saídas;
- principais categorias;
- análise por categoria;
- insight financeiro;
- detalhes do relatório.

No Android, o usuário pode escolher uma pasta de destino por meio do **Storage Access Framework**.

Em outras plataformas compatíveis, o arquivo pode ser salvo no diretório de documentos da aplicação.

---

## Indicadores Econômicos

O FinanceIQ consome indicadores econômicos por meio da API própria `financeiq-api`.

Os indicadores exibidos são:

- Selic;
- IPCA;
- Dólar Comercial.

Os dados são obtidos a partir de fontes externas públicas, enquanto o backend do FinanceIQ centraliza o tratamento das respostas.

Fontes utilizadas atualmente:

```text
Selic          → BrasilAPI
IPCA           → BrasilAPI
Dólar Comercial → ExchangeRate-API
```

Endpoints:

```text
GET /indicators/selic
GET /indicators/ipca
GET /indicators/dollar
GET /indicators/summary
```

Fluxo:

```text
Dashboard
→ Axios
→ financeiq-api
→ APIs públicas externas
→ tratamento dos dados
→ retorno para o aplicativo
```

---

## Open Finance Mock

O FinanceIQ possui uma área de **Open Finance Mock**, implementada com uma API própria em Node.js e Express.

A funcionalidade permite simular:

- instituições financeiras;
- autorização de bancos;
- concessão de permissões;
- visualização de detalhes de conta;
- saldo simulado;
- transações bancárias simuladas;
- sincronização com o aplicativo;
- persistência das transações no Firestore.

Permissões simuladas:

- leitura de saldo;
- histórico de transações;
- dados cadastrais.

Fluxo principal:

```text
Perfil
→ Open Finance
→ Autorizar banco
→ Conceder permissões
→ Sincronizar dados
→ Persistir transações no Firestore
```

> A integração é exclusivamente acadêmica e não utiliza credenciais ou informações bancárias reais.

---

### Saldo autorizado simulado

O campo **Saldo autorizado simulado** representa a soma dos saldos calculados das instituições autorizadas.

O saldo de cada banco é obtido a partir das transações simuladas:

```text
Saldo do banco = Total de entradas - Total de saídas
```

Esse saldo é utilizado somente na área de Open Finance Mock.

A Dashboard continua utilizando as transações efetivamente sincronizadas e persistidas no Firestore.

---

### Persistência das transações Open Finance Mock

Após autorização e confirmação de sincronização, as transações mockadas podem ser persistidas na coleção `transactions`.

Campos adicionais incluem:

- `external_id`;
- `source`;
- `bank_name`;
- `account_id`;
- `original_date`;
- `imported_at`;
- `period_month`.

Exemplo simplificado:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Supermercado",
  "amount": 360.6,
  "type": "outcome",
  "category": "Alimentação",
  "source": "open_finance_mock",
  "external_id": "of_UID_DO_USUARIO_nubank_002",
  "bank_name": "Nubank",
  "account_id": "acc_nubank_mock",
  "original_date": "2026-05-22",
  "period_month": "2026-05",
  "imported_at": "timestamp",
  "date": "timestamp"
}
```

O campo `external_id` evita duplicidade durante novas sincronizações.

---

### Consentimentos do Open Finance

Os bancos autorizados e as permissões concedidas são persistidos no Firestore.

A coleção de consentimentos mantém informações como:

- usuário;
- instituição;
- conta simulada;
- permissões;
- status de conexão;
- última sincronização;
- datas de criação e atualização.

Ao desconectar um banco, o consentimento correspondente é removido e as transações importadas daquela instituição também podem ser removidas do histórico do FinanceIQ.

---

## Tecnologias utilizadas

### Aplicativo mobile

- React Native;
- Expo;
- TypeScript;
- Firebase Authentication;
- Cloud Firestore;
- AsyncStorage;
- React Navigation;
- Axios;
- Expo Vector Icons;
- Expo Print;
- Expo File System.

### Backend

- Node.js;
- Express;
- TypeScript;
- Axios;
- CORS;
- dotenv;
- ts-node-dev.

---

## Estrutura atual do projeto

```text
Projeto_Mobile-FinanceIQ
├── assets
├── financeiq-api
│   ├── src
│   │   ├── controllers
│   │   │   ├── indicatorsController.ts
│   │   │   └── openFinanceController.ts
│   │   ├── routes
│   │   │   ├── indicatorsRoutes.ts
│   │   │   └── openFinanceRoutes.ts
│   │   ├── services
│   │   │   ├── indicatorsMockService.ts
│   │   │   └── openFinanceMockService.ts
│   │   └── server.ts
│   ├── .env.example
│   ├── package-lock.json
│   ├── package.json
│   └── tsconfig.json
│
├── src
│   ├── constants
│   │   ├── categoryKeywords.ts
│   │   ├── defaultCategories.ts
│   │   └── financialRules.ts
│   │
│   ├── database
│   │   ├── categoryService.ts
│   │   ├── goalService.ts
│   │   ├── initializeDatabase.ts
│   │   ├── openFinanceConsentService.ts
│   │   ├── transactionService.ts
│   │   └── userProfileService.ts
│   │
│   ├── pages
│   │   ├── Index.tsx
│   │   └── Login.tsx
│   │
│   ├── screens
│   │   ├── Categorias.tsx
│   │   ├── ConfiguracaoPerfil.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Lancamentos.tsx
│   │   ├── MetasFinanceiras.tsx
│   │   ├── Onboarding.tsx
│   │   ├── OpenFinance.tsx
│   │   ├── OpenFinanceBankDetails.tsx
│   │   ├── Perfil.tsx
│   │   └── Relatorios.tsx
│   │
│   ├── services
│   │   ├── api.ts
│   │   ├── categoryAnalysisService.ts
│   │   ├── categorySuggestionService.ts
│   │   ├── economicIndicatorsService.ts
│   │   ├── financialEducationService.ts
│   │   ├── goalAnalysisService.ts
│   │   ├── openFinanceService.ts
│   │   ├── periodService.ts
│   │   ├── reportAnalysisService.ts
│   │   └── reportPdfService.ts
│   │
│   ├── AppNavigator.tsx
│   └── routes.tsx
│
├── .gitignore
├── app.json
├── App.tsx
├── firebaseConfig.ts
├── index.ts
├── package-lock.json
├── package.json
├── README.md
└── tsconfig.json
```

---

## Principais arquivos e responsabilidades

### `firebaseConfig.ts`

Inicializa o Firebase e exporta as instâncias utilizadas pelo aplicativo:

```text
auth
db
app
```

---

### `src/services/api.ts`

Centraliza a configuração do Axios para comunicação com o backend.

No repositório, mantenha um endereço genérico:

```ts
const API_BASE_URL = 'http://IP_DO_COMPUTADOR:3000';
```

Durante testes em celular físico com Expo Go, é necessário utilizar temporariamente o IP da máquina que está executando a API.

Não versione IPs locais específicos.

---

### `src/database/transactionService.ts`

Responsável por:

- criar lançamentos fixos por período;
- listar lançamentos do usuário;
- listar lançamentos de um mês específico;
- adicionar lançamentos;
- atualizar lançamentos;
- atualizar valores;
- excluir lançamentos personalizados;
- importar transações do Open Finance Mock;
- evitar duplicidade por `external_id`;
- remover transações importadas ao desconectar uma instituição.

---

### `src/database/categoryService.ts`

Responsável por:

- criar categorias padrão por usuário;
- listar categorias ativas;
- criar categorias personalizadas;
- atualizar categorias;
- atualizar limites mensais;
- remover categorias personalizadas.

---

### `src/database/goalService.ts`

Responsável pela persistência das metas financeiras:

- listar metas do usuário;
- criar meta;
- editar meta;
- adicionar valor;
- substituir valor acumulado;
- concluir meta;
- reabrir meta;
- excluir meta.

---

### `src/services/categorySuggestionService.ts`

Executa a sugestão automática de categorias com base em:

- palavras-chave;
- categorias padrão;
- categorias personalizadas;
- correspondência parcial ou exata com o nome digitado.

---

### `src/services/categoryAnalysisService.ts`

Analisa os gastos por categoria no período selecionado e calcula:

- gasto;
- limite;
- restante;
- percentual utilizado;
- status;
- insight financeiro.

---

### `src/services/financialEducationService.ts`

Gera mensagens educativas e projeções financeiras por regras.

Inclui projeções aproximadas para:

```text
6 meses
12 meses
24 meses
```

---

### `src/services/periodService.ts`

Centraliza a lógica de períodos mensais.

É utilizado para:

- mês atual;
- mês anterior;
- próximo mês;
- conversão para `period_month`;
- identificação de período atual ou fechado.

---

### `src/services/reportAnalysisService.ts`

Responsável por gerar o resumo financeiro mensal exibido nos relatórios e reutilizado no Panorama da Dashboard.

---

### `src/services/reportPdfService.ts`

Responsável por gerar o relatório mensal em PDF e salvar o arquivo no dispositivo.

---

### `src/services/goalAnalysisService.ts`

Analisa as metas financeiras e calcula:

- progresso;
- valor restante;
- previsão de conclusão;
- situação em relação ao prazo;
- mensagens do Assistente FinanceIQ;
- metas prioritárias para destaque.

---

### `src/screens/Dashboard.tsx`

Tela inicial após o login.

Responsável por exibir:

- saudação;
- saldo disponível;
- Panorama do mês;
- Metas em destaque;
- indicadores econômicos;
- histórico recente.

---

### `src/screens/Categorias.tsx`

Gerencia categorias e limites financeiros.

Permite:

- criar categorias;
- editar limite mensal;
- visualizar detalhes;
- acompanhar progresso mensal;
- acessar orientações educativas;
- excluir categorias personalizadas.

---

### `src/screens/Relatorios.tsx`

Apresenta a análise financeira mensal.

Permite:

- navegar entre meses;
- visualizar entradas e saídas;
- acompanhar saldo;
- visualizar planejamento por categorias;
- analisar principais categorias;
- exportar o período em PDF.

---

### `src/screens/MetasFinanceiras.tsx`

Tela completa para gerenciamento de metas financeiras.

Permite:

- criar e editar objetivos;
- definir valores e prazo;
- acompanhar progresso;
- atualizar valor acumulado;
- visualizar projeção automática;
- concluir, reabrir ou excluir metas.

---

## Backend `financeiq-api`

A API separada possui endpoints para Open Finance Mock e Indicadores Econômicos.

### Rodar o backend

```bash
cd financeiq-api
npm install
npm run dev
```

Por padrão:

```text
http://localhost:3000
```

### Health check

```text
GET /health
```

### Open Finance Mock

```text
GET  /open-finance/accounts/:userId
GET  /open-finance/balances/:userId
GET  /open-finance/transactions/:userId
POST /open-finance/sync/:userId
```

### Indicadores Econômicos

```text
GET /indicators/selic
GET /indicators/ipca
GET /indicators/dollar
GET /indicators/summary
```

---

## Fluxo do aplicativo

### Primeira abertura

```text
Onboarding
→ Login/Cadastro
```

### Cadastro de nova conta

```text
Login
→ Criar Conta
→ Configuração de Perfil
→ Tela Principal
```

### Login em conta existente

```text
Login
→ Entrar
→ Tela Principal
```

### Navegação principal

```text
Início
Lançamentos
Categorias
Relatórios
Perfil
```

### Acesso às Metas Financeiras

```text
Dashboard
→ Metas em destaque
→ Metas Financeiras
```

### Fluxo Open Finance Mock

```text
Perfil
→ Open Finance
→ Autorizar banco
→ Conceder permissões
→ Sincronizar dados
→ Persistir transações no Firestore
→ Dashboard / Lançamentos / Relatórios atualizados
```

---

## Banco de dados

O projeto utiliza o **Cloud Firestore** como banco de dados principal.

### Coleção `users`

Armazena informações de perfil.

Exemplo:

```json
{
  "risk_profile": "Moderado"
}
```

---

### Coleção `transactions`

Armazena lançamentos financeiros.

Exemplo:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Netflix",
  "amount": 39.9,
  "type": "outcome",
  "category": "Lazer",
  "is_fixed": false,
  "source": "manual",
  "period_month": "2026-09",
  "date": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

### Coleção `categories`

Armazena categorias padrão e personalizadas do usuário.

Estrutura conceitual:

```json
{
  "user_id": "UID_DO_USUARIO",
  "name": "Compras",
  "icon": "cart",
  "color": "#8E44AD",
  "monthly_limit": 600,
  "type": "outcome",
  "is_default": true,
  "is_active": true
}
```

---

### Coleção `goals`

Armazena metas financeiras.

Exemplo:

```json
{
  "user_id": "UID_DO_USUARIO",
  "title": "Notebook novo",
  "description": "Equipamento para estudos",
  "target_amount": 4000,
  "current_amount": 1000,
  "monthly_contribution": 500,
  "deadline": "timestamp",
  "icon": "laptop",
  "color": "#1B365D",
  "is_completed": false,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

### Coleção `open_finance_consents`

Armazena consentimentos simulados do Open Finance.

Exemplo simplificado:

```json
{
  "user_id": "UID_DO_USUARIO",
  "bank_id": "nubank",
  "bank_name": "Nubank",
  "connected": true,
  "permissions": {
    "balance": true,
    "transactions": true,
    "personalData": false
  },
  "last_sync": "timestamp"
}
```

---

## Regras do Firestore durante o desenvolvimento

Regras amplas podem ser úteis temporariamente em ambiente acadêmico e de desenvolvimento, mas **não são adequadas para produção**.

Exemplo temporário:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Em uma versão publicada, as regras devem validar a propriedade dos documentos para impedir acesso indevido entre usuários.

---

## Índice do Firestore

Consultas que filtram lançamentos por usuário e ordenam por data podem exigir índice composto.

Exemplo:

```text
Coleção: transactions

Campos:
user_id → Crescente
date    → Decrescente
```

O próprio Firestore pode informar, durante o desenvolvimento, quando um novo índice é necessário.

---

## Instalação

Clone o repositório:

```bash
git clone <url-do-repositorio>
```

Acesse a pasta:

```bash
cd Projeto_Mobile-FinanceIQ
```

Instale as dependências do aplicativo:

```bash
npm install
```

Instale também as dependências da API:

```bash
cd financeiq-api
npm install
```

---

## Configuração do Firebase

Crie um projeto no Firebase e habilite:

- Firebase Authentication;
- login por E-mail/Senha;
- Cloud Firestore.

Configure o arquivo:

```text
firebaseConfig.ts
```

Exemplo de estrutura:

```ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'SUA_API_KEY',
  authDomain: 'SEU_AUTH_DOMAIN',
  projectId: 'SEU_PROJECT_ID',
  storageBucket: 'SEU_STORAGE_BUCKET',
  messagingSenderId: 'SEU_MESSAGING_SENDER_ID',
  appId: 'SEU_APP_ID'
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
```

---

## Executando o projeto

### Backend

Em um terminal:

```bash
cd financeiq-api
npm run dev
```

A API deve informar algo semelhante a:

```text
FinanceIQ API rodando na porta 3000
```

### Aplicativo mobile

Em outro terminal, na raiz do projeto:

```bash
npx expo start
```

Para limpar o cache:

```bash
npx expo start --clear
```

Para abrir no navegador pelo terminal do Expo, pressione:

```text
w
```

---

## Configuração do Axios em dispositivo físico

O arquivo responsável é:

```text
src/services/api.ts
```

No repositório, use um valor genérico:

```ts
const API_BASE_URL = 'http://IP_DO_COMPUTADOR:3000';
```

Durante testes em um celular físico, `localhost` aponta para o próprio celular. Portanto, a URL precisa utilizar temporariamente o endereço da máquina que está executando o backend.

Antes de fazer commit, restaure a versão genérica do arquivo:

```bash
git restore -- src/services/api.ts
```

---

## Observações importantes

### Open Finance

O Open Finance atual é uma **simulação acadêmica**.

Ele não:

- acessa bancos reais;
- solicita senha bancária;
- utiliza credenciais reais;
- representa autorização regulatória real.

---

### Recursos inteligentes

Os recursos inteligentes atualmente implementados utilizam:

- regras;
- palavras-chave;
- cálculos financeiros;
- projeções automáticas;
- interpretação de limites e períodos.

Eles não dependem, nesta versão, de uma API paga de inteligência artificial generativa.

---

### Persistência

Os dados financeiros principais são armazenados no Firestore, incluindo:

- perfil de risco;
- lançamentos;
- períodos financeiros;
- categorias;
- metas;
- transações importadas do Open Finance Mock;
- consentimentos simulados.

Isso permite recuperar os dados após autenticação em outro dispositivo.

---

### SQLite

O projeto ainda pode conter arquivos ou dependências relacionados ao SQLite de versões anteriores.

Entretanto, a lógica principal de persistência foi migrada para o **Cloud Firestore**.

Esses componentes antigos podem ser removidos futuramente caso sejam confirmados como não utilizados.

---

### AsyncStorage

O AsyncStorage é utilizado para estado local simples, como o controle de visualização do onboarding.

Dados financeiros e credenciais não devem ser armazenados nele.

---

### `.env`

O arquivo real do backend:

```text
financeiq-api/.env
```

não deve ser versionado.

O repositório deve manter apenas:

```text
financeiq-api/.env.example
```

Exemplo:

```env
PORT=3000
```

---

## Status atual do projeto

Atualmente o FinanceIQ possui:

- autenticação e cadastro de usuários;
- onboarding inicial;
- configuração de perfil financeiro;
- persistência em Cloud Firestore;
- lançamentos fixos por período;
- lançamentos personalizados;
- controle mensal por `period_month`;
- edição com modo adicionar/substituir em lançamentos fixos;
- categorias padrão e personalizadas;
- limites mensais por categoria;
- análise inteligente das categorias;
- sugestão automática de categoria;
- mensagens de educação financeira;
- Dashboard com saldo dinâmico;
- Panorama do mês;
- histórico recente;
- Indicadores Econômicos reais via API;
- Relatórios financeiros mensais;
- exportação de relatório em PDF;
- Metas Financeiras persistidas no Firestore;
- Assistente FinanceIQ para projeção e acompanhamento de metas;
- card de Metas em destaque na Dashboard;
- Open Finance Mock;
- consentimentos simulados persistidos;
- sincronização de transações mockadas;
- controle de duplicidade por `external_id`;
- tela de detalhes de instituição simulada.

---

## Próximos passos

O projeto está em fase de refinamento e validação acadêmica.

Possíveis evoluções incluem:

- ajustes de usabilidade após feedback de professores e usuários;
- refinamento visual das telas existentes;
- comparação financeira entre períodos;
- gráficos e visualizações adicionais;
- recuperação de senha;
- edição avançada de perfil;
- notificações e lembretes;
- regras mais restritivas no Firestore;
- autenticação das rotas da API com token Firebase;
- hospedagem pública do backend;
- integração real com o ecossistema Open Finance, caso haja infraestrutura e autorização adequadas;
- avaliação com usuários e análise dos resultados para o TCC;
- publicação futura do aplicativo.

---

## Autores

- Ana Beatriz
- Carlos Eduardo
- Evandro Portes

Projeto desenvolvido para fins acadêmicos e práticos como uma aplicação mobile de controle financeiro pessoal.

**Nome do projeto:** FinanceIQ
