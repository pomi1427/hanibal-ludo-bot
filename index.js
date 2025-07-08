const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
require('dotenv').config();
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Express Keep‑Alive
const app = express();
app.get('/', (_req, res) => res.send('🤖 Hanibal Bot is alive!'));
app.listen(3000, () => console.log('🌐 Web server running on port 3000'));

// Constants
const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;
const TELEBIRR_NUMBER = process.env.TELEBIRR_NUMBER;

// LowDB Setup…
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { users: [], deposits: [], withdrawals: [] });
(async () => { await db.read(); await db.write(); })();

// ─── Bot Init & Session ───────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
// ←——— insert this next line
bot.use(session());

bot.telegram.getMe().then(info => {
  bot.options.username = info.username; // so your code can reference bot.options.username
});


// ——— Helpers ————————————————————————————————————————————————————————
function ensureUser(id, first_name, username, referrerId) {
  const exists = db.data.users.find(u => u.id === id);
  if (!exists) {
    db.data.users.push({
      id,
      name: first_name,
      username: username || '',
      coins: 0,
      referredBy: referrerId || null
    });
  }
}
function listUsers() {
  return db.data.users.map(u => `👤 ${u.name} (@${u.username}) — ${u.coins} coins`).join('\n') || 'No users yet.';
}
function listPending() {
  const deps = db.data.deposits.filter(d => d.status === 'pending');
  const wds = db.data.withdrawals.filter(w => w.status === 'pending');
  let msg = '';
  if (deps.length) {
    msg += '🟢 *Pending Deposits:*\n';
    deps.forEach(d => msg += `• #${d.id} by ${d.userId} — ${d.amount} coins\n`);
    msg += '\n';
  }
  if (wds.length) {
    msg += '🔴 *Pending Withdrawals:*\n';
    wds.forEach(w => msg += `• #${w.id} by ${w.userId} — ${w.amount} coins\n`);
  }
  return msg || 'No pending requests.';
}

// ——— /start with referral support —————————————————————————————————————————
bot.start(async (ctx) => {
  const id = ctx.from.id;
  const ref = ctx.startPayload;  // payload from /start?start=<ref>
  await db.read();
  ensureUser(id, ctx.from.first_name, ctx.from.username, ref);
  await db.write();

  // Build menu
  const isAdmin = id.toString() === ADMIN_ID;
  const menu = [
    ['📝 Register', '💼 Check Balance'],
    ['💰 Deposit Money', '💸 Withdraw Money'],
    ['📢 Referral Link', '🔍 My ID'],
    ['📊 Transactions']
  ];
  if (isAdmin) menu.push(['🛠 Admin Tools']);

  await ctx.reply(
    `👋 Welcome, ${ctx.from.first_name}!\n` +
    `💰 1 Coin = ${COIN_VALUE_BIRR} Birr\n` +
    `Use the menu below:`,
    Markup.keyboard(menu).resize()
  );
});

