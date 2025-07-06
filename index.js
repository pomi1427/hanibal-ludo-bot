const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// ─── Express Keep‑Alive ───────────────────────────────────────────────────────
const app = express();
app.get('/', (_req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_ID = process.env.ADMIN_ID;                 // Your Telegram ID
const COIN_VALUE_BIRR = 1;                             // 1 coin = 1 Birr

// ─── LowDB Setup ──────────────────────────────────────────────────────────────
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [], deposits: [], withdrawals: [] });

// Ensure database initialized
(async () => {
  await db.read();
  db.data ||= { users: [], deposits: [], withdrawals: [] };
  await db.write();
})();

// ─── Bot Init ─────────────────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
let botUsername = 'HanibalLudoBot';
bot.telegram.getMe().then(info => botUsername = info.username);

// ─── In‑Memory State ──────────────────────────────────────────────────────────
const pendingOTPs = {};            // userID → OTP
const pendingDepositRequests = {}; // userID → true
const pendingWithdrawRequests = {}; // userID → true

// ─── /start & Main Menu ──────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const isAdmin = ctx.from.id.toString() === ADMIN_ID;
  const menu = [
    ['📝 Register', '💼 Check Balance'],
    ['💰 Deposit Money', '💸 Withdraw Money'],
    ['📢 Referral Link', '🔍 My ID'],
    ['📊 Transactions']
  ];
  if (isAdmin) menu.push(['🛠 Admin Tools']);
  await ctx.reply(
    `👋 Welcome, ${ctx.from.first_name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
    Markup.keyboard(menu).resize()
  );
});

// ─── Registration with OTP ───────────────────────────────────────────────────
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  if (db.data.users.find(u => u.id === id)) {
    return ctx.reply('✅ You are already registered.');
  }
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  pendingOTPs[id] = otp;
  ctx.reply(`🔐 Your OTP: ${otp}\nPlease send it back to complete registration.`);
});
bot.hears(/^\d{4}$/, async (ctx) => {
  const id = ctx.from.id, txt = ctx.message.text;
  if (pendingOTPs[id] === txt) {
    await db.read();
    db.data.users.push({
      id,
      name: ctx.from.first_name,
      username: ctx.from.username || '',
      coins: 0,
      referredBy: null
    });
    delete pendingOTPs[id];
    await db.write();
    return ctx.reply('🎉 Registration complete! You have 0 coins.');
  }
});

// ─── Check Balance ───────────────────────────────────────────────────────────
bot.hears('💼 Check Balance', async (ctx) => {
  await db.read();
  const user = db.data.users.find(u => u.id === ctx.from.id);
  if (!user) return ctx.reply('❗ Please register first with 📝 Register.');
  ctx.reply(`💰 Your balance: ${user.coins} coins`);
});

// ─── Referral Link ───────────────────────────────────────────────────────────
bot.hears('📢 Referral Link', (ctx) => {
  ctx.reply(`🔗 Invite Friends:\nhttps://t.me/${botUsername}?start=${ctx.from.id}`);
});

