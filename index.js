// Deposit
bot.hears('💰 Deposit Money', async (ctx) => {
  const id = ctx.from.id;
  await db.read();
  const user = db.data.users.find((u) => u.id === id);
  if (!user) return ctx.reply('❗ Register first.');
  pendingDeposits[id] = true;
  ctx.reply('💸 Enter amount to deposit:');
});

// Withdraw
bot.hears('💸 Withdraw Money', (ctx) => {
  ctx.reply('🚧 Withdraw system coming soon!');
});

// Admin Panel
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  ctx.reply('🛠 Admin Tools', Markup.inlineKeyboard([
    [Markup.button.callback('📋 View Users', 'view_users')],
    [Markup.button.callback('➕ Add Coins to User', 'add_coins')],
  ]));
});

bot.action('view_users', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  await db.read();
  const users = db.data.users;
  const list = users.length
    ? users.map(u => 👤 ${u.name} (@${u.username}) - ${u.coins} coins).join('\n')
    : 'No users yet.';
  ctx.reply(list);
});

bot.action('add_coins', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  pendingAddCoins[ctx.from.id] = true;
  ctx.reply('➕ Format: userID amount (e.g., 123456789 50)');
});

// 🟢 Launch Bot
(async () => {
  await db.read();
  db.data ||= { users: [] };
  await db.write();
  bot.launch();
  console.log('🤖 Bot is running...');
})();






