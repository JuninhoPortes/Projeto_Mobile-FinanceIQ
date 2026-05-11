import * as SQLite from 'expo-sqlite';

export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('financeiq.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    /* Tabela de Lançamentos - Adicionado user_id */
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL, 
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT DEFAULT (datetime('now', 'localtime'))
    );

    /* Tabela de Perfil - user_id como Chave Primária */
    CREATE TABLE IF NOT EXISTS user_profile (
      user_id TEXT PRIMARY KEY NOT NULL,
      monthly_income REAL,
      risk_profile TEXT
    );
  `);

  console.log("Estrutura do banco de dados atualizada para múltiplos usuários!");
}