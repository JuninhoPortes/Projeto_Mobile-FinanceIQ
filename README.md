# FinanceIQ

**FinanceIQ** é um aplicativo mobile desenvolvido com **React Native**, **Expo** e **TypeScript**, voltado para controle financeiro pessoal. O app permite cadastro e login de usuários, configuração inicial de perfil financeiro, registro de lançamentos positivos e negativos, acompanhamento de saldo, histórico de movimentações e persistência dos dados em nuvem utilizando **Firebase Authentication** e **Cloud Firestore**.

Além das funcionalidades principais de controle financeiro, o projeto também possui integração com uma API própria em **Node.js + Express**, consumida via **Axios**, responsável por simular recursos de **Open Finance Mock** e fornecer **Indicadores Econômicos** para a Dashboard.

---

## Funcionalidades

### Autenticação de usuários

O sistema possui autenticação integrada com o **Firebase Authentication**, permitindo:

* criação de novas contas;
* login com e-mail e senha;
* logout seguro;
* identificação individual de cada usuário pelo `uid` do Firebase.

Cada usuário possui seus próprios dados financeiros separados no banco de dados.

---

### Onboarding inicial

Na primeira abertura do aplicativo em um dispositivo, o usuário visualiza uma sequência de telas introdutórias apresentando os principais recursos do FinanceIQ.

Após concluir ou pular o onboarding, o app registra localmente que a introdução já foi vista usando **AsyncStorage**.

Fluxo:

```text
Primeira abertura no dispositivo
→ Onboarding
→ Login/Cadastro
```

Nas próximas aberturas, o usuário não verá mais o onboarding naquele dispositivo.

---

### Cadastro e configuração de perfil

Ao criar uma nova conta, o usuário é direcionado para a tela de configuração de perfil.

Nessa tela são definidos:

* salário mensal;
* perfil de risco:

  * Conservador;
  * Moderado;
  * Agressivo.

O perfil de risco é salvo no Firestore na coleção de usuários.

O salário mensal não é salvo diretamente como campo de perfil. Ele é registrado como uma transação fixa positiva chamada **Salário Mensal**, mantendo a lógica financeira centralizada no módulo de lançamentos.

Fluxo:

```text
Criar Conta
→ Configurar Perfil
→ Tela Principal
```

---

### Lançamentos financeiros

A tela de lançamentos permite ao usuário registrar movimentações financeiras positivas e negativas.

O sistema trabalha com quatro lançamentos fixos criados automaticamente para cada usuário:

* Salário Mensal;
* Moradia;
* Transporte;
* Alimentação.

Esses lançamentos são criados com valor inicial `0` e podem ser editados pelo usuário.

Além dos lançamentos fixos, o usuário pode cadastrar novos lançamentos personalizados, como:

* Netflix;
* Uber;
* iFood;
* Freelance;
* PIX recebido;
* Academia;
* Mercado.

Tipos de lançamento:

```text
income  → Entrada
outcome → Saída
```

Os lançamentos fixos não podem ser excluídos. Os lançamentos criados manualmente pelo usuário podem ser excluídos pelo modal de edição.

---

### Dashboard financeira

A Dashboard exibe uma visão geral da situação financeira do usuário.

Ela calcula automaticamente:

```text
Saldo Disponível = Total de Entradas - Total de Saídas
```

Onde:

* entradas são todos os lançamentos do tipo `income`;
* saídas são todos os lançamentos do tipo `outcome`.

A Dashboard mostra:

* total de entradas;
* total de saídas;
* saldo disponível;
* perfil financeiro;
* histórico recente dos lançamentos;
* Indicadores Econômicos consumidos via API.

Nesta versão, a área de **Evolução Mensal** foi temporariamente substituída pelos **Indicadores Econômicos**, pois essa integração já está funcional.

Os blocos futuros de:

* gráficos por categoria;
* metas em destaque;
* sugestão inteligente;
* evolução mensal;

