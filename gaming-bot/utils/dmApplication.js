const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { markApplied, clearApplied } = require('./applicationManager');
const { createApplicationTicket } = require('./ticketManager');

const QUESTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes to answer each question

// Tracks who currently has a DM application question loop in progress.
const activeDmApplications = new Set();

// Tracks who has a "Start/Cancel" confirmation sitting in their DMs,
// waiting to be clicked. Holds what's needed to actually start the loop
// once they press Start (guild + the application's config).
const pendingConfirmations = new Map();

function keyFor(userId, appId) {
  return `${userId}:${appId}`;
}

function isCancel(text) {
  const normalized = text.trim().toLowerCase();
  return normalized === 'cancel' || normalized === 'cancle';
}

function buildStartCancelRow(appId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dmapp_start_${appId}`)
      .setLabel('Start Application')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dmapp_cancel_${appId}`)
      .setLabel('Cancel Application')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Sends the "would you like to start?" confirmation DM. Returns true/false
 * for whether the DM could be sent at all, so the caller knows whether to
 * tell the user "check your DMs" or "I couldn't DM you".
 */
async function startDmApplication(guild, user, appId, appConfig) {
  const key = keyFor(user.id, appId);
  if (activeDmApplications.has(key) || pendingConfirmations.has(key)) return true;

  const dm = await user.createDM().catch(() => null);
  if (!dm) return false;

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${appConfig.label}`)
    .setDescription(
      `Would you like to start this application?\n\n` +
        `I'll ask you ${appConfig.questions.length} question(s) one at a time — you'll be able to type \`cancel\` at any point once it starts.`
    )
    .setColor(appConfig.color || '#5865F2');

  const sent = await dm.send({ embeds: [embed], components: [buildStartCancelRow(appId)] }).catch(() => null);
  if (!sent) return false;

  pendingConfirmations.set(key, { guild, appConfig });
  return true;
}

/** Called from interactionCreate.js when the "Start Application" DM button is clicked. */
async function handleDmApplicationStart(interaction, appId) {
  const key = keyFor(interaction.user.id, appId);
  const pending = pendingConfirmations.get(key);
  pendingConfirmations.delete(key);

  if (!pending) {
    await interaction
      .update({ content: 'This confirmation has expired — please start again from the panel.', embeds: [], components: [] })
      .catch(() => {});
    return;
  }

  await interaction
    .update({ content: `📋 **${pending.appConfig.label}** — let's go! Type \`cancel\` any time to stop.`, embeds: [], components: [] })
    .catch(() => {});

  const dm = await interaction.user.createDM().catch(() => null);
  if (!dm) return;

  activeDmApplications.add(key);
  runQuestionLoop(pending.guild, interaction.user, dm, appId, pending.appConfig).finally(() => {
    activeDmApplications.delete(key);
  });
}

/** Called from interactionCreate.js when the "Cancel Application" DM button is clicked. */
async function handleDmApplicationCancel(interaction, appId) {
  const key = keyFor(interaction.user.id, appId);
  pendingConfirmations.delete(key);
  await interaction.update({ content: '❌ Application cancelled.', embeds: [], components: [] }).catch(() => {});
}

async function runQuestionLoop(guild, user, dm, appId, appConfig) {
  const answers = [];

  for (let i = 0; i < appConfig.questions.length; i++) {
    const question = appConfig.questions[i];
    await dm
      .send(`**Question ${i + 1}/${appConfig.questions.length}:** ${question}`)
      .catch(() => {});

    const collected = await dm
      .awaitMessages({
        filter: (m) => m.author.id === user.id,
        max: 1,
        time: QUESTION_TIMEOUT_MS,
        errors: ['time'],
      })
      .catch(() => null);

    if (!collected || collected.size === 0) {
      await dm.send('⏱️ You took too long to respond — your application has been cancelled.').catch(() => {});
      return;
    }

    const reply = collected.first().content.trim();

    if (isCancel(reply)) {
      await dm.send('❌ Application cancelled. You can start again from the panel anytime.').catch(() => {});
      return;
    }

    answers.push(reply || 'No answer');
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await dm
      .send("⚠️ Something went wrong submitting your application (couldn't find you in the server) — please contact staff.")
      .catch(() => {});
    return;
  }

  markApplied(user.id, appId);

  const channel = await createApplicationTicket(guild, member, appId, appConfig, answers).catch((err) => {
    console.error('Failed to create application ticket:', err);
    return null;
  });

  if (!channel) {
    clearApplied(user.id, appId);
    await dm
      .send("⚠️ I couldn't open a ticket for your application — please contact staff and let them know.")
      .catch(() => {});
    return;
  }

  await dm.send(`✅ Application submitted! A ticket has been opened for it: ${channel.url}`).catch(() => {});
}

module.exports = { startDmApplication, handleDmApplicationStart, handleDmApplicationCancel };
