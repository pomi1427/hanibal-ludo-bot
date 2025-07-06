const { Telegraf, Markup } = require("telegraf");
const express = require("express");
require("dotenv").config();
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

// ─── Server & Constants ───────────────────────────────────────────────────────
const app = express();
app.get("/", (_req, res) => res.send("🤖 Hanibal Bot is alive!"));
app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

const ADMIN_ID = process.env.ADMIN_ID;
const COIN_VALUE_BIRR = 1;

// ─── LowDB Setup (with default arrays) ────────────────────────────────────────
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { users: [], withdrawals: [], deposits: [] });

const pendingOTPs = {};
const pendingWithdrawals = {};
const pendingDeposits = {};
const pendingAddCoins = {};

(async () => {
  await db.read();
  await db.write();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ─── Main Menu ──────────────────────────────────────────────────────────────
  bot.start((ctx) => {
    const name = ctx.from.first_name;
    ctx.reply(
      `👋 Welcome, ${name}!\n💰 1 Coin = ${COIN_VALUE_BIRR} Birr\nUse the menu below:`,
      Markup.keyboard([
        ["💰 Deposit Money", "💸 Withdraw Money"],
        ["💼 Check Balance", "📝 Register"],
        ["📢 Referral Link", "🔍 My ID"],
        ["💱 Coin Rates"],
      ]).resize()
    );
  });

  // ─── Registration & Utilities ───────────────────────────────────────────────
  bot.hears("💱 Coin Rates", (ctx) =>
    ctx.reply(`💰 1 Coin = ${COIN_VALUE_BIRR} Birr`)
  );
  bot.hears("🔍 My ID", (ctx) =>
    ctx.reply(`🆔 Your Telegram ID is: ${ctx.from.id}`)
  );
  bot.hears("📝 Register", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (db.data.users.find((u) => u.id === id)) {
      return ctx.reply("✅ You are already registered.");
    }
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    pendingOTPs[id] = otp;
    ctx.reply(`📨 Your OTP is: ${otp}\nPlease reply with it to register.`);
  });

  // ─── Core Text Handler: OTP, Deposits, Withdrawals, Admin Top‑Up ───────────
  bot.on("text", async (ctx, next) => {
    const id = ctx.from.id;
    const txt = ctx.message.text.trim();
    const name = ctx.from.first_name;
    const usern = ctx.from.username || "none";

    // OTP registration
    if (pendingOTPs[id]) {
      if (txt === pendingOTPs[id]) {
        db.data.users.push({ id, name, username: usern, coins: 0, referredBy: null });
        delete pendingOTPs[id];
        await db.write();
        return ctx.reply("✅ Registered! You have 0 coins.");
      } else {
        return ctx.reply("❗ Wrong OTP. Try again.");
      }
    }

    // Deposit request
    if (pendingDeposits[id]) {
      const amt = parseFloat(txt);
      if (isNaN(amt) || amt <= 0) {
        delete pendingDeposits[id];
        return ctx.reply("❗ Invalid amount.");
      }
      // record deposit
      db.data.deposits.push({ userId: id, username: usern, amount: amt, status: "pending" });
      delete pendingDeposits[id];
      await db.write();

      ctx.reply(`💸 Deposit of ${amt} coins requested. Awaiting admin.`);
      if (ADMIN_ID) {
        const idx = db.data.deposits.length - 1;
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `📥 Deposit #${idx} from @${usern} (ID:${id}) Amount: ${amt}`,
          Markup.inlineKeyboard([
            Markup.button.callback(`✅ Approve #${idx}`, `approve_d_${idx}`),
            Markup.button.callback(`❌ Decline #${idx}`, `decline_d_${idx}`)
          ])
        );
      }
      return;
    }

    // Withdrawal request
    if (pendingWithdrawals[id]) {
      const amt = parseFloat(txt);
      await db.read();
      const u = db.data.users.find((u) => u.id === id);
      if (isNaN(amt) || amt <= 0 || !u || u.coins < amt) {
        delete pendingWithdrawals[id];
        return ctx.reply("❗ Invalid or insufficient balance.");
      }
      db.data.withdrawals.push({ userId: id, username: usern, amount: amt, status: "pending" });
      delete pendingWithdrawals[id];
      await db.write();

      ctx.reply(`💸 Withdrawal of ${amt} coins requested. Awaiting admin.`);
      if (ADMIN_ID) {
        const idx = db.data.withdrawals.length - 1;
        await bot.telegram.sendMessage(
          ADMIN_ID,
          `📤 Withdrawal #${idx} @${usern} (ID:${id}) Amount: ${amt}`,
          Markup.inlineKeyboard([
            Markup.button.callback(`✅ Approve #${idx}`, `approve_w_${idx}`),
            Markup.button.callback(`❌ Decline #${idx}`, `decline_w_${idx}`)
          ])
        );
      }
      return;
    }

    // Admin add coins
    if (pendingAddCoins[id]) {
      const [tid, coins] = txt.split(" ");
      const amt = parseInt(coins, 10);
      await db.read();
      const u = db.data.users.find((u) => u.id.toString() === tid);
      delete pendingAddCoins[id];
      if (!u || isNaN(amt)) return ctx.reply("❗ Format: userID amount");
      u.coins += amt;
      await db.write();
      return ctx.reply(`✅ ${amt} coins added to ${u.name}`);
    }

    return next();
  });

  // ─── Other Handlers ─────────────────────────────────────────────────────────
  bot.hears("💼 Check Balance", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    const u = db.data.users.find((u) => u.id === id);
    if (!u) return ctx.reply("❗ Register first with 📝 Register.");
    ctx.reply(`💰 Balance: ${u.coins} coins`);
  });

  bot.hears("📢 Referral Link", async (ctx) => {
    const id = ctx.from.id;
    await db.read();
    if (!db.data.users.find((u) => u.id === id)) {
      return ctx.reply("❗ Register first with 📝 Register.");
    }
    const link = `https://t.me/${bot.botInfo.username}?start=${id}`;
    ctx.reply(`📢 Share this link:\n${link}`);
  });

  bot.hears("💰 Deposit Money", (ctx) => {
    const id = ctx.from.id;
    pendingDeposits[id] = true;
    ctx.reply("💸 How many coins to deposit?");
  });

  bot.hears("💸 Withdraw Money", (ctx) => {
    const id = ctx.from.id;
    pendingWithdrawals[id] = true;
    ctx.reply("💸 How many coins to withdraw?");
  });

  // ─── Admin Panel ─────────────────────────────────────────────────────────────
  bot.command("admin", (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    ctx.reply(
      "🛠 Admin Tools",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 View Users", "view_users")],
        [Markup.button.callback("📄 View Deposits", "view_deposits")],
        [Markup.button.callback("📄 View Withdrawals", "view_withdrawals")],
        [Markup.button.callback("➕ Add Coins", "add_coins")],
      ])
    );
  });

  bot.action("view_users", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list = db.data.users.map(u => `👤 ${u.name} (@${u.username}) — ${u.coins}`).join("\n") || "No users.";
    ctx.reply(list);
  });
  bot.action("view_deposits", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list = db.data.deposits
      .map((d,i) => `${i}. @${d.username} — ${d.amount} coins — ${d.status}`)
      .filter(l=>l.includes("pending"))
      .join("\n") || "No pending deposits.";
    ctx.reply(list);
  });
  bot.action("view_withdrawals", async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await db.read();
    const list = db.data.withdrawals
      .map((w,i) => `${i}. @${w.username} — ${w.amount} coins — ${w.status}`)
      .filter(l=>l.includes("pending"))
      .join("\n") || "No pending withdrawals.";
    ctx.reply(list);
  });

  // Approve/Decline deposit
  bot.action(/approve_d_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const i = +ctx.match[1];
    await db.read();
    const d = db.data.deposits[i];
    if (!d || d.status !== "pending") return ctx.reply("Invalid.");
    d.status = "approved";
    const u = db.data.users.find(u=>u.id===d.userId);
    if(u) u.coins += d.amount;
    await db.write();
    ctx.reply(`✅ Deposit #${i} approved.`);
    await bot.telegram.sendMessage(d.userId, `✅ Your deposit of ${d.amount} coins was approved.`);
  });
  bot.action(/decline_d_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const i = +ctx.match[1];
    await db.read();
    const d = db.data.deposits[i];
    if (!d || d.status !== "pending") return ctx.reply("Invalid.");
    d.status = "declined";
    await db.write();
    ctx.reply(`❌ Deposit #${i} declined.`);
    await bot.telegram.sendMessage(d.userId, `❌ Your deposit of ${d.amount} coins was declined.`);
  });

  // Approve/Decline withdrawal
  bot.action(/approve_w_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const i = +ctx.match[1];
    await db.read();
    const w = db.data.withdrawals[i];
    if (!w || w.status!=="pending") return ctx.reply("Invalid.");
    w.status="approved";
    const u = db.data.users.find(u=>u.id===w.userId);
    if(u) u.coins -= w.amount;
    await db.write();
    ctx.reply(`✅ Withdrawal #${i} approved.`);
    await bot.telegram.sendMessage(w.userId, `✅ Your withdrawal of ${w.amount} coins was approved.`);
  });
  bot.action(/decline_w_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const i = +ctx.match[1];
    await db.read();
    const w = db.data.withdrawals[i];
    if (!w || w.status!=="pending") return ctx.reply("Invalid.");
    w.status="declined";
    await db.write();
    ctx.reply(`❌ Withdrawal #${i} declined.`);
    await bot.telegram.sendMessage(w.userId, `❌ Your withdrawal of ${w.amount} coins was declined.`);
  });

  // ─── Launch ─────────────────────────────────────────────────────────────────
  bot.launch();
  console.log("🤖 Bot is running...");
})();










