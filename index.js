const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// ─── Express Keep‑Alive ───────────────────────────────────────────────────────
const app = express();
app.get('/', (_req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Server listening on port 3000'));

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;
const TELEBIRR_NUMBER = process.env.TELEBIRR_NUMBER;

// ─── LowDB Setup (with defaults) ──────────────────────────────────────────────
const adapter = new JSONFile('db.json');
const db = new Low(adapter, {
  users: [],        // { id, name, username, coins, referredBy }
  deposits: [],     // { id, userId, amount, status, screenshotFileId, timestamp }
  withdrawals: []   // { id, userId, amount, status, timestamp }
});
(async () => { await db.read(); await db.write(); })();

// ─── Bot Init ─────────────────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatUsers() {
  return db.data.users
    .map(u => `👤 ${u.name} (@${u.username}) — ${u.coins} coins`)
    .join('\n') || 'No users yet.';
}
function formatPending() {
  const deps = db.data.deposits.filter(d => d.status === 'pending');
  const wds = db.data.withdrawals.filter(w => w.status === 'pending');
  let out = '';
  if (deps.length) {
    out += '🟢 Pending Deposits:\n' +
           deps.map(d => `• #${d.id} by ${d.userId} — ${d.amount}`).join('\n') +
           '\n\n';
  }
  if (wds.length) {
    out += '🔴 Pending Withdrawals:\n' +
           wds.map(w => `• #${w.id} by ${w.userId} — ${w.amount}`).join('\n');
  }
  return out || 'None';
}

// ─── /start & Menu ────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const id = ctx.from.id.toString();
  await db.read();
  if (!db.data.users.find(u => u.id === id)) {
    db.data.users.push({
      id,
      name: ctx.from.first_name,
      username: ctx.from.username || '',
      coins: 0,
      referredBy: null
    });
    await db.write();
  }
  const menu = [
    ['📝 Register', '💼 Check Balance'],
    ['💰 Deposit Money', '💸 Withdraw Money'],
    ['🔍 My ID', '📊 Transactions']
  ];
  if (id === ADMIN_ID) menu.push(['🛠 Admin Tools']);
  await ctx.reply(
    `👋 Hello, ${ctx.from.first_name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
    Markup.keyboard(menu).resize()
  );
});

// ─── Admin Tools (plain‑text) ─────────────────────────────────────────────────
bot.hears('🛠 Admin Tools', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await db.read();
  const usersList   = formatUsers();
  const pendingList = formatPending();
  await ctx.reply(
    `🔧 Admin Panel\n\n` +
    `👥 All Users:\n${usersList}\n\n` +
    `Pending Requests:\n${pendingList}`
  );
});

// ─── Register (no-op) ─────────────────────────────────────────────────────────
bot.hears('📝 Register', (ctx) => {
  ctx.reply('✅ You’re already registered via /start.');
});

// ─── Check Balance ───────────────────────────────────────────────────────────
bot.hears('💼 Check Balance', async (ctx) => {
  await db.read();
  const u = db.data.users.find(u => u.id.toString() === ctx.from.id.toString());
  ctx.reply(u ? `💰 Your balance: ${u.coins} coins` : '❗ Please /start to register.');
});

// ─── My ID ───────────────────────────────────────────────────────────────────
bot.hears('🔍 My ID', (ctx) => {
  ctx.reply(`🆔 Your Telegram ID: ${ctx.from.id}`);
});

// ─── Transactions History ────────────────────────────────────────────────────
bot.hears('📊 Transactions', async (ctx) => {
  await db.read();
  const uid = ctx.from.id.toString();
  const deps = db.data.deposits.filter(d => d.userId === uid);
  const wds  = db.data.withdrawals.filter(w => w.userId === uid);
  let msg = '📊 Your Transactions:\n\n';
  if (!deps.length && !wds.length) msg += 'No transactions yet.';
  else {
    if (deps.length) msg += '🟢 Deposits:\n' + deps.map(d=>`+${d.amount} (${d.status})`).join('\n') + '\n\n';
    if (wds.length) msg += '🔴 Withdrawals:\n' + wds.map(w=>`-${w.amount} (${w.status})`).join('\n');
  }
  ctx.reply(msg);
});

// ─── Deposit Flow ────────────────────────────────────────────────────────────
bot.hears('💰 Deposit Money', (ctx) => {
  ctx.session.action = 'deposit_amount';
  ctx.reply(
    `💳 To deposit coins:\n` +
    `1. Pay via Telebirr: ${TELEBIRR_NUMBER}\n` +
    `2. Reply with the amount you paid\n` +
    `3. Then send payment screenshot`
  );
});

// ─── Withdraw Flow ───────────────────────────────────────────────────────────
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.session.action = 'withdraw_amount';
  ctx.reply('💸 How many coins would you like to withdraw?');
});

// ─── Unified Text Handler ────────────────────────────────────────────────────
bot.on('message', async (ctx, next) => {
  if (!ctx.session) return next();
  await db.read();
  const uid = ctx.from.id.toString();
  const user = db.data.users.find(u => u.id === uid);
  const text = ctx.message.text && ctx.message.text.trim();

  if (ctx.session.action === 'deposit_amount' && text) {
    const amt = parseInt(text, 10);
    if (isNaN(amt) || amt <= 0) {
      ctx.reply('❗ Enter a valid number.');
      return;
    }
    const id = Date.now();
    db.data.deposits.push({ id, userId: uid, amount: amt, status: 'pending', screenshotFileId: null, timestamp: new Date().toISOString() });
    await db.write();
    ctx.session = { action: 'deposit_screenshot', id };
    return ctx.reply('📸 Please send a screenshot of your payment.');
  }

  if (ctx.session.action === 'withdraw_amount' && text) {
    const amt = parseInt(text, 10);
    if (isNaN(amt) || amt <= 0 || user.coins < amt) {
      ctx.reply('❗ Invalid amount or insufficient balance.');
      ctx.session = null;
      return;
    }
    const id = Date.now();
    db.data.withdrawals.push({ id, userId: uid, amount: amt, status: 'pending', timestamp: new Date().toISOString() });
    await db.write();
    ctx.reply('✅ Withdrawal request submitted.');
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `📤 Withdraw #${id}\nUser: ${user.name} (${uid})\nAmount: ${amt} coins`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_w_${id}`),
        Markup.button.callback('❌ Reject',  `reject_w_${id}`)
      ])
    );
    ctx.session = null;
    return;
  }

  return next();
});