foram previstos como evolução da Dashboard e podem ser integrados posteriormente com os dados da aba **Categorias**, com regras financeiras ou com módulos futuros de metas e recomendações.

---

### Indicadores Econômicos

O app consome uma API de Indicadores Econômicos por meio do **Axios**.

Os indicadores exibidos na Dashboard são:

* Selic;
* IPCA;
* Dólar.

Esses dados são fornecidos pelo backend `financeiq-api` e exibidos na tela inicial para oferecer contexto econômico ao usuário.

Endpoints utilizados:

```text
GET /indicators/selic
GET /indicators/ipca
GET /indicators/dollar
GET /indicators/summary
```

Nesta versão, os indicadores são simulados pelo backend para fins acadêmicos.

---

### Open Finance Mock

O FinanceIQ possui uma área de **Open Finance Mock**, implementada com uma API própria em **Node.js + Express**.

Essa funcionalidade simula a conexão com instituições financeiras, permitindo:

* visualizar bancos simulados;
* autorizar bancos individualmente;
* conceder permissões simuladas;
* visualizar detalhes da instituição conectada;
* sincronizar transações simuladas;
* persistir transações importadas no **Cloud Firestore**.

As permissões simuladas incluem:

* leitura de saldo;
* histórico de transações;
* dados cadastrais.

Fluxo principal:

```text
Perfil
→ Open Finance
→ Autorizar banco
→ Conceder permissões
→ Sincronizar dados
→ Persistir transações no Firestore
```

A integração Open Finance implementada neste projeto é um **mock acadêmico**. Ela simula autorização, leitura e sincronização de dados financeiros, mas não se conecta a bancos reais nem utiliza credenciais bancárias reais.

---

### Persistência dos dados do Open Finance Mock

As transações retornadas pela API Open Finance Mock podem ser importadas para o **Firestore** após autorização simulada do usuário.

O fluxo de sincronização funciona assim:

```text
API Node/Express
→ retorna transações simuladas

App Mobile
→ consome os dados via Axios

OpenFinance.tsx
→ usuário autoriza banco
→ usuário concede permissão de histórico
→ usuário confirma sincronização

Firestore
→ salva as transações importadas
```

As transações importadas recebem campos adicionais para controle:

* `external_id`;
* `source`;
* `bank_name`;
* `account_id`;
* `original_date`;
* `imported_at`.

