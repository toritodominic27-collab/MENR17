const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const config = require('./config');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Import TRON services
const paymentService = require('./services/paymentService');
const TronService = require('./services/tronService'); // Import TronService class
const dbService = require('./services/databaseService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Session configuration
app.use(session({
  secret: 'merac-session-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize TronService and add payment monitoring
let tronServiceInstance;
try {
  tronServiceInstance = new TronService(); // Use the imported TronService class
  console.log('تم تهيئة خدمة TRON بنجاح');

  // Start payment monitoring
  tronServiceInstance.monitorPayments((payment) => {
    console.log('تم رصد دفعة جديدة:', payment);
    // Broadcast to all connected clients
    io.emit('paymentReceived', payment);
  });
} catch (error) {
  console.error('خطأ في تهيئة خدمة TRON:', error);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Payment service event handlers
paymentService.on('deposit', (data) => {
  io.to(`user_${data.userId}`).emit('depositConfirmed', {
    amount: data.amount,
    txid: data.txid,
    message: `تم تأكيد إيداع ${data.amount} USDT`
  });
});

paymentService.on('withdrawalCompleted', (data) => {
  io.to(`user_${data.userId}`).emit('withdrawalCompleted', {
    amount: data.amount,
    txid: data.txid,
    message: `تم إتمام سحب ${data.amount} USDT`
  });
});

paymentService.on('withdrawalFailed', (data) => {
  io.to(`user_${data.userId}`).emit('withdrawalFailed', {
    error: data.error,
    message: 'فشل في عملية السحب'
  });
});

// Start payment monitoring
paymentService.startMonitoring();

// خطط MERAC والأرباح اليومية
const PLANS = {
  VIP_0: 0,
  VIP_1: 1,
  VIP_2: 2.5,
  VIP_3: 4,
  VIP_4: 8,
  VIP_5: 10,
  VIP_6: 15,
  VIP_7: 25,
  VIP_8: 35,
  VIP_9: 60,
  VIP_10: 85,
  VIP_11: 100,
  VIP_Bronze: 200,
  VIP_Silver: 400,
  VIP_Golden: 700,
  VIP_Diamond: 1000
};



// Thread-safe data operations
let dataLock = false;
const dataQueue = [];

async function withDataLock(operation) {
  return new Promise((resolve, reject) => {
    dataQueue.push({ operation, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (dataLock || dataQueue.length === 0) return;
  dataLock = true;

  const { operation, resolve, reject } = dataQueue.shift();
  try {
    const result = await operation();
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    dataLock = false;
    processQueue();
  }
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { users: [] };
    writeDataSync(initialData);
    return initialData;
  }

  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return parsed.users ? parsed : { users: parsed };
  } catch {
    return { users: [] };
  }
}

function writeDataSync(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function generateReferralCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getClientIP(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
}

// Middleware للتحقق من الجلسة
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "غير مصرح له" });
  }
  next();
}

// ------------- Auth APIs -------------

app.post('/api/register', async (req, res) => {
  const { username, email, phone, password, referralCode, securityQuestions } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "البريد الإلكتروني وكلمة المرور مطلوبان" });
  }

  if (!securityQuestions || !securityQuestions.school || !securityQuestions.pet || 
      !securityQuestions.plan || !securityQuestions.firstDeposit) {
    return res.status(400).json({ message: "جميع الأسئلة الأمنية مطلوبة" });
  }

  try {
    const result = await withDataLock(async () => {
      const data = readData();

      if (data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("البريد الإلكتروني موجود بالفعل");
      }

      const clientIP = getClientIP(req);
      const hashedPassword = await bcrypt.hash(password, 10);
      const referralCode = generateReferralCode();

      // التحقق من رمز الإحالة
      let referrerValid = false;
      if (referralCode) {
        const referrer = data.users.find(u => u.referralCode === referralCode);
        if (referrer && !referrer.ipHistory.includes(clientIP)) {
          referrerValid = true;
        }
      }

      const newUser = {
        id: Date.now().toString(),
        username: username || email.split('@')[0],
        email,
        phone: phone || '',
        passwordHash: hashedPassword,
        plan: "VIP_0",
        balance: 0,
        trc20: null,
        referralCode,
        referredBy: referrerValid ? referralCode : null,
        referrals: [],
        ipHistory: [clientIP],
        lastWithdrawalAt: null,
        dayCounter: 0,
        pendingReferralGate: false,
        registeredAt: new Date().toISOString(),
        securityQuestions: {
          school: securityQuestions.school.toLowerCase().trim(),
          pet: securityQuestions.pet.toLowerCase().trim(),
          plan: securityQuestions.plan,
          firstDeposit: parseInt(securityQuestions.firstDeposit)
        }
      };

      data.users.push(newUser);
      writeDataSync(data);
      return newUser;
    });

    res.status(201).json({ 
      message: "تم تسجيل المستخدم بنجاح",
      referralCode: result.referralCode
    });
  } catch (error) {
    res.status(409).json({ message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "البريد الإلكتروني وكلمة المرور مطلوبان" });
  }

  const data = readData();
  const user = data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }

  let validPassword = false;

  // التحقق من كلمة المرور المشفرة أولاً
  if (user.passwordHash) {
    validPassword = await bcrypt.compare(password, user.passwordHash);
  }
  // التحقق من كلمة المرور القديمة غير المشفرة للتوافق
  else if (user.password && user.password === password) {
    validPassword = true;

    // تشفير كلمة المرور القديمة وحفظها
    try {
      await withDataLock(async () => {
        const data = readData();
        const userIndex = data.users.findIndex(u => u.id === user.id);
        if (userIndex !== -1) {
          const hashedPassword = await bcrypt.hash(password, 10);
          data.users[userIndex].passwordHash = hashedPassword;
          delete data.users[userIndex].password; // حذف كلمة المرور القديمة
          writeDataSync(data);
        }
      });
    } catch (error) {
      console.error('خطأ في تشفير كلمة المرور:', error);
    }
  }

  if (!validPassword) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }

  req.session.userId = user.id;
  res.json({ 
    message: "تم تسجيل الدخول بنجاح",
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: "تم تسجيل الخروج بنجاح" });
});

