const { users, investmentPlans, userInvestments, payments, withdrawals, dailyProfits } = require("../shared/schema");
const { db } = require("./db");
const { eq, desc, and, gte, lte } = require("drizzle-orm");

class DatabaseStorage {
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser) {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id, updates) {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getInvestmentPlans() {
    return await db.select().from(investmentPlans).where(eq(investmentPlans.isActive, true));
  }

  async getUserInvestments(userId) {
    return await db.select().from(userInvestments).where(eq(userInvestments.userId, userId));
  }

  async createPayment(payment) {
    const [newPayment] = await db
      .insert(payments)
      .values(payment)
      .returning();
    return newPayment;
  }

  async getUserPayments(userId) {
    return await db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async createWithdrawal(withdrawal) {
    const [newWithdrawal] = await db
      .insert(withdrawals)
      .values(withdrawal)
      .returning();
    return newWithdrawal;
  }

  async getUserWithdrawals(userId) {
    return await db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
  }

  async getUserBalance(userId) {
    // Calculate total profits from all investments
    const profits = await db.select().from(dailyProfits).where(eq(dailyProfits.userId, userId));
    const totalEarned = profits.reduce((sum, profit) => sum + parseFloat(profit.amount.toString()), 0);
    
    // Calculate total withdrawn
    const userWithdrawals = await db.select().from(withdrawals)
      .where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, 'completed')));
    const totalWithdrawn = userWithdrawals.reduce((sum, withdrawal) => sum + parseFloat(withdrawal.amount.toString()), 0);
    
    return totalEarned - totalWithdrawn;
  }

  async addDailyProfit(userId, investmentId, amount) {
    await db.insert(dailyProfits).values({
      userId,
      investmentId,
      amount: amount.toString(),
    });
  }

  // Helper method to initialize default investment plans
  async initializeDefaultPlans() {
    const existingPlans = await db.select().from(investmentPlans);
    
    if (existingPlans.length === 0) {
      const defaultPlans = [
        { name: 'VIP-1', minInvestment: '5', dailyProfitPercent: '1.0', duration: 30 },
        { name: 'VIP-2', minInvestment: '50', dailyProfitPercent: '1.2', duration: 30 },
        { name: 'VIP-3', minInvestment: '100', dailyProfitPercent: '1.5', duration: 30 },
        { name: 'VIP-4', minInvestment: '500', dailyProfitPercent: '2.0', duration: 30 },
        { name: 'VIP-5', minInvestment: '1000', dailyProfitPercent: '2.5', duration: 30 },
      ];

      await db.insert(investmentPlans).values(defaultPlans);
    }
  }
}

const storage = new DatabaseStorage();

module.exports = { storage, DatabaseStorage };