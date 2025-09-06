import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, integer, decimal, boolean, varchar } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  password: text('password').notNull(),
  referralCount: integer('referral_count').default(0),
  referredBy: integer('referred_by'),
  registeredAt: timestamp('registered_at').defaultNow(),
  isActive: boolean('is_active').default(true),
  currentPlanId: integer('current_plan_id'),
});

// Investment Plans table
export const investmentPlans = pgTable('investment_plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  minInvestment: decimal('min_investment', { precision: 10, scale: 2 }).notNull(),
  maxInvestment: decimal('max_investment', { precision: 10, scale: 2 }),
  dailyProfitPercent: decimal('daily_profit_percent', { precision: 5, scale: 2 }).notNull(),
  duration: integer('duration').notNull(), // days
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// User Investments table
export const userInvestments = pgTable('user_investments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  planId: integer('plan_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).default('active'), // active, completed, cancelled
  startDate: timestamp('start_date').defaultNow(),
  endDate: timestamp('end_date'),
  totalEarned: decimal('total_earned', { precision: 10, scale: 2 }).default('0'),
  lastProfitDate: timestamp('last_profit_date'),
});

// Payments table
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  investmentId: integer('investment_id'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  txid: text('txid').notNull().unique(),
  address: text('address').notNull(),
  status: varchar('status', { length: 20 }).default('pending'), // pending, confirmed, rejected
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
  confirmedAt: timestamp('confirmed_at'),
});

// Withdrawals table
export const withdrawals = pgTable('withdrawals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  address: text('address').notNull(),
  status: varchar('status', { length: 20 }).default('pending'), // pending, processing, completed, rejected
  txid: text('txid'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

// Daily Profits table (for tracking daily earnings)
export const dailyProfits = pgTable('daily_profits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  investmentId: integer('investment_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  profitDate: timestamp('profit_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  investments: many(userInvestments),
  payments: many(payments),
  withdrawals: many(withdrawals),
  dailyProfits: many(dailyProfits),
  referrer: one(users, { fields: [users.referredBy], references: [users.id] }),
  currentPlan: one(investmentPlans, { fields: [users.currentPlanId], references: [investmentPlans.id] }),
}));

export const investmentPlansRelations = relations(investmentPlans, ({ many }) => ({
  investments: many(userInvestments),
  users: many(users),
}));

export const userInvestmentsRelations = relations(userInvestments, ({ one, many }) => ({
  user: one(users, { fields: [userInvestments.userId], references: [users.id] }),
  plan: one(investmentPlans, { fields: [userInvestments.planId], references: [investmentPlans.id] }),
  payments: many(payments),
  dailyProfits: many(dailyProfits),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  investment: one(userInvestments, { fields: [payments.investmentId], references: [userInvestments.id] }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  user: one(users, { fields: [withdrawals.userId], references: [users.id] }),
}));

export const dailyProfitsRelations = relations(dailyProfits, ({ one }) => ({
  user: one(users, { fields: [dailyProfits.userId], references: [users.id] }),
  investment: one(userInvestments, { fields: [dailyProfits.investmentId], references: [userInvestments.id] }),
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type InvestmentPlan = typeof investmentPlans.$inferSelect;
export type InsertInvestmentPlan = typeof investmentPlans.$inferInsert;
export type UserInvestment = typeof userInvestments.$inferSelect;
export type InsertUserInvestment = typeof userInvestments.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertWithdrawal = typeof withdrawals.$inferInsert;
export type DailyProfit = typeof dailyProfits.$inferSelect;
export type InsertDailyProfit = typeof dailyProfits.$inferInsert;