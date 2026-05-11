[README.md](https://github.com/user-attachments/files/27597798/README.md)
# FinanceIQ

**FinanceIQ** é um aplicativo mobile desenvolvido com **React Native**, **Expo** e **TypeScript**, voltado para controle financeiro pessoal. O app permite cadastro e login de usuários, configuração inicial de perfil financeiro, registro de lançamentos positivos e negativos, acompanhamento de saldo, histórico de movimentações e persistência dos dados em nuvem utilizando **Firebase Authentication** e **Cloud Firestore**.

---

## Funcionalidades

### Autenticação de usuários

O sistema possui autenticação integrada com o **Firebase Authentication**, permitindo:

- criação de novas contas;
- login com e-mail e senha;
- logout seguro;
- identificação individual de cada usuário pelo `uid` do Firebase.

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

- salário mensal;
- perfil de risco:
  - Conservador;
  - Moderado;
  - Agressivo.

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

- Salário Mensal;
- Moradia;
- Transporte;
- Alimentação.

Esses lançamentos são criados com valor inicial `0` e podem ser editados pelo usuário.

Além dos lançamentos fixos, o usuário pode cadastrar novos lançamentos personalizados, como:

- Netflix;
- Uber;
- iFood;
- Freelance;
- PIX recebido;
- Academia;
- Mercado.

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

- entradas são todos os lançamentos do tipo `income`;
- saídas são todos os lançamentos do tipo `outcome`.

A Dashboard também mostra:

- total de entradas;
- total de saídas;
- saldo disponível;
- perfil financeiro;
- histórico recente dos lançamentos.

---

### Perfil do usuário

A tela de perfil exibe:

- nome do usuário;
- e-mail;
- perfil de risco;
- salário mensal, obtido a partir do lançamento fixo **Salário Mensal**;
- opções visuais de configurações;
- botão de logout.

---

## Tecnologias utilizadas

- **React Native**
- **Expo**
- **TypeScript**
- **Firebase Authentication**
- **Cloud Firestore**
- **AsyncStorage**
- **React Navigation**
- **Expo Vector Icons**

---

## Estrutura do projeto

```text
MEU-PROJETO-MOBILE
├── .expo
├── .vscode
├── assets
├── node_modules
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
│   │   ├── Perfil.tsx
│   │   └── Relatorios.tsx
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
└── tsconfig.json
```

---

## Principais arquivos

### `firebaseConfig.ts`

Arquivo responsável por inicializar o Firebase no projeto e exportar:

- `auth`;
- `db`;
- `app`.

Essas instâncias são usadas nas telas e serviços do app.

---

### `src/database/transactionService.ts`

Serviço responsável pelas transações financeiras.

Funções principais:

- criar lançamentos fixos;
- listar lançamentos do usuário;
- adicionar novos lançamentos;
- atualizar valores;
- remover lançamentos extras.

Todos os lançamentos são vinculados ao `uid` do usuário autenticado.

---

### `src/database/userProfileService.ts`

Serviço responsável pelos dados de perfil do usuário.

Atualmente armazena principalmente:

- `risk_profile`.

O salário mensal não fica mais salvo diretamente no perfil. Ele é tratado como uma transação fixa positiva.

---

### `src/screens/ConfiguracaoPerfil.tsx`

Tela usada após o cadastro de uma nova conta.

Responsável por:

- salvar o perfil de risco;
- localizar/criar os lançamentos fixos;
- atualizar o valor do lançamento **Salário Mensal**;
- redirecionar o usuário para a tela principal.

---

### `src/screens/Lancamentos.tsx`

Tela responsável por gerenciar lançamentos financeiros.

Permite:

- editar valores dos lançamentos fixos;
- criar lançamentos extras;
- editar lançamentos;
- excluir apenas lançamentos extras.

---

### `src/screens/Dashboard.tsx`

Tela inicial do app após login.

Responsável por:

- carregar perfil;
- carregar lançamentos;
- calcular entradas;
- calcular saídas;
- calcular saldo disponível;
- exibir histórico recente.

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

### Coleção `transactions`

Armazena os lançamentos financeiros do usuário.

Exemplo:

```json
{
  "user_id": "UID_DO_USUARIO",
  "description": "Netflix",
  "amount": 39.9,
  "type": "outcome",
  "category": "Geral",
  "is_fixed": false,
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
cd meu-projeto-mobile
```

Instale as dependências:

```bash
npm install
```

---

## Configuração do Firebase

Crie um projeto no Firebase e habilite:

- Firebase Authentication;
- método de login por E-mail/Senha;
- Cloud Firestore.

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

Para iniciar o Expo:

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

## Observações importantes

### Sobre o SQLite

O projeto ainda possui a dependência `expo-sqlite` e o arquivo `initializeDatabase.ts`, mas a lógica principal atual foi migrada para o **Cloud Firestore**.

Atualmente, os dados principais do app ficam na nuvem:

- usuários;
- perfil de risco;
- salário mensal;
- lançamentos;
- histórico financeiro.

A dependência `expo-sqlite` pode ser removida futuramente caso não seja mais utilizada.

---

### Sobre o AsyncStorage

O AsyncStorage é utilizado apenas para armazenar se o onboarding já foi visualizado naquele dispositivo.

Ele não armazena:

- senha;
- dados financeiros;
- lançamentos;
- perfil de risco;
- salário mensal.

Esses dados ficam no Firebase.

---

## Dependências principais

Conforme o `package.json`, o projeto utiliza:

```json
{
  "expo": "~54.0.33",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "firebase": "^12.13.0",
  "@react-native-async-storage/async-storage": "2.2.0",
  "@react-navigation/native": "^7.2.2",
  "@react-navigation/native-stack": "^7.14.12",
  "@react-navigation/bottom-tabs": "^7.15.11",
  "@expo/vector-icons": "^15.0.3"
}
```

---

## Status atual do projeto

O projeto atualmente possui:

- autenticação funcional;
- cadastro de usuários;
- login/logout;
- onboarding inicial;
- configuração de perfil;
- lançamentos fixos;
- lançamentos extras;
- edição de valores;
- exclusão de lançamentos extras;
- dashboard com saldo dinâmico;
- histórico recente;
- dados persistidos em nuvem.

---

## Próximas melhorias sugeridas

- gráficos reais na Dashboard;
- filtros por mês;
- categorias personalizadas;
- tela de metas financeiras;
- relatórios detalhados;
- edição avançada de perfil;
- recuperação de senha;
- regras mais seguras no Firestore;
- publicação do app com EAS Build.

---

## Autores: Ana Beatriz, Carlos Eduardo, Evandro Portes.

Projeto desenvolvido para fins acadêmicos e práticos como uma aplicação mobile de controle financeiro pessoal.

**Nome do projeto:** FinanceIQ
