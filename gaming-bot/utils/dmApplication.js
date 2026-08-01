const { markApplied, clearApplied } = require('./applicationManager');
const { createApplicationTicket } = require('./ticketManager');

const QUESTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes to answer each question

// Tracks who currently has a DM application in progress, so a double-click
// on the dropdown can't start two overlapping question loops for them.
const activeDmApplications = new Set();

function keyFor(userId, appId) {
  return `${userId}:${appId}`;
}

function isCancel(text) {
  const normalized = text.trim().toLowerCase();
  return normalized === 'cancel' || normalized === 'cancle';
}

/**
 * Sends the intro DM and, if that succeeds, kicks off the question loop in
 * the background. Returns true/false for whether the DM could be sent at
 * all, so the caller knows whether to tell the user "check your DMs" or
 * "I couldn't DM you".
 */
async function startDmApplication(guild, user, appId, appConfig) {
  const key = keyFor(user.id, appId);
  if (activeDmApplications.has(key)) return true;

  const dm = await user.createDM().catch(() => null);
  if (!dm) return false;

  const intro = await dm
    .send(
      `📋 **${appConfig.label}**\n` +
        `I'll ask you ${appConfig.questions.length} question(s) one at a time — just reply here with your answer.\n` +
        `Type \`cancel\` at any point to stop the application. You have ${Math.round(
          QUESTION_TIMEOUT_MS / 60000
        )} minutes to answer each question.`
    )
    .catch(() => null);

  if (!intro) return false;

  activeDmApplications.add(key);
  runQuestionLoop(guild, user, dm, appId, appConfig).finally(() => {
    activeDmApplications.delete(key);
  });

  return true;
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

module.exports = { startDmApplication };
