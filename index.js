const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// 🌐 Keep alive
const app = express();
app.get('/', (req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// 🔐 Admin and Constants
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const COIN_VALUE_BIRR = 1;

// 📦 Database
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [], deposits: [], withdrawals: [] });

// 🤖 Bot Setup
const bot = new Telegraf(process.env.BOT_TOKEN);
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then((info) => (botUsername = info.username));

// Memory stores
const pendingOTPs = {};
const pendingDeposits = {};
const pendingWithdraws = {};

// 🧾 Menu
bot.start((ctx) => {
  const name = ctx.from.first_name;
  ctx.reply(
    `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below.`,
    Markup.keyboard([
      ['💰 Deposit Money', '💸 Withdraw Money'],
      ['💼 Check Balance', '📝 Register'],
      ['📢 Referral Link', '🔍 My ID'],
      ['📄 Transactions', '💱 Coin Rates']
    ]).resize()
  );
});

// 💱 Coin rate
bot.hears('💱 Coin Rates', (ctx) => {
  ctx.reply(`💰 1 Coin = ${COIN_VALUE_BIRR} Birr`);
});

// 🔍 My ID
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your ID: ${ctx.from.id}`);
});

// 📝 Register
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const exists = db.data.users.find((u) => u.id === id);
  if (exists) return ctx.reply('✅ Already registered.');

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  pendingOTPs[id] = otp;

  ctx.reply(`🔒 Enter this OTP to verify: ${otp}`);
});

// ✅ Verify OTP
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  const otp = pendingOTPs[id];
  if (otp && ctx.message.text === otp) {
    await db.read();
    db.data.users.push({
      id,
      name: ctx.from.first_name,
      username: ctx.from.username || '',
      coins: 0,
      referredBy: null,
    });
    await db.write();
    delete pendingOTPs[id];
    ctx.reply('🎉 Registration complete!');
  } else {
    next(); // Pass to next handler
  }
});

// 💼 Check Balance
bot.hears('💼 Check Balance', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find((u) => u.id === id);
  if (!user) return ctx.reply('❗ Not registered. Send /start and then tap Register.');

  ctx.reply(`💼 Balance: ${user.coins} Coins`);
});

// 💰 Deposit Request
bot.hears('💰 Deposit Money', (ctx) => {
  ctx.reply('💵 Send the amount and reference like this:\n\n`100 birr, Ref: 893428`', { parse_mode: 'Markdown' });
  pendingDeposits[ctx.from.id] = true;
});

// Handle deposit text
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id;
  if (pendingDeposits[id]) {
    const msg = ctx.message.text;
    await db.read();
    const user = db.data.users.find((u) => u.id === id);
    if (!user) return ctx.reply('❗ You need to register first.');

    const depositId = Date.now();
    db.data.deposits.push({ userId: id, amount: msg, status: 'pending', depositId });
    await db.write();

    bot.telegram.sendMessage(
      ADMIN_ID,
      `📥 New Deposit Request\n👤 User: ${user.name} (${user.id})\n💬 Message: ${msg}`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_${depositId}`),
        Markup.button.callback('❌ Reject', `reject_${depositId}`)
      ])
    );

    ctx.reply('📨 Your deposit request has been sent to the admin.');
    delete pendingDeposits[id];
  } else {
    next();
  }
});

// 📜 Transactions
bot.hears('📄 Transactions', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const deposits = db.data.deposits.filter(d => d.userId === id);
  const withdrawals = db.data.withdrawals.filter(w => w.userId === id);

  let msg = '📄 *Your Transactions:*\n\n*Deposits:*\n';
  deposits.forEach(d => msg += `- ${d.amount} (${d.status})\n`);
  msg += '\n*Withdrawals:*\n';
  withdrawals.forEach(w => msg += `- ${w.amount} (${w.status})\n`);

  ctx.reply(msg || 'No transactions found.', { parse_mode: 'Markdown' });
});

// ✅ Approve/Reject deposit
bot.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  const admin = ctx.from.id;
  if (parseInt(admin) !== ADMIN_ID) return ctx.answerCbQuery('❌ You are not admin');

  const [cmd, depositId] = action.split('_');
  await db.read();
  const deposit = db.data.deposits.find(d => d.depositId.toString() === depositId);

  if (!deposit) return ctx.answerCbQuery('❗ Not found');

  const user = db.data.users.find(u => u.id === deposit.userId);
  if (!user) return ctx.answerCbQuery('❗ User not found');

  if (cmd === 'approve') {
    user.coins += 100; // Example, or parse from deposit.amount if numeric
    deposit.status = 'approved';
    await db.write();
    ctx.reply('✅ Approved and coins added.');
    bot.telegram.sendMessage(user.id, '🎉 Your deposit was approved and 100 coins were added.');
  } else if (cmd === 'reject') {
    deposit.status = 'rejected';
    await db.write();
    ctx.reply('❌ Deposit rejected.');
    bot.telegram.sendMessage(user.id, '❗ Your deposit request was rejected.');
  }

  ctx.answerCbQuery();
});

bot.launch();
console.log('🤖 Bot is running...');

