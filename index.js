const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
} = require("discord.js");
const schedule = require("node-schedule");
const express = require("express");

// ⚡ Mini serveur pour Render/Replit (UptimeRobot ping)
const app = express();
app.get("/", (req, res) => res.send("Bot en ligne ✅"));
app.listen(3000, () =>
  console.log("🌐 Serveur Express actif sur le port 3000"),
);

// 🔒 Gestion des erreurs globales
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// 🔑 Token et salon via Render/Replit Secrets
const TOKEN = process.env.TOKEN; // Crée un secret nommé TOKEN
const CHANNEL_ID = process.env.CHANNEL; // Crée un secret nommé CHANNEL

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Données du jeu
let randomNumber = null;
let entries = {}; // { userId: { guesses: [], bonus: 0 } }
let gameActive = false;

// 📌 Initialisation du bot
client.once("clientready", async () => {
  console.log("🚀 Bot prêt et fonctionnel !");
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (channel) startGame(channel);

  // Démarrage des rappels toutes les 3 heures
  scheduleReminders();

  // Annonce des gagnants chaque samedi 21h (heure France)
  schedule.scheduleJob(
    { hour: 21, minute: 0, dayOfWeek: 6, tz: "Europe/Paris" },
    async () => {
      const ch = await client.channels.fetch(CHANNEL_ID);
      if (ch) endGame(ch);
    },
  );
});

// 🎲 Lancer un nouveau jeu
function startGame(channel) {
  randomNumber = Math.floor(Math.random() * 20000) + 1; // 1 à 20 000
  entries = {};
  gameActive = true;

  channel.send(
    "🎉 **Nouvelle Roulette !** Devinez le nombre mystère entre `1 et 20 000` avec `!guess <nombre>`.\nVous avez tous **1 tentative par défaut** !",
  );
}

// 🏆 Terminer le jeu et annoncer les gagnants
function endGame(channel) {
  if (!gameActive) return;
  gameActive = false;

  if (Object.keys(entries).length === 0) {
    channel.send("😢 Personne n’a participé cette semaine.");
  } else {
    let exactWinner = null;
    for (const [userId, data] of Object.entries(entries)) {
      if (data.guesses.includes(randomNumber)) {
        exactWinner = userId;
        break;
      }
    }

    if (exactWinner) {
      channel.send(
        `🎉 **GAGNANT !** <@${exactWinner}> a trouvé le nombre exact : **${randomNumber}** et remporte **100M de Kamas** !`,
      );
    } else {
      const scores = [];
      for (const [userId, data] of Object.entries(entries)) {
        let bestGuess = data.guesses.reduce(
          (closest, g) =>
            Math.abs(g - randomNumber) < Math.abs(closest - randomNumber)
              ? g
              : closest,
          data.guesses[0],
        );
        scores.push({
          userId,
          diff: Math.abs(bestGuess - randomNumber),
          guess: bestGuess,
        });
      }

      scores.sort((a, b) => a.diff - b.diff);
      const podium = scores.slice(0, 3);

      let resultMsg = `🥳 Personne n’a trouvé le nombre exact (**${randomNumber}**).\nVoici les **3 plus proches** :\n`;
      const rewards = [10_000_000, 6_000_000, 4_000_000]; // 1e, 2e, 3e place
      podium.forEach((p, i) => {
        resultMsg += `**${i + 1}ᵉ place** 🥇 <@${p.userId}> avec ${p.guess} (écart ${p.diff}) → **${rewards[i].toLocaleString()} Kamas**\n`;
      });

      channel.send(resultMsg);
    }
  }

  // Relancer le jeu automatiquement après 2s
  setTimeout(async () => {
    const ch = await client.channels.fetch(CHANNEL_ID);
    if (ch) startGame(ch);
  }, 2000);
}

// 📢 Rappel toutes les 3 heures
function scheduleReminders() {
  schedule.scheduleJob("0 */3 * * *", async () => {
    if (!gameActive) return;
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel) return;
      channel.send(`🎲 **Rappel : la Roulette est en cours !**
Devinez le nombre et gagnez 🤑
💥 Plus d’entrées ? Invitez vos amis !
1️⃣ ami invité = 1️⃣ entrée supplémentaire
🏆 100M de Kamas à gagner chaque semaine !
📌 **Comment participer ?**
Tapez une seule fois dans ce salon :
\`!guess <votre nombre>\` entre **1 et 20 000**`);
    } catch (err) {
      console.error("❌ Erreur lors de l'envoi du rappel :", err);
    }
  });
}

// 🔒 Supprimer les anciens listeners pour éviter les réponses multiples
client.removeAllListeners("messageCreate");

// 🎯 Commandes
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  // Deviner le nombre
  if (command === "!guess" && gameActive) {
    const guess = parseInt(args[1]);
    if (isNaN(guess)) return message.reply("❌ Entre un nombre valide.");
    if (guess < 1 || guess > 20000)
      return message.reply("⚠️ Nombre hors limite 1-20000.");

    if (!entries[message.author.id])
      entries[message.author.id] = { guesses: [], bonus: 0 };
    const player = entries[message.author.id];
    const totalEntries = 1 + player.bonus;
    if (player.guesses.length >= totalEntries)
      return message.reply("⛔ Tu as déjà utilisé toutes tes tentatives !");

    player.guesses.push(guess);
    message.reply(
      `✅ Participation enregistrée : ${guess}. (Tentatives utilisées : ${player.guesses.length}/${totalEntries})`,
    );
  }

  // Ajouter des entrées bonus (admin)
  if (command === "!addentry") {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    )
      return message.reply("❌ Tu n’as pas la permission.");
    const member = message.mentions.users.first();
    const extraEntries = parseInt(args[2]);
    if (!member || isNaN(extraEntries) || extraEntries < 1)
      return message.reply("⚠️ Utilisation : `!addentry @pseudo 2`");

    if (!entries[member.id]) entries[member.id] = { guesses: [], bonus: 0 };
    entries[member.id].bonus += extraEntries;
    message.reply(
      `✅ ${member.username} a reçu **${extraEntries} entrées bonus**.`,
    );
  }
});

// 🔑 Lancer le bot
client.login(TOKEN);