Exemplo de transação importada:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Supermercado",
  "amount": 320.5,
  "type": "outcome",
  "category": "Alimentação",
  "is_fixed": false,
  "source": "open_finance_mock",
  "external_id": "nubank_of_usuario_001",
  "bank_name": "Nubank",
  "account_id": "acc_nubank_mock",
  "original_date": "2026-05-22",
  "imported_at": "timestamp",
  "date": "timestamp"
}
```

O campo `external_id` evita duplicidade. Dessa forma, se o usuário sincronizar os dados mais de uma vez, as transações já importadas serão ignoradas.

As transações importadas passam a aparecer naturalmente em:

* Dashboard;
* Histórico recente;
* tela de Lançamentos;
* cálculos de saldo, entradas e saídas.

---

### Detalhes da instituição Open Finance

Ao autorizar um banco e tocar sobre ele, o usuário é direcionado para a tela de detalhes da instituição.

Essa tela exibe:

* nome da instituição;
* tipo de conta;
* saldo sincronizado, caso a permissão tenha sido concedida;
* usuário FinanceIQ vinculado;
* permissões concedidas;
* transações simuladas, caso autorizadas;
* dados cadastrais simulados, caso autorizados;
* aviso de que se trata de um mock acadêmico.

O nome e o e-mail exibidos vêm do **Firebase Authentication**, conforme o usuário autenticado no app.

Os dados bancários, como banco, saldo, conta, permissões e transações, são simulados pela API Open Finance Mock.

---

### Perfil do usuário

A tela de perfil exibe:

* nome do usuário;
* e-mail;
* perfil de risco;
* salário mensal, obtido a partir do lançamento fixo **Salário Mensal**;
* acesso ao Open Finance;
* opções visuais de configurações;
* botão de logout.

O item **Open Finance** direciona o usuário para a tela de gerenciamento das instituições simuladas. As autorizações são realizadas dentro da própria tela Open Finance, por meio dos switches de bancos e permissões.

---

## Tecnologias utilizadas

### Aplicativo mobile

* **React Native**
* **Expo**
* **TypeScript**
* **Firebase Authentication**
* **Cloud Firestore**
* **AsyncStorage**
* **React Navigation**
* **Axios**
* **Expo Vector Icons**

### Backend da API

* **Node.js**
* **Express**
* **TypeScript**
* **CORS**
* **dotenv**
* **ts-node-dev**

---

## Estrutura do projeto

```text
Projeto_Mobile-FinanceIQ
├── assets
├── financeiq-api
│   ├── src
│   │   ├── controllers
│   │   │   ├── indicatorsController.ts
│   │   │   └── openFinanceController.ts
│   │   │
│   │   ├── routes
│   │   │   ├── indicatorsRoutes.ts
│   │   │   └── openFinanceRoutes.ts
│   │   │
│   │   ├── services
│   │   │   ├── indicatorsMockService.ts
│   │   │   └── openFinanceMockService.ts
│   │   │
│   │   └── server.ts
│   │
│   ├── .env.example
│   ├── package-lock.json
│   ├── package.json
│   └── tsconfig.json
│
├── src
│   ├── database
│   │   ├── initializeDatabase.ts
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
│   │   ├── Onboarding.tsx
│   │   ├── OpenFinance.tsx
│   │   ├── OpenFinanceBankDetails.tsx
│   │   ├── Perfil.tsx
│   │   └── Relatorios.tsx
│   │
│   ├── services
│   │   ├── api.ts
│   │   ├── economicIndicatorsService.ts
│   │   └── openFinanceService.ts
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

## Principais arquivos

### `firebaseConfig.ts`

Arquivo responsável por inicializar o Firebase no projeto e exportar:

* `auth`;
* `db`;
* `app`.

Essas instâncias são usadas nas telas e serviços do app.

---

### `src/services/api.ts`

Arquivo responsável por centralizar a configuração do Axios.

Exemplo:

```ts
import axios from 'axios';

const API_BASE_URL = 'http://SEU_IP_LOCAL:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});
```

Durante testes em celular físico com Expo Go, não utilize `localhost`, pois o celular interpreta `localhost` como ele mesmo.

Use o IP da máquina onde o backend está rodando:

```ts
const API_BASE_URL = 'http://192.168.0.10:3000';
```

Para uma versão publicada, recomenda-se hospedar o backend e substituir o IP local por uma URL pública.

---

### `src/services/openFinanceService.ts`

Serviço responsável pelo consumo dos endpoints de Open Finance Mock.

Funções principais:

* buscar saldos simulados;
* buscar transações simuladas;
* sincronizar transações simuladas.

---

### `src/services/economicIndicatorsService.ts`

Serviço responsável pelo consumo dos endpoints de Indicadores Econômicos.

Funções principais:

* buscar Selic;
* buscar IPCA;
* buscar Dólar.

---

### `src/database/transactionService.ts`

Serviço responsável pelas transações financeiras.

Funções principais:

* criar lançamentos fixos;
* listar lançamentos do usuário;
* adicionar novos lançamentos;
* atualizar valores;
* remover lançamentos extras;
* importar transações do Open Finance Mock;
* evitar duplicidade por `external_id`.

Todos os lançamentos são vinculados ao `uid` do usuário autenticado.

---

### `src/database/userProfileService.ts`

Serviço responsável pelos dados de perfil do usuário.

Atualmente armazena principalmente:

