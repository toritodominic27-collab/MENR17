
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
  constructor() {
    this.dbPath = process.env.DATABASE_PATH || './database.sqlite';
    this.db = new sqlite3.Database(this.dbPath);
    this.initTables();
  }

  // Initialize database tables
  initTables() {
    // User addresses table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        user_id TEXT PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        encrypted_private_key TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Deposits table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        address TEXT NOT NULL,
        txid TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        block_number INTEGER,
        confirmed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_addresses (user_id)
      )
    `);

    // Withdrawals table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount REAL NOT NULL,
        fee REAL DEFAULT 1,
        net_amount REAL NOT NULL,
        txid TEXT,
        status TEXT DEFAULT 'pending',
        batch_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES user_addresses (user_id)
      )
    `);

    // User balances table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_balances (
        user_id TEXT PRIMARY KEY,
        balance REAL DEFAULT 0,
        locked_balance REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized');
  }

  // Get or create user address
  async getUserAddress(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM user_addresses WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Save user address
  async saveUserAddress(userId, address, encryptedPrivateKey) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO user_addresses (user_id, address, encrypted_private_key) VALUES (?, ?, ?)',
        [userId, address, encryptedPrivateKey],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Record deposit
  async recordDeposit(userId, address, txid, amount, blockNumber = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO deposits (user_id, address, txid, amount, block_number) VALUES (?, ?, ?, ?, ?)',
        [userId, address, txid, amount, blockNumber],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Update deposit status
  async updateDepositStatus(txid, status, confirmedAt = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE deposits SET status = ?, confirmed_at = ? WHERE txid = ?',
        [status, confirmedAt, txid],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Get user deposits
  async getUserDeposits(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Record withdrawal request
  async recordWithdrawal(userId, toAddress, amount, fee, netAmount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO withdrawals (user_id, to_address, amount, fee, net_amount) VALUES (?, ?, ?, ?, ?)',
        [userId, toAddress, amount, fee, netAmount],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Update withdrawal status
  async updateWithdrawalStatus(id, status, txid = null, processedAt = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE withdrawals SET status = ?, txid = ?, processed_at = ? WHERE id = ?',
        [status, txid, processedAt, id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Get pending withdrawals
  async getPendingWithdrawals() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM withdrawals WHERE status = "pending" ORDER BY created_at ASC',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get user balance
  async getUserBalance(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM user_balances WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { user_id: userId, balance: 0, locked_balance: 0 });
        }
      );
    });
  }

  // Update user balance
  async updateUserBalance(userId, balance, lockedBalance = 0) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO user_balances (user_id, balance, locked_balance, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [userId, balance, lockedBalance],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Add to user balance
  async addToUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_balances (user_id, balance) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET 
         balance = balance + ?, updated_at = CURRENT_TIMESTAMP`,
        [userId, amount, amount],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Get all user addresses for monitoring
  async getAllUserAddresses() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT user_id, address FROM user_addresses',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

module.exports = new DatabaseService();