// ─── My ID ───────────────────────────────────────────────────────────────────
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your Telegram ID: ${ctx.from.id}`);
});

// ─── Transactions History ────────────────────────────────────────────────────
bot.hears('📊 Transactions', async (ctx) => {
  await db.read();
  const uid = ctx.from.id;
  const deps = db.data.deposits.filter(d => d.userId === uid);
  const wds = db.data.withdrawals.filter(w => w.userId === uid);

  let msg = '📊 *Your Transactions:*\n\n';
  if (!deps.length && !wds.length) {
    msg += '_No transactions yet._';
  } else {
    if (deps.length) {
      msg += '🟢 *Deposits:*\n' + deps.map(d => `+${d.amount} (status: ${d.status})`).join('\n') + '\n';
    }
    if (wds.length) {
      msg += '\n🔴 *Withdrawals:*\n' + wds.map(w => `-${w.amount} (status: ${w.status})`).join('\n') + '\n';
    }
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ─── Deposit Flow ────────────────────────────────────────────────────────────
bot.hears('💰 Deposit Money', (ctx) => {
  pendingDepositRequests[ctx.from.id] = true;
  ctx.reply('💵 How many coins would you like to deposit?');
});

// ─── Withdraw Flow ───────────────────────────────────────────────────────────
bot.hears('💸 Withdraw Money', (ctx) => {
  pendingWithdrawRequests[ctx.from.id] = true;
  ctx.reply('💸 How many coins would you like to withdraw?');
});

// ─── Handle Deposit & Withdraw Requests ──────────────────────────────────────
bot.on('text', async (ctx) => {
  const id = ctx.from.id, txt = ctx.message.text.trim();
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) return;

  // Deposit Request
  if (pendingDepositRequests[id]) {
    const amt = parseInt(txt, 10);
    if (isNaN(amt) || amt <= 0) {
      delete pendingDepositRequests[id];
      return ctx.reply('❗ Invalid amount.');
    }
    const requestId = Date.now();
    db.data.deposits.push({ requestId, userId: id, amount: amt, status: 'pending' });
    await db.write();

    delete pendingDepositRequests[id];
    ctx.reply(`📨 Deposit request for ${amt} coins submitted.`);

    // Notify admin
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `📥 Deposit #${requestId}\nUser: ${user.name} (${id})\nAmount: ${amt} coins`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_dep_${requestId}`),
        Markup.button.callback('❌ Reject', `reject_dep_${requestId}`)
      ])
    );
    return;
  }

  // Withdraw Request
  if (pendingWithdrawRequests[id]) {
    const amt = parseInt(txt, 10);
    delete pendingWithdrawRequests[id];
    if (isNaN(amt) || amt <= 0 || user.coins < amt) {
      return ctx.reply('❗ Invalid amount or insufficient balance.');
    }
    const requestId = Date.now();
    db.data.withdrawals.push({ requestId, userId: id, amount: amt, status: 'pending' });
    await db.write();

    ctx.reply(`📨 Withdrawal request for ${amt} coins submitted.`);

    // Notify admin
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `📤 Withdraw #${requestId}\nUser: ${user.name} (${id})\nAmount: ${amt} coins`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_wd_${requestId}`),
        Markup.button.callback('❌ Reject', `reject_wd_${requestId}`)
      ])
    );
    return;
  }
});

// ─── Admin Approval Handlers ─────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const [action, type, reqId] = ctx.callbackQuery.data.split('_');
  await db.read();

  if (type === 'dep') {
    const dep = db.data.deposits.find(d => d.requestId.toString() === reqId);
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery('Invalid');
    const user = db.data.users.find(u => u.id === dep.userId);
    if (action === 'approve') {
      dep.status = 'approved';
      user.coins += dep.amount;
      await db.write();
      ctx.editMessageText(`✅ Deposit #${reqId} approved.`);
      bot.telegram.sendMessage(user.id, `🎉 Your deposit of ${dep.amount} coins was approved!`);
    } else {
      dep.status = 'rejected';
      await db.write();
      ctx.editMessageText(`❌ Deposit #${reqId} rejected.`);
      bot.telegram.sendMessage(dep.userId, `❌ Your deposit of ${dep.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }

  if (type === 'wd') {
    const wd = db.data.withdrawals.find(w => w.requestId.toString() === reqId);
    if (!wd || wd.status !== 'pending') return ctx.answerCbQuery('Invalid');
    const user = db.data.users.find(u => u.id === wd.userId);
    if (action === 'approve') {
      wd.status = 'approved';
      user.coins -= wd.amount;
      await db.write();
      ctx.editMessageText(`✅ Withdrawal #${reqId} approved.`);
      bot.telegram.sendMessage(user.id, `✅ Your withdrawal of ${wd.amount} coins was approved!`);
    } else {
      wd.status = 'rejected';
      await db.write();
      ctx.editMessageText(`❌ Withdrawal #${reqId} rejected.`);
      bot.telegram.sendMessage(wd.userId, `❌ Your withdrawal of ${wd.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }
});

// ─── Launch ─────────────────────────────────────────────────────────────────
bot.launch();
console.log('🤖 Bot is running...');