* `risk_profile`.

O salário mensal não fica salvo diretamente no perfil. Ele é tratado como uma transação fixa positiva.

---

### `src/screens/ConfiguracaoPerfil.tsx`

Tela usada após o cadastro de uma nova conta.

Responsável por:

* salvar o perfil de risco;
* localizar/criar os lançamentos fixos;
* atualizar o valor do lançamento **Salário Mensal**;
* redirecionar o usuário para a tela principal.

---

### `src/screens/Lancamentos.tsx`

Tela responsável por gerenciar lançamentos financeiros.

Permite:

* editar valores dos lançamentos fixos;
* criar lançamentos extras;
* editar lançamentos;
* excluir apenas lançamentos extras;
* visualizar transações importadas do Open Finance Mock.

---

### `src/screens/Dashboard.tsx`

Tela inicial do app após login.

Responsável por:

* carregar perfil;
* carregar lançamentos;
* calcular entradas;
* calcular saídas;
* calcular saldo disponível;
* exibir histórico recente;
* exibir Indicadores Econômicos via API.

---

### `src/screens/OpenFinance.tsx`

Tela responsável por gerenciar a integração Open Finance Mock.

Permite:

* listar instituições simuladas;
* autorizar bancos;
* conceder permissões;
* sincronizar transações autorizadas;
* importar dados para o Firestore;
* acessar a tela de detalhes da instituição autorizada.

---

### `src/screens/OpenFinanceBankDetails.tsx`

Tela responsável por exibir os detalhes de uma instituição simulada autorizada.

Exibe:

* instituição;
* tipo de conta;
* status de conexão;
* saldo, se autorizado;
* permissões;
* transações simuladas, se autorizadas;
* dados cadastrais simulados, se autorizados;
* usuário FinanceIQ vinculado;
* aviso de mock acadêmico.

---

### `src/screens/Onboarding.tsx`

Tela de introdução exibida apenas na primeira abertura do app no dispositivo.

Utiliza `AsyncStorage` para salvar a chave:

```text
hasSeenOnboarding
```

---

### `src/AppNavigator.tsx`

Arquivo responsável pelo fluxo inicial de navegação.

Regras principais:

```text
Se nunca viu onboarding → Onboarding
Se já viu onboarding e está logado → Index
Se já viu onboarding e não está logado → Login
```

Também registra as telas:

* OpenFinance;
* OpenFinanceBankDetails.

---

### `financeiq-api/src/server.ts`

Arquivo principal do backend Node/Express.

Responsável por:

* configurar o Express;
* habilitar CORS;
* carregar variáveis de ambiente;
* registrar rotas;
* iniciar a API na porta configurada.

---

## Backend `financeiq-api`

A API separada do FinanceIQ possui endpoints para Open Finance Mock e Indicadores Econômicos.

### Rodar o backend

Acesse a pasta da API:

```bash
cd financeiq-api
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo `.env` baseado no `.env.example`:

```env
PORT=3000
```

Rode o servidor:

```bash
npm run dev
```

A API será iniciada na porta configurada:

```text
http://localhost:3000
```

---

### Endpoints principais

Health check:

```text
GET /health
```

Open Finance Mock:

```text
GET /open-finance/accounts/:userId
GET /open-finance/balances/:userId
GET /open-finance/transactions/:userId
POST /open-finance/sync/:userId
```

Indicadores Econômicos:

```text
GET /indicators/selic
GET /indicators/ipca
GET /indicators/dollar
GET /indicators/summary
```

---

## Fluxo do aplicativo

### Primeira abertura no dispositivo

```text
Onboarding
→ Login/Cadastro
```

### Cadastro de nova conta

```text
Login.tsx
→ Criar Conta
→ ConfiguracaoPerfil
→ Index
```

### Login em conta existente

```text
Login.tsx
→ Entrar
→ Index
```

### Usuário já autenticado

```text
Abrir app
→ Index
```

### Fluxo Open Finance Mock

```text
Perfil
→ Open Finance
→ Autorizar banco
→ Conceder permissão de histórico
→ Sincronizar dados autorizados
→ Importar transações para o Firestore
→ Dashboard e Lançamentos atualizados
```

---

## Banco de dados

O projeto utiliza **Cloud Firestore** como banco de dados principal.

### Coleção `users`

Armazena dados de perfil do usuário.

Exemplo:

```json
{
  "risk_profile": "Moderado"
}
```

---

### Coleção `transactions`

Armazena os lançamentos financeiros do usuário.

Exemplo de lançamento manual:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Netflix",
  "amount": 39.9,
  "type": "outcome",
  "category": "Geral",
  "is_fixed": false,
  "source": "manual",
  "date": "timestamp"
}
```