// ─── Photo Handler ───────────────────────────────────────────────────────────
bot.on('photo', async (ctx) => {
  if (!ctx.session || ctx.session.action !== 'deposit_screenshot') return;
  const { id } = ctx.session;
  const fileId = ctx.message.photo.slice(-1)[0].file_id;
  await db.read();
  const dep = db.data.deposits.find(d => d.id === id && d.status === 'pending');
  if (!dep) { ctx.session = null; return; }
  dep.screenshotFileId = fileId;
  await db.write();
  ctx.reply('📨 Deposit submitted for approval.');
  const user = db.data.users.find(u => u.id.toString() === dep.userId);
  await bot.telegram.sendPhoto(
    ADMIN_ID,
    fileId,
    {
      caption: `📥 Deposit #${id}\nUser: ${user.name} (${dep.userId})\nAmount: ${dep.amount}`,
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_d_${id}`),
        Markup.button.callback('❌ Reject',  `reject_d_${id}`)
      ])
    }
  );
  ctx.session = null;
});

// ─── Admin Approvals ─────────────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const [action, type, rawId] = ctx.callbackQuery.data.split('_');
  const id = parseInt(rawId, 10);
  await db.read();

  if (type === 'd') {
    const dep = db.data.deposits.find(d => d.id === id);
    const user = db.data.users.find(u => u.id.toString() === dep.userId);
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery();
    if (action === 'approve') {
      dep.status = 'approved'; user.coins += dep.amount; await db.write();
      ctx.editMessageCaption(`✅ Deposit #${id} approved.`);
      bot.telegram.sendMessage(user.id, `🎉 Your deposit of ${dep.amount} coins was approved!`);
    } else {
      dep.status = 'rejected'; await db.write();
      ctx.editMessageCaption(`❌ Deposit #${id} rejected.`);
      bot.telegram.sendMessage(user.id, `❌ Your deposit of ${dep.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }

  if (type === 'w') {
    const wd = db.data.withdrawals.find(w => w.id === id);
    const user = db.data.users.find(u => u.id.toString() === wd.userId);
    if (!wd || wd.status !== 'pending') return ctx.answerCbQuery();
    if (action === 'approve') {
      wd.status = 'approved'; user.coins -= wd.amount; await db.write();
      ctx.editMessageText(`✅ Withdrawal #${id} approved.`);
      bot.telegram.sendMessage(user.id, `✅ Your withdrawal of ${wd.amount} coins was approved!`);
    } else {
      wd.status = 'rejected'; await db.write();
      ctx.editMessageText(`❌ Withdrawal #${id} rejected.`);
      bot.telegram.sendMessage(user.id, `❌ Your withdrawal of ${wd.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }
});

// ─── Error Handler ───────────────────────────────────────────────────────────
bot.catch(async (err, ctx) => {
  console.error('❌ Bot Error:', err);
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `⚠️ Error caught\nMessage: ${err.message}\nUpdate: ${ctx.updateType}`
  );
});

// ─── Launch ─────────────────────────────────────────────────────────────────
bot.launch().then(() => console.log('🤖 Bot is running!'));
