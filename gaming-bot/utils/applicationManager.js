const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

/* =========================================================
   PERSISTENT APPLICATION STATUS
   ("has this user got a pending application for this id")
========================================================= */

const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const APPLIED_FILE = path.join(DATA_DIR, 'applied.json');

function applicationKey(userId, appId) {
  return `${userId}:${appId}`;
}

function loadApplied() {
  if (!fs.existsSync(APPLIED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to read applied.json:', err);
    return {};
  }
}

function saveApplied(data) {
  try {
    fs.writeFileSync(APPLIED_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save applied.json:', err);
  }
}

function hasApplied(userId, appId) {
  const data = loadApplied();
  return Boolean(data[applicationKey(userId, appId)]);
}

function markApplied(userId, appId) {
  const data = loadApplied();
  data[applicationKey(userId, appId)] = { status: 'pending', createdAt: Date.now() };
  saveApplied(data);
}

function clearApplied(userId, appId) {
  const data = loadApplied();
  delete data[applicationKey(userId, appId)];
  saveApplied(data);
}

/* =========================================================
   FIND APPLICATION CONFIG
========================================================= */

function getApplication(appId) {
  return (config.applications || []).find((app) => app.id === appId);
}

/* =========================================================
   APPLICATION EMBED (shown in the created ticket)
========================================================= */

function buildApplicationEmbed(member, appConfig, answers) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application: ${appConfig.label}`)
    .setColor(appConfig.color || '#5865F2')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Applicant', value: `${member} (${member.user.tag})`, inline: false })
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  appConfig.questions.forEach((question, index) => {
    let answer = answers[index] || 'No answer';
    // Discord embed field values cannot exceed 1024 characters.
    if (answer.length > 1024) answer = answer.slice(0, 1021) + '...';

    let questionName = String(question);
    if (questionName.length > 256) questionName = questionName.slice(0, 253) + '...';

    embed.addFields({ name: questionName, value: answer, inline: false });
  });

  return embed;
}

/* =========================================================
   ACCEPT / DENY BUTTONS (on the application ticket)
========================================================= */

function buildDecisionRow(userId, appId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${userId}_${appId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app_deny_${userId}_${appId}`)
      .setLabel('Deny')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

module.exports = {
  hasApplied,
  markApplied,
  clearApplied,
  getApplication,
  buildApplicationEmbed,
  buildDecisionRow,
};