Exemplo de lançamento fixo:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Salário Mensal",
  "amount": 5000,
  "type": "income",
  "category": "Receita",
  "is_fixed": true,
  "source": "manual",
  "date": "timestamp"
}
```

Exemplo de lançamento importado do Open Finance Mock:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Supermercado",
  "amount": 320.5,
  "type": "outcome",
  "category": "Alimentação",
  "is_fixed": false,
  "source": "open_finance_mock",
  "external_id": "nubank_of_usuario_001",
  "bank_name": "Nubank",
  "account_id": "acc_nubank_mock",
  "original_date": "2026-05-22",
  "imported_at": "timestamp",
  "date": "timestamp"
}
```

---

## Regras temporárias do Firestore

Durante o desenvolvimento, é possível usar regras temporárias para permitir acesso a usuários autenticados:

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

Para produção, recomenda-se criar regras mais restritivas, garantindo que cada usuário só acesse seus próprios dados.

---

## Índice necessário no Firestore

A consulta de lançamentos usa filtro por usuário e ordenação por data:

```ts
where('user_id', '==', userId),
orderBy('date', 'desc')
```

Por isso, o Firestore pode solicitar a criação de um índice composto.

Configuração do índice:

```text
Coleção: transactions
Escopo: Coleta

Campos:
user_id → Crescente
date    → Decrescente
```

---

## Instalação

Clone o repositório:

```bash
git clone <url-do-repositorio>
```

Acesse a pasta do projeto:

```bash
cd Projeto_Mobile-FinanceIQ
```

Instale as dependências do app mobile:

```bash
npm install
```

Instale as dependências da API:

```bash
cd financeiq-api
npm install
```

---

## Configuração do Firebase

Crie um projeto no Firebase e habilite:

* Firebase Authentication;
* método de login por E-mail/Senha;
* Cloud Firestore.

Depois configure o arquivo:

```text
firebaseConfig.ts
```

com os dados do seu projeto Firebase.

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

### Rodar o backend

Em um terminal:

```bash
cd financeiq-api
npm run dev
```

A API ficará disponível em:

```text
http://localhost:3000
```

---

### Rodar o app mobile

Em outro terminal, na raiz do projeto:

```bash
npm start
```

ou:

```bash
npx expo start
```

Para limpar o cache do Metro Bundler:

```bash
npx expo start -c
```

Para abrir no Android:

```bash
npm run android
```

Para abrir no iOS:

```bash
npm run ios
```

Para abrir no navegador:

```bash
npm run web
```

---

## Configuração do Axios

No app mobile, a configuração da API fica em:

```text
src/services/api.ts
```

Durante o desenvolvimento com Expo Go em celular físico, não use `localhost`, pois o celular interpreta `localhost` como ele mesmo.

Use o IP da máquina que está rodando o backend:

```ts
const API_BASE_URL = 'http://SEU_IP_LOCAL:3000';
```

Exemplo:

```ts
const API_BASE_URL = 'http://192.168.0.10:3000';
```

Para uma versão publicada, o ideal é hospedar o backend e usar uma URL pública.

---

