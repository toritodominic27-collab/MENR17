
const TronService = require('./tronService');
const tronService = new TronService();
const dbService = require('./databaseService');
const EventEmitter = require('events');

class PaymentService extends EventEmitter {
  constructor() {
    super();
    this.monitoringInterval = null;
    this.processingWithdrawals = false;
    this.withdrawalBatchSize = 10;
    this.withdrawalFee = 1; // 1 USDT fee
    this.minWithdrawal = 1; // Minimum 1 USDT (to match VIP_1 daily profit)
  }

  // Get or create deposit address for user
  async getDepositAddress(userId) {
    try {
      let userAddress = await dbService.getUserAddress(userId);
      
      if (!userAddress) {
        // Generate new address for user
        const { address, privateKey } = tronService.generateUserAddress(userId);
        await dbService.saveUserAddress(userId, address, privateKey);
        userAddress = { user_id: userId, address, encrypted_private_key: privateKey };
      }
      
      return {
        success: true,
        address: userAddress.address,
        network: 'TRC20',
        contract: tronService.usdtContract
      };
    } catch (error) {
      console.error('Error getting deposit address:', error);
      return {
        success: false,
        error: 'Failed to generate deposit address'
      };
    }
  }

  // Start monitoring all user addresses
  async startMonitoring() {
    console.log('Starting deposit monitoring...');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkAllDeposits();
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds

    // Start withdrawal processing
    this.startWithdrawalProcessing();
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Check deposits for all user addresses
  async checkAllDeposits() {
    const addresses = await dbService.getAllUserAddresses();
    
    for (const { user_id, address } of addresses) {
      await this.checkUserDeposits(user_id, address);
    }
  }

  // Check deposits for specific user
  async checkUserDeposits(userId, address) {
    try {
      // For simplicity, we'll check the balance and compare with recorded deposits
      const currentBalance = await tronService.getUSDTBalance(address);
      const userBalance = await dbService.getUserBalance(userId);
      const deposits = await dbService.getUserDeposits(userId);
      
      const totalDeposited = deposits
        .filter(d => d.status === 'confirmed')
        .reduce((sum, d) => sum + d.amount, 0);
      
      if (currentBalance > totalDeposited) {
        // New deposit detected
        const newAmount = currentBalance - totalDeposited;
        const faketxid = `deposit_${userId}_${Date.now()}`; // In real implementation, get actual txid
        
        await this.processDeposit(userId, address, faketxid, newAmount);
      }
    } catch (error) {
      console.error(`Error checking deposits for ${userId}:`, error);
    }
  }

  // Process confirmed deposit
  async processDeposit(userId, address, txid, amount) {
    try {
      // Record deposit
      await dbService.recordDeposit(userId, address, txid, amount, Date.now());
      
      // Update deposit status to confirmed
      await dbService.updateDepositStatus(txid, 'confirmed', new Date().toISOString());
      
      // Add to user balance
      await dbService.addToUserBalance(userId, amount);
      
      // Emit deposit event
      this.emit('deposit', {
        userId,
        address,
        txid,
        amount,
        status: 'confirmed'
      });
      
      console.log(`Deposit processed: ${amount} USDT for user ${userId}`);
      
      return true;
    } catch (error) {
      console.error('Error processing deposit:', error);
      return false;
    }
  }

  // Request withdrawal
  async requestWithdrawal(userId, toAddress, amount) {
    try {
      // Validate address
      if (!tronService.isValidAddress(toAddress)) {
        return {
          success: false,
          error: 'Invalid TRON address'
        };
      }

      // Check minimum withdrawal
      if (amount < this.minWithdrawal) {
        return {
          success: false,
          error: `الحد الأدنى للسحب هو ${this.minWithdrawal} USDT`
        };
      }

      // Get user balance
      const userBalance = await dbService.getUserBalance(userId);
      const availableBalance = userBalance.balance - userBalance.locked_balance;

      // Check if user has enough balance
      if (availableBalance < amount) {
        return {
          success: false,
          error: 'Insufficient balance'
        };
      }

      // Calculate net amount after fee
      const netAmount = amount - this.withdrawalFee;
      
      if (netAmount <= 0) {
        return {
          success: false,
          error: 'Amount too small after fees'
        };
      }

      // Record withdrawal request
      const withdrawalId = await dbService.recordWithdrawal(
        userId, 
        toAddress, 
        amount, 
        this.withdrawalFee, 
        netAmount
      );

      // Lock the balance
      await dbService.updateUserBalance(
        userId, 
        userBalance.balance - amount, 
        userBalance.locked_balance + amount
      );

      this.emit('withdrawalRequested', {
        id: withdrawalId,
        userId,
        toAddress,
        amount,
        netAmount
      });

      return {
        success: true,
        withdrawalId,
        amount,
        fee: this.withdrawalFee,
        netAmount,
        message: 'Withdrawal request submitted successfully'
      };
    } catch (error) {
      console.error('Error requesting withdrawal:', error);
      return {
        success: false,
        error: 'Failed to process withdrawal request'
      };
    }
  }

  // Start withdrawal processing
  startWithdrawalProcessing() {
    setInterval(async () => {
      if (!this.processingWithdrawals) {
        await this.processWithdrawals();
      }
    }, 60000); // Process every minute
  }

  // Process pending withdrawals
  async processWithdrawals() {
    if (this.processingWithdrawals) return;
    
    this.processingWithdrawals = true;
    
    try {
      const pendingWithdrawals = await dbService.getPendingWithdrawals();
      
      if (pendingWithdrawals.length === 0) {
        this.processingWithdrawals = false;
        return;
      }

      console.log(`Processing ${pendingWithdrawals.length} withdrawal(s)...`);

      // Process withdrawals in batches
      for (let i = 0; i < pendingWithdrawals.length; i += this.withdrawalBatchSize) {
        const batch = pendingWithdrawals.slice(i, i + this.withdrawalBatchSize);
        await this.processBatchWithdrawals(batch);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('Error processing withdrawals:', error);
    } finally {
      this.processingWithdrawals = false;
    }
  }

  // Process batch of withdrawals
  async processBatchWithdrawals(withdrawals) {
    for (const withdrawal of withdrawals) {
      try {
        // Send USDT
        const result = await tronService.sendUSDT(withdrawal.to_address, withdrawal.net_amount);
        
        if (result.success) {
          // Update withdrawal status
          await dbService.updateWithdrawalStatus(
            withdrawal.id,
            'completed',
            result.txid,
            new Date().toISOString()
          );

          // Update user balance (remove locked amount)
          const userBalance = await dbService.getUserBalance(withdrawal.user_id);
          await dbService.updateUserBalance(
            withdrawal.user_id,
            userBalance.balance,
            userBalance.locked_balance - withdrawal.amount
          );

          this.emit('withdrawalCompleted', {
            id: withdrawal.id,
            userId: withdrawal.user_id,
            txid: result.txid,
            amount: withdrawal.net_amount
          });

          console.log(`Withdrawal completed: ${withdrawal.net_amount} USDT to ${withdrawal.to_address}`);
        } else {
          // Mark as failed
          await dbService.updateWithdrawalStatus(withdrawal.id, 'failed');
          
          // Unlock balance
          const userBalance = await dbService.getUserBalance(withdrawal.user_id);
          await dbService.updateUserBalance(
            withdrawal.user_id,
            userBalance.balance + withdrawal.amount,
            userBalance.locked_balance - withdrawal.amount
          );

          this.emit('withdrawalFailed', {
            id: withdrawal.id,
            userId: withdrawal.user_id,
            error: result.error
          });
        }
      } catch (error) {
        console.error(`Error processing withdrawal ${withdrawal.id}:`, error);
      }
    }
  }

  // Get user transaction history
  async getUserTransactions(userId, limit = 50) {
    try {
      const deposits = await dbService.getUserDeposits(userId, limit);
      const withdrawals = await new Promise((resolve, reject) => {
        dbService.db.all(
          'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
          [userId, limit],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      return {
        deposits,
        withdrawals
      };
    } catch (error) {
      console.error('Error getting user transactions:', error);
      return { deposits: [], withdrawals: [] };
    }
  }
}

module.exports = new PaymentService();
