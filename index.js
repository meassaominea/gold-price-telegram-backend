import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import * as goldService from "./gold-service.js";
import path from "path";
import { fileURLToPath } from "url";
import "./bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

dotenv.config({
  path: !isDev ? ".env" : ".env.local",
});

console.log(`🚀 Starting in ${isDev ? "development" : "production"} mode`);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(__dirname));

// Initialize assets early
goldService.loadAssets();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/template", async (req, res) => {
  try {
    const buffer = await goldService.generateImage("1234", "1234");
    res.type("png").send(buffer);
  } catch (err) {
    res.status(500).send("Image generation failed: " + err.message);
  }
});

app.get("/get-config", (req, res) => {
  const config = goldService.getConfig();
  res.json({
    success: true,
    config: config,
  });
});

app.post("/update-config", (req, res) => {
  const { buyMargin, sellSpread } = req.body;
  const newConfig = goldService.updateConfig(buyMargin, sellSpread);
  res.json({
    success: true,
    config: newConfig,
  });
});

app.get("/get-bot-active", (req, res) => {
  res.json({
    success: true,
    botActive: goldService.getBotActive(),
  });
});

app.post("/update-bot-active", (req, res) => {
  const { botActive } = req.body;
  const data = goldService.updateBotActive(botActive);
  res.json({
    success: data.success,
    botActive: data.status,
  });
});

app.post("/send-message", async (req, res) => {
  try {
    const { buy, sell, image, isSchedule } = req.body;
    const result = await goldService.processGoldPriceUpdate(
      buy,
      sell,
      image,
      isSchedule,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

cron.schedule("* 8-16 * * *", async () => {
  try {
    await goldService.processGoldPriceUpdate(null, null, null, true);
  } catch (error) {
    console.error("Cron job error:", error);
  }
});

app.listen(port, () => console.log(`Listening on ${port}`));
