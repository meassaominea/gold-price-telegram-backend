import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import * as goldService from "./gold-service.js";
import path from "path";
import { fileURLToPath } from "url";
import "./bot.js";
import {
  initStore,
  getClients,
  getClientByToken,
  updateClient,
  getChats,
  getTemplate,
  saveTemplate,
} from "./store.js";
import crypto from "crypto";
import fs from "fs/promises";
import { initTelegramClient } from "./telegram-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log(`🚀 Starting in ${isDev ? "development" : "production"} mode`);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(__dirname));

// Initialize DB
initStore().then(() => {
  console.log("DB Initialized");
});

// Initialize GramJS MTProto client
initTelegramClient();

// Initialize assets early
goldService.loadAssets();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// --- Admin API ---
const adminAuth = (req, res, next) => {
  if (!ADMIN_PASSWORD) {
    res.status(401).json({ success: false, message: "Unauthorized admin" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Unauthorized admin" });
  }
};

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ success: false, message: "Invalid password" });
  }
});

app.get("/api/admin/clients", adminAuth, async (req, res) => {
  const clients = await getClients();
  res.json({ success: true, clients });
});

app.post("/api/admin/clients", adminAuth, async (req, res) => {
  const { clientId, name, chatId, hasDollarSuffix, unit, botActive } = req.body;
  const clients = await getClients();

  if (clientId) {
    // Update
    const updateData = {
      name,
      chatId,
      hasDollarSuffix,
      unit: unit || "tael",
    };
    if (botActive !== undefined) updateData.botActive = Boolean(botActive);
    const updated = await updateClient(clientId, updateData);
    res.json({ success: true, client: updated });
  } else {
    // Create
    const newId = crypto.randomUUID();
    const newToken = crypto.randomBytes(16).toString("hex");
    const newClient = {
      clientId: newId,
      name,
      authToken: newToken,
      chatId: chatId || null,
      buyMargin: 0,
      sellSpread: 0,
      botActive: Boolean(botActive),
      lastPrice: null,
      hasDollarSuffix: !!hasDollarSuffix,
      unit: unit || "tael",
    };
    clients.push(newClient);
    const { saveClients } = await import("./store.js");
    await saveClients(clients);
    res.json({ success: true, client: newClient });
  }
});

app.post("/api/admin/clients/:id/toggle-bot", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { botActive } = req.body;
  const clients = await getClients();
  const client = clients.find((c) => c.clientId === id);
  if (!client) {
    return res
      .status(404)
      .json({ success: false, message: "Client not found" });
  }
  if (botActive && !client.chatId) {
    return res.status(400).json({
      success: false,
      message: "Cannot activate bot: Please assign a Chat ID first.",
    });
  }
  const updated = await updateClient(id, { botActive: Boolean(botActive) });
  res.json({ success: true, client: updated });
});

app.get("/api/admin/chats", adminAuth, async (req, res) => {
  const chats = await getChats();
  res.json({ success: true, chats });
});

app.get("/api/admin/template/:clientId", adminAuth, async (req, res) => {
  const template = await getTemplate(req.params.clientId);
  res.json({ success: true, template: template || null });
});

app.post("/api/admin/template", adminAuth, async (req, res) => {
  const { clientId, imageBase64, dateConfig, buyConfig, sellConfig } = req.body;
  if (!clientId)
    return res
      .status(400)
      .json({ success: false, message: "clientId required" });

  const templateData = { dateConfig, buyConfig, sellConfig };

  if (imageBase64) {
    templateData.imageBase64 = imageBase64;
    templateData.hasImage = true;
  }

  await saveTemplate(clientId, templateData);

  // Don't send huge base64 back in response
  const responseData = { ...templateData };
  delete responseData.imageBase64;

  res.json({ success: true, template: responseData });
});

// --- Client API ---
const clientAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }
  const token = authHeader.split(" ")[1];
  const client = await getClientByToken(token);
  if (client) {
    req.client = client;
    next();
  } else {
    res.status(401).json({ success: false, message: "Invalid client token" });
  }
};

app.get("/api/client/config", clientAuth, async (req, res) => {
  const chats = await getChats();
  const chatInfo = chats.find((c) => c.chatId === Number(req.client.chatId));
  res.json({
    success: true,
    config: {
      name: req.client.name,
      chatTitle: chatInfo ? chatInfo.title : "Unknown Chat",
      buyMargin: req.client.buyMargin || 0,
      sellSpread: req.client.sellSpread || 0,
      botActive: req.client.botActive || false,
      unit: req.client.unit || "tael",
    },
  });
});

app.post("/api/client/update-config", clientAuth, async (req, res) => {
  const { buyMargin, sellSpread, botActive } = req.body;
  const updates = {};
  if (buyMargin !== undefined) updates.buyMargin = Number(buyMargin);
  if (sellSpread !== undefined) updates.sellSpread = Number(sellSpread);
  if (botActive !== undefined) updates.botActive = Boolean(botActive);

  if (botActive === true) {
    if (!req.client.chatId) {
      return res.status(400).json({
        success: false,
        message: "Admin has not assigned a Chat ID yet.",
      });
    }
    const finalBuyMargin =
      updates.buyMargin !== undefined
        ? updates.buyMargin
        : req.client.buyMargin;
    const finalSellSpread =
      updates.sellSpread !== undefined
        ? updates.sellSpread
        : req.client.sellSpread;

    if (!finalBuyMargin || !finalSellSpread) {
      return res.status(400).json({
        success: false,
        message: "Please set the buy margin and sell spread first",
      });
    }
  }

  const updated = await updateClient(req.client.clientId, updates);
  res.json({ success: true, config: updated });
});

app.post("/api/client/send-message", clientAuth, async (req, res) => {
  try {
    const { buy, sell } = req.body;
    if (!req.client.chatId) {
      return res
        .status(400)
        .json({ success: false, message: "No Chat ID assigned." });
    }
    const result = await goldService.processGoldPriceUpdate(
      req.client,
      buy,
      sell,
      null,
      false,
    );
    res.json({ success: true, result });
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cron Job
cron.schedule("* 8-21 * * *", async () => {
  try {
    const clients = await getClients();
    const activeClients = clients.filter((c) => c.botActive && c.chatId);

    if (activeClients.length > 0) {
      const currentBinancePrice = await goldService.getBinanceGoldPrice();
      for (const client of activeClients) {
        try {
          await goldService.processGoldPriceUpdate(
            client,
            null,
            null,
            null,
            true,
            currentBinancePrice,
          );
        } catch (err) {
          console.error(`Cron error for client ${client.name}:`, err);
        }
      }
    }
  } catch (error) {
    console.error("Cron job wrapper error:", error);
  }
});

app.listen(port, () => console.log(`Listening on ${port}`));
