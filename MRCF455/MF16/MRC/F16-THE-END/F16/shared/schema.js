
// Simple schema for basic functionality
const userSchema = {
  id: 'string',
  email: 'string',
  passwordHash: 'string',
  plan: 'string',
  trc20: 'string',
  referralCode: 'string',
  referredBy: 'string',
  referrals: 'array',
  ipHistory: 'array',
  lastWithdrawalAt: 'string',
  dayCounter: 'number',
  pendingReferralGate: 'boolean',
  registeredAt: 'string'
};

module.exports = {
  userSchema
};