// ------------- Password Reset APIs -------------

// استرداد كلمة المرور بالأسئلة الأمنية
app.post('/api/forgot-password-security', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "البريد الإلكتروني مطلوب" });
  }

  try {
    const data = readData();
    const user = data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(404).json({ message: "لم يتم العثور على حساب بهذا البريد الإلكتروني" });
    }

    if (!user.securityQuestions) {
      return res.status(400).json({ message: "لا توجد أسئلة أمنية مسجلة لهذا الحساب" });
    }

    // إرجاع الأسئلة للمستخدم
    res.json({
      success: true,
      questions: [
        "ما هو اسم أول مدرسة التحقت بها؟",
        "ما هو اسم حيوانك الأليف المفضل؟",
        "ما هي خطة الاستثمار التي تنوي الاشتراك بها؟",
        "ما هو مبلغ أول إيداع تخطط لإيداعه؟ (بالدولار)"
      ]
    });
  } catch (error) {
    console.error('خطأ في جلب الأسئلة الأمنية:', error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الأسئلة الأمنية" });
  }
});

// التحقق من الأجوبة وإعادة تعيين كلمة المرور
app.post('/api/reset-password-security', async (req, res) => {
  const { email, answers, newPassword } = req.body;

  if (!email || !answers || !newPassword) {
    return res.status(400).json({ message: "جميع الحقول مطلوبة" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
  }

  try {
    const data = readData();
    const user = data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

    if (!user || !user.securityQuestions) {
      return res.status(404).json({ message: "المستخدم أو الأسئلة الأمنية غير موجودة" });
    }

    // التحقق من الأجوبة
    const correctAnswers = [
      answers[0] && answers[0].toLowerCase().trim() === user.securityQuestions.school,
      answers[1] && answers[1].toLowerCase().trim() === user.securityQuestions.pet,
      answers[2] && answers[2] === user.securityQuestions.plan,
      answers[3] && parseInt(answers[3]) === user.securityQuestions.firstDeposit
    ];

    const correctCount = correctAnswers.filter(Boolean).length;

    if (correctCount < 3) {
      return res.status(400).json({ 
        message: `الأجوبة غير صحيحة. يجب الإجابة بشكل صحيح على 3 أسئلة على الأقل من أصل 4` 
      });
    }

    // تحديث كلمة المرور
    await withDataLock(async () => {
      const data = readData();
      const userIndex = data.users.findIndex(u => u.id === user.id);

      if (userIndex !== -1) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        data.users[userIndex].passwordHash = hashedPassword;

        if (data.users[userIndex].password) {
          delete data.users[userIndex].password;
        }

        writeDataSync(data);
      }
    });

    res.json({ 
      message: "تم تحديث كلمة المرور بنجاح باستخدام الأسئلة الأمنية",
      correctAnswers: correctCount
    });
  } catch (error) {
    console.error('خطأ في إعادة تعيين كلمة المرور:', error);
    res.status(500).json({ message: "حدث خطأ أثناء تحديث كلمة المرور" });
  }
});



// ------------- User Profile APIs -------------

app.get('/api/me', requireAuth, (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.id === req.session.userId);

  if (!user) {
    return res.status(404).json({ message: "المستخدم غير موجود" });
  }

  const now = new Date();
  const lastWithdrawal = user.lastWithdrawalAt ? new Date(user.lastWithdrawalAt) : null;
  const nextEligibleAt = lastWithdrawal ? new Date(lastWithdrawal.getTime() + 24 * 60 * 60 * 1000) : now;

  res.json({
    id: user.id,
    email: user.email,
    plan: user.plan || "VIP_0",
    trc20: user.trc20,
    dayCounter: user.dayCounter || 0,
    pendingReferralGate: user.pendingReferralGate || false,
    lastWithdrawalAt: user.lastWithdrawalAt,
    nextEligibleAtISO: nextEligibleAt.toISOString(),
    canWithdraw: now >= nextEligibleAt && !user.pendingReferralGate && user.plan !== "VIP_0",
    dailyProfit: PLANS[user.plan] || 0,
    referralCode: user.referralCode
  });
});

