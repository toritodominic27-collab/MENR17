import { users, investmentPlans, userInvestments, payments, withdrawals, dailyProfits } from "../shared/schema";
import { type User, type InsertUser, type InvestmentPlan, type UserInvestment, type Payment, type Withdrawal } from "../shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getInvestmentPlans(): Promise<InvestmentPlan[]>;
  getUserInvestments(userId: number): Promise<UserInvestment[]>;
  createPayment(payment: any): Promise<Payment>;
  getUserPayments(userId: number): Promise<Payment[]>;
  createWithdrawal(withdrawal: any): Promise<Withdrawal>;
  getUserWithdrawals(userId: number): Promise<Withdrawal[]>;
  getUserBalance(userId: number): Promise<number>;
  addDailyProfit(userId: number, investmentId: number, amount: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getInvestmentPlans(): Promise<InvestmentPlan[]> {
    return await db.select().from(investmentPlans).where(eq(investmentPlans.isActive, true));
  }

  async getUserInvestments(userId: number): Promise<UserInvestment[]> {
    return await db.select().from(userInvestments).where(eq(userInvestments.userId, userId));
  }

  async createPayment(payment: any): Promise<Payment> {
    const [newPayment] = await db
      .insert(payments)
      .values(payment)
      .returning();
    return newPayment;
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async createWithdrawal(withdrawal: any): Promise<Withdrawal> {
    const [newWithdrawal] = await db
      .insert(withdrawals)
      .values(withdrawal)
      .returning();
    return newWithdrawal;
  }

  async getUserWithdrawals(userId: number): Promise<Withdrawal[]> {
    return await db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
  }

  async getUserBalance(userId: number): Promise<number> {
    // Calculate total profits from all investments
    const profits = await db.select().from(dailyProfits).where(eq(dailyProfits.userId, userId));
    const totalEarned = profits.reduce((sum, profit) => sum + parseFloat(profit.amount.toString()), 0);
    
    // Calculate total withdrawn
    const userWithdrawals = await db.select().from(withdrawals)
      .where(and(eq(withdrawals.userId, userId), eq(withdrawals.status, 'completed')));
    const totalWithdrawn = userWithdrawals.reduce((sum, withdrawal) => sum + parseFloat(withdrawal.amount.toString()), 0);
    
    return totalEarned - totalWithdrawn;
  }

  async addDailyProfit(userId: number, investmentId: number, amount: number): Promise<void> {
    await db.insert(dailyProfits).values({
      userId,
      investmentId,
      amount: amount.toString(),
    });
  }

  // Helper method to initialize default investment plans
  async initializeDefaultPlans(): Promise<void> {
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

export const storage = new DatabaseStorage();