## Observações importantes

### Sobre o Open Finance Mock

A integração Open Finance implementada neste projeto é apenas uma simulação acadêmica.

Ela não acessa bancos reais, não solicita credenciais bancárias reais e não utiliza autorização real de instituições financeiras.

A sincronização acontece somente com dados mockados retornados pelo backend `financeiq-api`.

---

### Sobre a persistência no Firestore

As transações importadas pelo Open Finance Mock são salvas no Firestore apenas após:

* autorização simulada de uma instituição;
* concessão da permissão de histórico de transações;
* confirmação do usuário no botão de sincronização.

O sistema evita duplicidade usando o campo `external_id`.

---

### Sobre o SQLite

O projeto ainda possui a dependência `expo-sqlite` e o arquivo `initializeDatabase.ts`, mas a lógica principal atual foi migrada para o **Cloud Firestore**.

Atualmente, os dados principais do app ficam na nuvem:

* usuários;
* perfil de risco;
* salário mensal;
* lançamentos;
* histórico financeiro;
* transações importadas do Open Finance Mock.

A dependência `expo-sqlite` pode ser removida futuramente caso não seja mais utilizada.

---

### Sobre o AsyncStorage

O AsyncStorage é utilizado apenas para armazenar se o onboarding já foi visualizado naquele dispositivo.

Ele não armazena:

* senha;
* dados financeiros;
* lançamentos;
* perfil de risco;
* salário mensal.

Esses dados ficam no Firebase.

---

### Sobre o `.env`

O arquivo real:

```text
financeiq-api/.env
```

não deve ser enviado ao GitHub.

Ele deve ficar apenas no ambiente local de desenvolvimento.

O arquivo que deve ser versionado é:

```text
financeiq-api/.env.example
```

Exemplo:

```env
PORT=3000
```

---

## Dependências principais

Conforme o `package.json`, o app mobile utiliza:

```json
{
  "expo": "~54.0.33",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "firebase": "^12.13.0",
  "axios": "^1.0.0",
  "@react-native-async-storage/async-storage": "2.2.0",
  "@react-navigation/native": "^7.2.2",
  "@react-navigation/native-stack": "^7.14.12",
  "@react-navigation/bottom-tabs": "^7.15.11",
  "@expo/vector-icons": "^15.0.3"
}
```

O backend `financeiq-api` utiliza:

```json
{
  "express": "^5.2.1",
  "cors": "^2.8.5",
  "dotenv": "^17.2.3",
  "typescript": "^5.9.3",
  "ts-node-dev": "^2.0.0"
}
```

---

## Status atual do projeto

O projeto atualmente possui:

* autenticação funcional;
* cadastro de usuários;
* login/logout;
* onboarding inicial;
* configuração de perfil;
* lançamentos fixos;
* lançamentos extras;
* edição de valores;
* exclusão de lançamentos extras;
* Dashboard com saldo dinâmico;
* histórico recente;
* Indicadores Econômicos via API;
* Open Finance Mock;
* tela de detalhes da instituição simulada;
* sincronização de transações mockadas;
* persistência das transações importadas no Firestore;
* controle de duplicidade por `external_id`;
* dados persistidos em nuvem.

---

## Próximas melhorias sugeridas

* gráficos reais na Dashboard;
* filtros por mês;
* categorias personalizadas;
* tela de metas financeiras;
* sugestão inteligente baseada em categorias;
* relatórios detalhados;
* edição avançada de perfil;
* recuperação de senha;
* regras mais seguras no Firestore;
* autenticação das rotas da API com token Firebase;
* hospedagem pública do backend;
* integração real com Open Finance;
* publicação do app com EAS Build.

---

## Autores

* Ana Beatriz
* Carlos Eduardo
* Evandro Portes

Projeto desenvolvido para fins acadêmicos e práticos como uma aplicação mobile de controle financeiro pessoal.

**Nome do projeto:** FinanceIQ