// ------------- Subscription APIs -------------

app.post('/api/subscribe', requireAuth, async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLANS[plan] || plan === "VIP_0") {
    return res.status(400).json({ message: "خطة غير صالحة" });
  }

  try {
    await withDataLock(async () => {
      const data = readData();
      const userIndex = data.users.findIndex(u => u.id === req.session.userId);

      if (userIndex === -1) {
        throw new Error("المستخدم غير موجود");
      }

      const user = data.users[userIndex];
      const oldPlan = user.plan;
      user.plan = plan;

      // التحقق من الإحالات المحققة
      if (user.referredBy) {
        const referrer = data.users.find(u => u.referralCode === user.referredBy);
        if (referrer) {
          const referrerPlanLevel = getPlanLevel(referrer.plan);
          const newUserPlanLevel = getPlanLevel(plan);

          // إذا كان المُحال اشترك في خطة مساوية أو أعلى
          if (newUserPlanLevel >= referrerPlanLevel) {
            // أضف الإحالة المحققة
            if (!referrer.referrals.find(r => r.userId === user.id)) {
              referrer.referrals.push({
                userId: user.id,
                plan: plan,
                ip: user.ipHistory[user.ipHistory.length - 1],
                createdAt: new Date().toISOString()
              });

              // حرر المحيل من بوابة الإحالة إن كان معلقًا
              if (referrer.pendingReferralGate) {
                referrer.pendingReferralGate = false;
                referrer.dayCounter = 0;
              }
            }
          }
        }
      }

      writeDataSync(data);
    });

    res.json({ message: `تم الاشتراك في ${plan} بنجاح` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function getPlanLevel(planName) {
  const levels = {
    VIP_0: 0, VIP_1: 1, VIP_2: 2, VIP_3: 3, VIP_4: 4, VIP_5: 5,
    VIP_6: 6, VIP_7: 7, VIP_8: 8, VIP_9: 9, VIP_10: 10, VIP_11: 11,
    VIP_Bronze: 12, VIP_Silver: 13, VIP_Golden: 14, VIP_Diamond: 15
  };
  return levels[planName] || 0;
}

// ------------- Withdrawal Timer API -------------

app.get('/api/withdrawal-timer', requireAuth, async (req, res) => {
  try {
    const data = readData();
    const user = data.users.find(u => u.id === req.session.userId);

    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const now = new Date();
    let canWithdraw = true;
    let lastWithdrawal = null;

    // التحقق من آخر سحبة
    if (user.lastWithdrawalAt) {
      const lastWithdrawalDate = new Date(user.lastWithdrawalAt);
      const timeDiff = now - lastWithdrawalDate;
      const hoursPassed = timeDiff / (1000 * 60 * 60);

      if (hoursPassed < 24) {
        canWithdraw = false;
      }

      lastWithdrawal = user.lastWithdrawalAt;
    }

    // التحقق من الخطة والاشتراك
    if (user.plan === "VIP_0") {
      canWithdraw = false;
    }

    // التحقق من بوابة الإحالة
    if (user.pendingReferralGate) {
      canWithdraw = false;
    }

    res.json({
      success: true,
      canWithdraw: canWithdraw,
      lastWithdrawal: lastWithdrawal,
      subscriptionTime: user.subscriptionDate || user.createdAt || new Date().toISOString(),
      plan: user.plan,
      pendingReferralGate: user.pendingReferralGate || false
    });
  } catch (error) {
    console.error('خطأ في جلب بيانات التايمر:', error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات التايمر" });
  }
});

// ------------- Withdrawal APIs -------------

app.post('/api/withdraw-daily', requireAuth, async (req, res) => {
  const { trc20 } = req.body;

  if (!trc20 || !trc20.startsWith('T')) {
    return res.status(400).json({ message: "عنوان TRC20 غير صالح" });
  }

  try {
    const result = await withDataLock(async () => {
      const data = readData();
      const userIndex = data.users.findIndex(u => u.id === req.session.userId);

      if (userIndex === -1) {
        throw new Error("المستخدم غير موجود");
      }

      const user = data.users[userIndex];

      // التحقق من الخطة
      if (user.plan === "VIP_0") {
        throw new Error("يجب الاشتراك في خطة استثمار أولاً");
      }

      // التحقق من بوابة الإحالة
      if (user.pendingReferralGate) {
        throw new Error("يجب إحالة شخص يشترك في خطة مساوية أو أعلى للمتابعة");
      }

      // التحقق من الوقت (24 ساعة بالضبط)
      const now = new Date();
      if (user.lastWithdrawalAt) {
        const lastWithdrawal = new Date(user.lastWithdrawalAt);
        const timeDiff = now - lastWithdrawal;
        const hoursPassed = timeDiff / (1000 * 60 * 60);

        if (hoursPassed < 24) {
          const hoursLeft = Math.ceil(24 - hoursPassed);
          throw new Error(`يمكن السحب بعد ${hoursLeft} ساعة`);
        }
      }

      // حفظ عنوان TRC20
      user.trc20 = trc20;


// ------------- Withdrawal History API -------------

app.get('/api/withdrawal-history', requireAuth, (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.id === req.session.userId);

  if (!user) {
    return res.status(404).json({ message: "المستخدم غير موجود" });
  }

  const withdrawalHistory = user.withdrawalHistory || [];

  res.json({
    success: true,
    withdrawals: withdrawalHistory.map(w => ({
      id: w.id,
      type: w.type,
      amount: w.amount,
      address: w.address ? `${w.address.substring(0, 10)}...${w.address.substring(-8)}` : '',
      status: w.status,
      createdAt: w.createdAt,
      processedAt: w.processedAt
    }))
  });
});


      // صرف الربح اليومي
      const dailyProfit = PLANS[user.plan];

      // إضافة سجل السحب التقليدي
      if (!user.withdrawalHistory) {
        user.withdrawalHistory = [];
      }

      user.withdrawalHistory.push({
        id: Date.now().toString(),
        type: 'daily_profit',
        amount: dailyProfit,
        address: trc20,
        status: 'completed',
        createdAt: now.toISOString(),
        processedAt: now.toISOString()
      });

      // تحديث العدادات
      user.lastWithdrawalAt = now.toISOString();
      user.dayCounter += 1;

      // إذا وصل العداد إلى 2، فعل بوابة الإحالة
      if (user.dayCounter === 2) {
        user.pendingReferralGate = true;
      }

      writeDataSync(data);
      return { amount: dailyProfit, address: trc20 };
    });

    res.json({ 
      success: true,
      message: `تم صرف ${result.amount} USDT إلى ${result.address}`,
      amount: result.amount
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ------------- Referral APIs -------------

app.get('/api/referral-link', requireAuth, (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.id === req.session.userId);

  if (!user) {
    return res.status(404).json({ message: "المستخدم غير موجود" });
  }

  const baseUrl = req.protocol + '://' + req.get('host');
  const referralLink = `${baseUrl}/?ref=${user.referralCode}`;

  res.json({
    referralCode: user.referralCode,
    referralLink: referralLink
  });
});

app.get('/api/referrals/status', requireAuth, (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.id === req.session.userId);

  if (!user) {
    return res.status(404).json({ message: "المستخدم غير موجود" });
  }

  res.json({
    referrals: user.referrals,
    pendingReferralGate: user.pendingReferralGate,
    dayCounter: user.dayCounter,
    totalReferrals: user.referrals.length
  });
});

// ------------- Legacy APIs (متوافق مع الكود الحالي) -------------

let currentLoggedInUser = null;

// Legacy login for compatibility
app.post('/api/login-legacy', async (req, res) => {
  const { email, password } = req.body;
  const data = readData();
  const user = data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }

  // للتوافق مع البيانات القديمة
  if (user.password && user.password === password) {
    currentLoggedInUser = user;
    req.session.userId = user.id;
    return res.json({
      message: "تم تسجيل الدخول بنجاح",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance || 0,
        plan: user.plan
      }
    });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
  }

  currentLoggedInUser = user;
  req.session.userId = user.id;
  res.json({
    message: "تم تسجيل الدخول بنجاح",
    user: {
      id: user.id,
      username: user.username || user.email.split('@')[0],
      email: user.email,
      balance: user.balance || 0,
      plan: user.plan
    }
  });
});

// Get current user (legacy compatibility)
app.get('/api/current-user', (req, res) => {
  let user = null;

  if (req.session.userId) {
    const data = readData();
    user = data.users.find(u => u.id === req.session.userId);
  } else if (currentLoggedInUser) {
    user = currentLoggedInUser;
  }

  if (user) {
    res.json({
      id: user.id,
      username: user.username || user.email?.split('@')[0] || 'مستخدم',
      email: user.email,
      referralCount: user.referrals?.length || 0,
      balance: user.balance || 0,
      plan: user.plan,
      accountId: `MRC-${user.id.toString().padStart(5, '0')}`
    });
  } else {
    res.json({
      id: '00000',
      username: 'مستخدم تجريبي',
      email: 'demo@example.com',
      referralCount: 0,
      balance: 0,
      plan: null,
      accountId: 'MRC-00000'
    });
  }
});

// Legacy deposit API (للتوافق)
app.get('/api/deposit-address', (req, res) => {
  res.json({ address: config.TRC20_ADDRESS || "TQn9Y2khEsLMWuNKaFMgfS4VGNgUE5TnqF", network: "TRC20" });
});

// ------------- TRON Payment APIs -------------

// Get deposit address for user
app.get('/api/depositAddress', requireAuth, async (req, res) => {
  try {
    const address = tronServiceInstance ? tronServiceInstance.getCompanyAddress() : process.env.COMPANY_TRC20_ADDRESS;
    res.json({ 
      success: true, 
      address: address || 'TR4Z3fYtTgGp5McMcyQrNgGjRL6jQESXBx'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get deposit address' 
    });
  }
});

// Get user USDT balance
app.get('/api/balance', requireAuth, async (req, res) => {
  try {
    const balance = await dbService.getUserBalance(req.session.userId);
    res.json({
      success: true,
      balance: balance.balance,
      lockedBalance: balance.locked_balance,
      availableBalance: balance.balance - balance.locked_balance
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get balance' 
    });
  }
});

// Request withdrawal
app.post('/api/withdraw', requireAuth, async (req, res) => {
  const { toAddress, amount } = req.body;

  if (!toAddress || !amount) {
    return res.status(400).json({ 
      success: false, 
      error: 'Address and amount are required' 
    });
  }

  try {
    const result = await paymentService.requestWithdrawal(
      req.session.userId,
      toAddress,
      parseFloat(amount)
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process withdrawal' 
    });
  }
});

// Get transaction history
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const transactions = await paymentService.getUserTransactions(req.session.userId);
    res.json({
      success: true,
      ...transactions
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get transactions' 
    });
  }
});

