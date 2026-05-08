import satori from "satori";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent state
export let fontData = null;
export let templateBase64 = null;
export let lastPrice = null;
export let botActive = false;

// Configurable margins (Defaults)
export let currentBuyMargin = 0;
export let currentSellSpread = 0;

export async function loadAssets() {
  try {
    const fontPath = path.join(__dirname, "Inter_28pt-Black.ttf");
    fontData = await fs.readFile(fontPath);
    const templatePath = path.join(__dirname, "template.png");
    const templateBuffer = await fs.readFile(templatePath);
    templateBase64 = `data:image/jpeg;base64,${templateBuffer.toString("base64")}`;
    console.log("Assets loaded successfully");
  } catch (err) {
    console.error("Critical error loading local assets in service:", err);
  }
}

export function getConfig() {
  return { buyMargin: currentBuyMargin, sellSpread: currentSellSpread };
}

export function updateConfig(buyMargin, sellSpread) {
  if (buyMargin !== undefined) currentBuyMargin = Number(buyMargin);
  if (sellSpread !== undefined) currentSellSpread = Number(sellSpread);
  return { buyMargin: currentBuyMargin, sellSpread: currentSellSpread };
}

export function getBotActive() {
  return botActive;
}

export function updateBotActive(newBotActive) {
  if (
    newBotActive === true &&
    currentBuyMargin === 0 &&
    currentSellSpread === 0
  ) {
    return {
      success: false,
      message: "Please set the buy margin and sell spread first",
      status: false,
    };
  }

  botActive = newBotActive;
  return { success: true, status: botActive };
}

export async function processGoldPriceUpdate(buy, sell, image, isSchedule) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId)
    throw new Error("Missing BOT_TOKEN or CHAT_ID in environment");

  let buyPrice = buy || "0.00";
  let sellPrice = sell || "0.00";
  let imageToUpload = image;

  if (isSchedule) {
    if (!botActive) {
      return { success: true, message: "Bot is closed" };
    }

    try {
      const price = await getBinanceGoldPrice();
      if (!price) {
        console.error("Binance Error: No price");
        return { success: true };
      }

      const rawPrice = Math.round(price / 0.8306 + currentBuyMargin);

      const lastDigit = rawPrice % 10;
      const basePrice = Math.floor(rawPrice / 10) * 10;
      const currentPrice =
        lastDigit <= 1
          ? basePrice
          : lastDigit >= 4 && lastDigit <= 6
            ? basePrice + 5
            : lastDigit >= 9
              ? basePrice + 10
              : undefined;

      if (currentPrice === undefined) {
        return {
          success: true,
          message: `Skipped: price not rounded to 5 or 0 - ${currentPrice}`,
        };
      }

      if (lastPrice !== null) {
        const date = new Date();
        const hour = date.getHours();
        const minute = date.getMinutes();
        if (hour === 16 && minute === 59) {
          lastPrice = null;
          botActive = false;
          await sendDebugReport("Bot is closed. Reset last price");
        }

        const priceDiff = Math.abs(currentPrice - lastPrice);
        if (priceDiff < 5) {
          console.log(
            `Skipped: Change < $5 -- raw:${rawPrice} -- ounce:${price} -- ${date.toLocaleString()}`,
          );

          return { success: true, message: "Skipped: Change < $5" };
        }
      }

      lastPrice = currentPrice;
      buyPrice = currentPrice;
      sellPrice = buyPrice - currentSellSpread;

      const generatedImageBuffer = await generateImage(buyPrice, sellPrice);
      imageToUpload = `data:image/png;base64,${generatedImageBuffer.toString("base64")}`;
    } catch (error) {
      console.error("Scheduled execution error:", error);
      throw error;
    }
  }

  const textToSend = `<b>🚀 Gold Price Update</b>\n\n💰 <b>Buy:</b> $${buyPrice}\n🏷️ <b>Sell:</b> $${sellPrice}`;
  const formData = new globalThis.FormData();

  if (imageToUpload?.startsWith("data:image")) {
    const base64Data = imageToUpload.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    formData.append(
      "photo",
      new globalThis.Blob([buffer], { type: "image/png" }),
      "price.png",
    );
  }

  formData.append("chat_id", chatId);
  formData.append("parse_mode", "HTML");

  const telMethod = imageToUpload ? "sendPhoto" : "sendMessage";
  if (!imageToUpload) formData.append("text", textToSend);

  const telResponse = await fetch(
    `https://api.telegram.org/bot${token}/${telMethod}`,
    {
      method: "POST",
      body: formData,
    },
  );

  return await telResponse.json();
}

export async function generateImage(buyPrice, sellPrice) {
  if (!fontData || !templateBase64) await loadAssets();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          color: "#ffd700",
          fontFamily: "Inter",
          position: "relative",
        },
        children: [
          // Background Image
          {
            type: "img",
            props: {
              src: templateBase64,
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
              },
            },
          },
          // Content
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: "465px",
                left: "120px",
                fontSize: "50px",
                fontWeight: 900,
                color: "black",
                fontFamily: "Inter",
              },
              children: `${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString(
                "en-US",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                },
              )}`,
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: "590px",
                left: "825px",
                width: "525px",
                display: "flex",
                justifyContent: "center",
                textAlign: "center",
                fontSize: "210px",
                letterSpacing: "10px",
                fontWeight: 900,
                color: "#284283",
                fontFamily: "Inter",
              },
              children: buyPrice.toString(),
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: "850px",
                left: "825px",
                width: "525px",
                display: "flex",
                justifyContent: "center",
                textAlign: "center",
                fontSize: "210px",
                letterSpacing: "10px",
                fontWeight: 900,
                color: "#FD4244",
                fontFamily: "Inter",
              },
              children: sellPrice.toString(),
            },
          },
        ],
      },
    },
    {
      width: 1500,
      height: 1500,
      fonts: [
        {
          name: "Inter",
          data: fontData,
          weight: 900,
          style: "normal",
        },
      ],
    },
  );

  return await sharp(Buffer.from(svg))
    .png({ compressionLevel: 0, quality: 100 })
    .toBuffer();
}

export async function getBinanceGoldPrice() {
  try {
    const response = await fetch(
      process.env.NODE_ENV === "development"
        ? "https://ekyc-proxy.meassaominea-199.workers.dev/proxy?url=https://fapi.binance.com/fapi/v1/premiumIndex?symbol=XAUUSDT"
        : "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=XAUUSDT",
    );
    const data = await response.json();
    const price = data.indexPrice;
    // await sendDebugReport(`✨ <b>Gold Spot:</b> $${price} (XAU/USD)`);
    return price;
  } catch (error) {
    console.error("Binance Error:", error.message);
    return null;
  }
}

export async function getFreeGoldApi() {
  const response = await fetch(`https://api.gold-api.com/price/XAU/USD`);
  const data = await response.json();
  const price = data.price;
  return price;
}

export async function sendDebugReport(message) {
  const token = process.env.BOT_TOKEN;
  const debugChatId = process.env.DEBUG_CHAT_ID;
  if (!token || !debugChatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: debugChatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("Debug Report Error:", error);
  }
}

// Don't delete
// https://ekyc-proxy.meassaominea-199.workers.dev/proxy?url=https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT
