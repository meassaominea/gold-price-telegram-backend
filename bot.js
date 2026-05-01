import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";

const isDev = process.env.NODE_ENV === "development";

dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Command to open the Mini App
bot.command("start", (ctx) => {
  return ctx.reply(
    "Welcome! Tap the button below to open app.",

    Markup.inlineKeyboard([
      Markup.button.url("Open App", process.env.WEBAPP_URL),
    ]),
  );
});

// 2. Handle data sent from tg.sendData()
// bot.on("web_app_data", (ctx) => {
//   try {
//     const data = ctx.webAppData.data.json();

//     if (data.action === "price_update") {
//       const { buy, sell } = data;

//       // Here you would typically save to a database
//       ctx.reply(`✅ Prices Updated!\n\n💰 Buy: $${buy}\n🏷️ Sell: $${sell}`);
//     }
//   } catch (e) {
//     ctx.reply(`❌ Failed to process price update. ${e}`);
//   }
// });

// Get latest chatId from anyone
// bot.on(["message", "channel_post"], (ctx) => {
//   const chatId = ctx.chat.id;
//   const chatTitle = ctx.chat.title || ctx.chat.username || ctx.chat.type;
//   console.log(`👂 Heard shout from: "${chatTitle}" [ID: ${chatId}]`);
//   ctx.reply(`Village ID: ${chatId}`);
// });

bot.launch();
console.log("Bot is running...");

export default bot;
