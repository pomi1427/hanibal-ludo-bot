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
const ADMIN_ID = process.env.ADMIN_ID;                    // Your Telegram ID
const COIN_VALUE_BIRR = 1;                                // 1 coin = 1 Birr
const TELEBIRR_NUMBER = process.env.TELEBIRR_NUMBER;      // From env

// ─── LowDB Setup ──────────────────────────────────────────────────────────────
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [], deposits: [], withdrawals: [] });
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
const pendingOTPs = {};             // userId → otp
const pendingDeposits = {};         // userId → { step, amount }
const pendingWithdrawals = {};      // userId → true

// ─── /start & Menu ────────────────────────────────────────────────────────────
bot.start((ctx) => {
  const isAdmin = ctx.from.id.toString() === ADMIN_ID;
  const menu = [
    ['📝 Register', '💼 Check Balance'],
    ['💰 Deposit Money', '💸 Withdraw Money'],
    ['📢 Referral Link', '🔍 My ID'],
    ['📊 Transactions']
  ];
  if (isAdmin) menu.push(['🛠 Admin Tools']);
  ctx.reply(
    `👋 Welcome, ${ctx.from.first_name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
    Markup.keyboard(menu).resize()
  );
});

// ─── Register with OTP ────────────────────────────────────────────────────────
bot.hears('📝 Register', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  if (db.data.users.find(u => u.id === id)) return ctx.reply('✅ Already registered.');
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  pendingOTPs[id] = otp;
  ctx.reply(`🔐 Your OTP: ${otp}\nSend it back exactly to complete registration.`);
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
    ctx.reply('🎉 Registration complete! You have 0 coins.');
  }
});

// ─── Balance, Referral, ID, Transactions ─────────────────────────────────────
bot.hears('💼 Check Balance', async (ctx) => {
  await db.read();
  const u = db.data.users.find(u => u.id === ctx.from.id);
  return ctx.reply(u ? `💰 Your balance: ${u.coins} coins` : '❗ Please register first.');
});
bot.hears('📢 Referral Link', (ctx) => {
  ctx.reply(`🔗 Invite:\nhttps://t.me/${botUsername}?start=${ctx.from.id}`);
});
bot.hears('🔍 My ID', (ctx) => ctx.reply(`🆔 Your Telegram ID: ${ctx.from.id}`));
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
      msg += '🟢 *Deposits:*\n' + deps.map(d=>`+${d.amount} (${d.status})`).join('\n') + '\n';
    }
    if (wds.length) {
      msg += '\n🔴 *Withdrawals:*\n' + wds.map(w=>`-${w.amount} (${w.status})`).join('\n') + '\n';
    }
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ─── Deposit Flow with Screenshot ────────────────────────────────────────────
bot.hears('💰 Deposit Money', (ctx) => {
  pendingDeposits[ctx.from.id] = { step: 'await_amount' };
  ctx.reply(
    `💳 To deposit coins:\n` +
    `1. Pay via Telebirr: *${TELEBIRR_NUMBER}*\n` +
    `2. Reply with the amount you paid.`,
    { parse_mode: 'Markdown' }
  );
});
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id, txt = ctx.message.text.trim();
  const pd = pendingDeposits[id];
  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (pd && pd.step === 'await_amount') {
    const amt = parseInt(txt,10);
    if (isNaN(amt) || amt<=0) {
      delete pendingDeposits[id];
      return ctx.reply('❗ Invalid amount.');
    }
    pd.step = 'await_screenshot';
    pd.amount = amt;
    return ctx.reply('📸 Please send a screenshot of your payment now.');
  }
  return next();
});
bot.on('photo', async (ctx) => {
  const id = ctx.from.id;
  const pd = pendingDeposits[id];
  if (pd && pd.step === 'await_screenshot') {
    const fileId = ctx.message.photo.slice(-1)[0].file_id;
    const requestId = Date.now();
    db.data.deposits.push({
      requestId, userId: id, amount: pd.amount, status: 'pending', screenshot: fileId
    });
    await db.write();
    delete pendingDeposits[id];
    ctx.reply(`📨 Deposit of ${pd.amount} coins submitted with screenshot.`);
    // Notify admin
    await bot.telegram.sendPhoto(
      ADMIN_ID,
      fileId,
      {
        caption: `📥 Deposit #${requestId}\nUser: ${user.name} (${id})\nAmount: ${pd.amount} coins`,
        ...Markup.inlineKeyboard([
          Markup.button.callback('✅ Approve', `approve_dep_${requestId}`),
          Markup.button.callback('❌ Reject', `reject_dep_${requestId}`)
        ])
      }
    );
  }
});

// ─── Withdraw Flow ───────────────────────────────────────────────────────────
bot.hears('💸 Withdraw Money', (ctx) => {
  pendingWithdrawals[ctx.from.id] = true;
  ctx.reply('💸 How many coins would you like to withdraw?');
});

// ─── Handle Withdraw Amount ──────────────────────────────────────────────────
bot.on('text', async (ctx, next) => {
  const id = ctx.from.id, txt = ctx.message.text.trim();
  if (pendingWithdrawals[id]) {
    delete pendingWithdrawals[id];
    await db.read();
    const user = db.data.users.find(u => u.id === id);
    const amt = parseInt(txt,10);
    if (isNaN(amt)||amt<=0||user.coins<amt) {
      return ctx.reply('❗ Invalid amount or insufficient balance.');
    }
    const requestId = Date.now();
    db.data.withdrawals.push({ requestId, userId: id, amount: amt, status: 'pending' });
    await db.write();
    ctx.reply(`📨 Withdrawal request for ${amt} coins submitted.`);
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
  return next();
});

// ─── Admin Approval ──────────────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const [action, type, reqId] = ctx.callbackQuery.data.split('_');
  await db.read();

  if (type === 'dep') {
    const dep = db.data.deposits.find(d => d.requestId.toString()===reqId);
    if (!dep||dep.status!=='pending') return ctx.answerCbQuery('Invalid');
    const user = db.data.users.find(u=>u.id===dep.userId);
    if (action==='approve') {
      dep.status='approved'; user.coins+=dep.amount;
      await db.write();
      ctx.editMessageCaption(`✅ Deposit #${reqId} approved.`);
      bot.telegram.sendMessage(user.id, `🎉 Your deposit of ${dep.amount} coins was approved!`);
    } else {
      dep.status='rejected'; await db.write();
      ctx.editMessageCaption(`❌ Deposit #${reqId} rejected.`);
      bot.telegram.sendMessage(dep.userId, `❌ Your deposit of ${dep.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }

  if (type==='wd') {
    const wd = db.data.withdrawals.find(w=>w.requestId.toString()===reqId);
    if (!wd||wd.status!=='pending') return ctx.answerCbQuery('Invalid');
    const user = db.data.users.find(u=>u.id===wd.userId);
    if (action==='approve') {
      wd.status='approved'; user.coins-=wd.amount;
      await db.write();
      ctx.editMessageText(`✅ Withdrawal #${reqId} approved.`);
      bot.telegram.sendMessage(user.id, `✅ Your withdrawal of ${wd.amount} coins was approved!`);
    } else {
      wd.status='rejected'; await db.write();
      ctx.editMessageText(`❌ Withdrawal #${reqId} rejected.`);
      bot.telegram.sendMessage(wd.userId, `❌ Your withdrawal of ${wd.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }
});

// ─── Launch ─────────────────────────────────────────────────────────────────
bot.launch();
console.log('🤖 Bot is running...');