// Validate TRON address
app.post('/api/validateAddress', (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ 
      success: false, 
      error: 'Address is required' 
    });
  }

  const isValid = tronServiceInstance.isValidAddress(address); // Use tronServiceInstance
  res.json({
    success: true,
    valid: isValid
  });
});

// Get network info
app.get('/api/networkInfo', (req, res) => {
  res.json({
    network: process.env.TRON_NETWORK || 'mainnet',
    usdtContract: process.env.TRON_NETWORK === 'mainnet' 
      ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' 
      : 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'
  });
});

// Manual deposit check (for testing)
app.post('/api/checkDeposits', requireAuth, async (req, res) => {
  try {
    const userAddress = await dbService.getUserAddress(req.session.userId);
    if (userAddress) {
      await paymentService.checkUserDeposits(req.session.userId, userAddress.address);
      res.json({ 
        success: true, 
        message: 'Deposit check completed' 
      });
    } else {
      res.json({ 
        success: false, 
        error: 'No deposit address found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check deposits' 
    });
  }
});

// ------------- Admin/Test APIs -------------

app.get('/api/users', (req, res) => {
  const data = readData();
  const safeUsers = data.users.map(user => ({
    id: user.id,
    email: user.email,
    plan: user.plan,
    referralCode: user.referralCode,
    referrals: user.referrals?.length || 0,
    dayCounter: user.dayCounter,
    pendingReferralGate: user.pendingReferralGate
  }));
  res.json(safeUsers);
});

// Test subscription endpoint
app.post('/api/test-subscribe', requireAuth, async (req, res) => {
  const { plan } = req.body;

  if (!plan || !PLANS[plan]) {
    return res.status(400).json({ message: "خطة غير صالحة" });
  }

  try {
    await withDataLock(async () => {
      const data = readData();
      const userIndex = data.users.findIndex(u => u.id === req.session.userId);

      if (userIndex !== -1) {
        data.users[userIndex].plan = plan;
        writeDataSync(data);
      }
    });

    res.json({ message: `تم تحديث الخطة إلى ${plan}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API endpoint for deposit address
app.get('/api/depositAddress', (req, res) => {
  res.json({ 
    success: true, 
    address: process.env.COMPANY_TRC20_ADDRESS || 'TR4Z3fYtTgGp5McMcyQrNgGjRL6jQESXBx' 
  });
});

// API endpoint for current user (mock for now)
app.get('/api/current-user', (req, res) => {
  // For development - return mock user data
  res.json({ 
    id: 'user_123', 
    name: 'Test User',
    email: 'user@example.com'
  });
});

// API endpoint for network info
app.get('/api/networkInfo', (req, res) => {
  res.json({
    network: process.env.TRON_NETWORK || 'mainnet',
    usdtContract: process.env.TRON_NETWORK === 'mainnet' 
      ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' 
      : 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'
  });
});

// API endpoint for balance (mock)
app.get('/api/balance', (req, res) => {
  res.json({
    success: true,
    balance: 0,
    availableBalance: 0
  });
});

// API endpoint for transactions (mock)
app.get('/api/transactions', (req, res) => {
  res.json({
    success: true,
    deposits: [],
    withdrawals: []
  });
});


// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MERAC Server running at http://0.0.0.0:${PORT}`);
  console.log('TRON Payment System initialized!');
  console.log('Network:', process.env.TRON_NETWORK || 'testnet');
  console.log('WebSocket server ready for real-time notifications');
});