import satori from "satori";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { updateClient, getTemplate } from "./store.js";
import { sendPhotoToChannel, sendMessageToChannel } from "./telegram-client.js";

// Disable Sharp memory caching and restrict concurrency to reduce RAM spikes
sharp.cache(false);
// sharp.concurrency(1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let fontData = null;

export async function loadAssets() {
  try {
    const fontPath = path.join(__dirname, "Inter_28pt-Black.ttf");
    fontData = await fs.readFile(fontPath);
    console.log("Assets loaded successfully");
  } catch (err) {
    console.error("Critical error loading local assets in service:", err);
  }
}

export async function processGoldPriceUpdate(
  client,
  buy,
  sell,
  image,
  isSchedule,
  currentBinancePrice = null,
) {
  const token = process.env.BOT_TOKEN;
  const chatId = client.chatId;
  if (!token) throw new Error("Missing BOT_TOKEN in environment");
  if (!chatId)
    return { success: false, message: "Client has no chatId assigned" };

  let buyPrice = buy || "0.00";
  let sellPrice = sell || "0.00";
  let imageToUpload = image;
  let lastPrice = client.lastPrice || null;

  if (isSchedule) {
    if (!client.botActive) {
      return { success: true, message: "Bot is closed for this client" };
    }

    try {
      if (!currentBinancePrice) {
        return { success: true, message: "Binance Error: No price" };
      }

      const isChiUnit = client.unit === "chi";

      // 1. Unrounded raw base market price from Binance
      const rawPrice =
        currentBinancePrice / 0.8306 / (isChiUnit ? 10 : 1);

      if (lastPrice !== null) {
        const date = new Date();
        const hour = date.getHours();
        const minute = date.getMinutes();
        if (hour === 21 && minute === 59) {
          lastPrice = null;
          await updateClient(client.clientId, {
            lastPrice: null,
            botActive: false,
          });
          await sendDebugReport(
            `Bot is closed for ${client.name}. Reset last price`,
          );
          return { success: true, message: "Closed for day" };
        }

        // 2. Check if actual raw market moved at least $5 (or $1 for Chi) away from published lastPrice
        const minDiff = isChiUnit ? 1 : 5;
        const rawDiff = Math.abs(rawPrice - lastPrice);

        if (rawDiff < minDiff) {
          return {
            success: true,
            message: `Skipped: Market diff < $${minDiff} (Raw: ${rawPrice.toFixed(2)}, Posted: ${lastPrice})`,
          };
        }
      }

      // 3. Market moved enough -> Round to clean display integer ($1 step for Chi, $5 step for Tael)
      const currentPrice = isChiUnit
        ? Math.round(rawPrice)
        : Math.round(rawPrice / 5) * 5;

      lastPrice = currentPrice;
      sellPrice = currentPrice + (client.sellSpread || 0);
      buyPrice = currentPrice - (client.buyMargin || 0);

      // Save last price
      await updateClient(client.clientId, { lastPrice });
    } catch (error) {
      console.error("Scheduled execution error:", error);
      throw error;
    }
  }

  // Generate Image
  if (!imageToUpload) {
    imageToUpload = await generateImage(client, buyPrice, sellPrice);
  }

  const textToSend = `<b>🚀 Gold Price Update</b>\n\n💰 <b>Buy:</b> $${buyPrice}\n🏷️ <b>Sell:</b> $${sellPrice}`;

  if (imageToUpload) {
    return await sendPhotoToChannel(chatId, imageToUpload, "");
  } else {
    return await sendMessageToChannel(chatId, textToSend);
  }
}

export async function generateImage(client, buyPrice, sellPrice) {
  if (!fontData) await loadAssets();

  const templateConfig = await getTemplate(client.clientId);
  if (
    !templateConfig ||
    !templateConfig.hasImage ||
    !templateConfig.imageBase64
  )
    return null;

  let templateBase64ForClient = templateConfig.imageBase64.replace(/\s+/g, "");
  if (templateBase64ForClient.includes(",")) {
    const data = templateBase64ForClient.split(",")[1];
    let mimeType = "image/png";
    if (data.startsWith("/9j/")) mimeType = "image/jpeg";
    else if (data.startsWith("iVBORw")) mimeType = "image/png";
    else if (data.startsWith("R0lG")) mimeType = "image/gif";
    else if (data.startsWith("UklG")) mimeType = "image/webp";
    templateBase64ForClient = `data:${mimeType};base64,${data}`;
  }

  const { dateConfig, buyConfig, sellConfig } = templateConfig;
  const dateStr = `${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`;

  const suffix = client.hasDollarSuffix ? "$" : "";
  const buyStr = `${buyPrice}${suffix}`;
  const sellStr = `${sellPrice}${suffix}`;

  const children = [
    {
      type: "img",
      props: {
        src: templateBase64ForClient,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        },
      },
    },
  ];

  if (dateConfig) {
    children.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: `${dateConfig.y}px`,
          left: `${dateConfig.x}px`,
          width: `${dateConfig.w}px`,
          height: `${dateConfig.h}px`,
          fontSize: `${dateConfig.size}px`,
          color: dateConfig.color || "black",
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          paddingLeft: "10px",
          fontFamily: "Inter",
          fontWeight: 900,
        },
        children: dateStr,
      },
    });
  }

  if (buyConfig) {
    children.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: `${buyConfig.y}px`,
          left: `${buyConfig.x}px`,
          width: `${buyConfig.w}px`,
          height: `${buyConfig.h}px`,
          fontSize: `${buyConfig.size}px`,
          color: buyConfig.color || "black",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "Inter",
          fontWeight: 900,
        },
        children: buyStr,
      },
    });
  }

  if (sellConfig) {
    children.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: `${sellConfig.y}px`,
          left: `${sellConfig.x}px`,
          width: `${sellConfig.w}px`,
          height: `${sellConfig.h}px`,
          fontSize: `${sellConfig.size}px`,
          color: sellConfig.color || "black",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "Inter",
          fontWeight: 900,
        },
        children: sellStr,
      },
    });
  }

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
        },
        children,
      },
    },
    {
      width: 1000,
      height: 1000,
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
  const debugChatId = process.env.DEBUG_CHAT_ID;
  if (!debugChatId) return;

  try {
    await sendMessageToChannel(debugChatId, message);
  } catch (error) {
    console.error("Debug Report Error:", error);
  }
}