// ——— User Commands ————————————————————————————————————————————————————
// /referrals — list users referred by me
bot.command('referrals', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const referred = db.data.users.filter(u => u.referredBy === id.toString());
  if (!referred.length) return ctx.reply('😕 You haven’t referred anyone yet.');
  const lines = referred.map(u => `👤 ${u.name} (@${u.username})`);
  ctx.reply(`📢 *Your Referrals:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
});

// /users — admin only, lists all users
bot.command('users', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await db.read();
  ctx.reply(`👥 *All Users:*\n\n${listUsers()}`, { parse_mode: 'Markdown' });
});

// /pending — admin only, show all pending
bot.command('pending', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await db.read();
  ctx.reply(listPending(), { parse_mode: 'Markdown' });
});

// ——— Generic Menu Actions —————————————————————————————————————————————
bot.hears('📝 Register', (ctx) => ctx.reply('✅ You’re already registered and logged in.'));
bot.hears('💼 Check Balance', async (ctx) => {
  await db.read();
  const u = db.data.users.find(u => u.id === ctx.from.id);
  ctx.reply(u ? `💰 Your balance: ${u.coins} coins` : '❗ Please /start to register.');
});
bot.hears('📢 Referral Link', (ctx) => {
  ctx.reply(`🔗 Invite friends:\nhttps://t.me/${botUsername}?start=${ctx.from.id}`);
});
bot.hears('🔍 My ID', (ctx) => ctx.reply(`🆔 Your Telegram ID: ${ctx.from.id}`));
bot.hears('📊 Transactions', async (ctx) => {
  await db.read();
  const uid = ctx.from.id;
  const deps = db.data.deposits.filter(d => d.userId === uid);
  const wds = db.data.withdrawals.filter(w => w.userId === uid);
  let msg = '📊 *Your Transactions:*\n\n';
  if (!deps.length && !wds.length) msg += '_No transactions._';
  else {
    if (deps.length) msg += '🟢 *Deposits:*\n' + deps.map(d=>`+${d.amount} (${d.status})`).join('\n') + '\n\n';
    if (wds.length) msg += '🔴 *Withdrawals:*\n' + wds.map(w=>`-${w.amount} (${w.status})`).join('\n');
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ——— Deposit Flow ————————————————————————————————————————————————————
bot.hears('💰 Deposit Money', (ctx) => {
  ctx.reply(
    `💳 To deposit coins:\n` +
    `1. Pay *${COIN_VALUE_BIRR} Birr* per coin to Telebirr: *${TELEBIRR_NUMBER}*\n` +
    `2. Reply with the amount you paid.\n` +
    `3. Then send a screenshot of payment.`,
    { parse_mode: 'Markdown' }
  );
  ctx.session = { action: 'await_deposit_amount' };
});

// ——— Withdrawal Flow ————————————————————————————————————————————————
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('💸 How many coins would you like to withdraw?');
  ctx.session = { action: 'await_withdraw_amount' };
});

// ——— Single text handler for flow actions —————————————————————————————————
bot.on('message', async (ctx, next) => {
  const id = ctx.from.id;
  const text = ctx.message.text && ctx.message.text.trim();
  if (!ctx.session) return next();

  await db.read();
  const user = db.data.users.find(u => u.id === id);
  if (!user) { ctx.reply('❗ Please /start to register.'); ctx.session = null; return; }

  // Deposit amount step
  if (ctx.session.action === 'await_deposit_amount' && text) {
    const amount = parseInt(text, 10);
    if (isNaN(amount) || amount <= 0) {
      ctx.reply('❗ Enter a valid positive number.');
      return;
    }
    // store deposit stub
    const reqId = Date.now();
    db.data.deposits.push({
      id: reqId, userId: id, amount, status: 'pending', screenshotFileId: null,
      timestamp: new Date().toISOString()
    });
    await db.write();
    ctx.reply('📸 Now please send a screenshot of your payment.');
    ctx.session = { action: 'await_deposit_screenshot', reqId };
    return;
  }

  // Withdraw amount step
  if (ctx.session.action === 'await_withdraw_amount' && text) {
    const amount = parseInt(text, 10);
    if (isNaN(amount) || amount <= 0 || user.coins < amount) {
      ctx.reply('❗ Invalid or insufficient balance.');
      ctx.session = null;
      return;
    }
    const reqId = Date.now();
    db.data.withdrawals.push({
      id: reqId, userId: id, amount, status: 'pending',
      timestamp: new Date().toISOString()
    });
    await db.write();
    ctx.reply('✅ Withdrawal request submitted.');
    // notify admin
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `📤 Withdraw Request #${reqId}\nUser: ${user.name} (${id})\nAmount: ${amount} coins`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_w_${reqId}`),
        Markup.button.callback('❌ Reject', `reject_w_${reqId}`)
      ])
    );
    ctx.session = null;
    return;
  }

  return next();
});

// ——— Photo handler for deposit screenshot —————————————————————————————————
bot.on('photo', async (ctx) => {
  if (!ctx.session || ctx.session.action !== 'await_deposit_screenshot') return;
  const { reqId } = ctx.session;
  const fileId = ctx.message.photo.slice(-1)[0].file_id;

  await db.read();
  const dep = db.data.deposits.find(d => d.id === reqId);
  if (!dep || dep.status !== 'pending') { ctx.session = null; return; }

  dep.screenshotFileId = fileId;
  await db.write();

  ctx.reply('📨 Deposit submitted for approval.');
  // notify admin with photo
  await bot.telegram.sendPhoto(
    ADMIN_ID,
    fileId,
    {
      caption: `📥 Deposit #${reqId}\nUser: ${ctx.from.first_name} (${ctx.from.id})\nAmount: ${dep.amount} coins`,
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve', `approve_d_${reqId}`),
        Markup.button.callback('❌ Reject', `reject_d_${reqId}`)
      ])
    }
  );
  ctx.session = null;
});

// ——— Admin approval callbacks —————————————————————————————————————————
bot.on('callback_query', async (ctx) => {
  const [action, type, rawId] = ctx.callbackQuery.data.split('_');
  const reqId = parseInt(rawId, 10);
  await db.read();

  // Deposit approval
  if (type === 'd') {
    const dep = db.data.deposits.find(d => d.id === reqId);
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery();
    const user = db.data.users.find(u => u.id === dep.userId);
    if (action === 'approve') {
      dep.status = 'approved';
      user.coins += dep.amount;
      await db.write();
      ctx.editMessageCaption(`✅ Deposit #${reqId} approved.`);
      bot.telegram.sendMessage(user.id, `🎉 Your deposit of ${dep.amount} coins was approved!`);
    } else {
      dep.status = 'rejected';
      await db.write();
      ctx.editMessageCaption(`❌ Deposit #${reqId} rejected.`);
      bot.telegram.sendMessage(dep.userId, `❌ Your deposit of ${dep.amount} coins was rejected.`);
    }
    return ctx.answerCbQuery();
  }

  // Withdraw approval
  if (type === 'w') {
    const wd = db.data.withdrawals.find(w => w.id === reqId);
    if (!wd || wd.status !== 'pending') return ctx.answerCbQuery();
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

// ——— Launch ————————————————————————————————————————————————————————
bot.launch().then(() => console.log('🤖 Bot is running!'));

