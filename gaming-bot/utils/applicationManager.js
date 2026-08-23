const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

const config = require('../config.json');

const {
  savePartial,
  getPartial,
  clearPartial,
  markApplied,
  clearApplied,
} = require('./applicationManager');

const {
  createApplicationTicket,
} = require('./ticketManager');


/* =========================
   FIND APPLICATION
========================= */

function getApplication(appId) {
  return (config.applications || []).find(
    (app) => app.id === appId
  );
}


/* =========================
   START APPLICATION
========================= */

async function startDmApplication(
  guild,
  user,
  appId,
  appConfig
) {
  try {
    const dm = await user.createDM();

    const embed = new EmbedBuilder()
      .setTitle(`📋 ${appConfig.label}`)
      .setDescription(
        `You are about to apply for **${appConfig.label}** in **${guild.name}**.\n\n` +
        `You will be asked ${appConfig.questions.length} questions.\n\n` +
        `Please answer every question honestly and with as much detail as possible.`
      )
      .setColor(appConfig.color || '#5865F2')
      .setFooter({
        text: 'You can cancel the application at any time.'
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dmapp_start_${guild.id}_${appId}`)
        .setLabel('Start Application')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`dmapp_cancel_${guild.id}_${appId}`)
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await dm.send({
      embeds: [embed],
      components: [row],
    });

    return true;

  } catch (err) {
    console.error(
      'Failed to start DM application:',
      err
    );

    return false;
  }
}


/* =========================
   BUILD QUESTION MODAL
========================= */

function buildQuestionModal(
  appId,
  questionIndex,
  question
) {
  const modal = new ModalBuilder()
    .setCustomId(
      `dmapp_question_${appId}_${questionIndex}`
    )
    .setTitle(
      `Question ${questionIndex + 1}`
    );

  const input = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(
      String(question).slice(0, 45)
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}


/* =========================
   START BUTTON
========================= */

async function handleDmApplicationStart(
  interaction,
  appId,
  guildIdOverride = null
) {
  const parts = appId.split('_');

  /*
    The button format is:

    dmapp_start_GUILDID_APPID

    We therefore need to recover the guild ID
    and application ID.

    Because Discord IDs are numeric and app IDs
    are normally words, find the first non-numeric
    section.
  */

  let guildId = guildIdOverride;
  let realAppId = appId;

  if (!guildId) {
    const match = appId.match(/^(\d+)_(.+)$/);

    if (match) {
      guildId = match[1];
      realAppId = match[2];
    }
  }

  const appConfig = getApplication(realAppId);

  if (!appConfig) {
    return interaction.reply({
      content: '❌ That application no longer exists.',
      ephemeral: true,
    });
  }

  const guild =
    interaction.client.guilds.cache.get(guildId);

  if (!guild) {
    return interaction.reply({
      content: '❌ I could not find the server for this application.',
      ephemeral: true,
    });
  }

  const alreadyApplied = getPartial(
    interaction.user.id,
    realAppId
  );

  if (alreadyApplied) {
    return interaction.reply({
      content:
        '❌ You already have an application in progress.',
      ephemeral: true,
    });
  }

  /*
    Start with an empty answer array.
  */

  savePartial(
    interaction.user.id,
    realAppId,
    []
  );

  await interaction.showModal(
    buildQuestionModal(
      realAppId,
      0,
      appConfig.questions[0]
    )
  );
}


/* =========================
   HANDLE QUESTION
========================= */

async function handleDmApplicationQuestion(
  interaction
) {
  const customId =
    interaction.customId.replace(
      'dmapp_question_',
      ''
    );

  /*
    Format:

    dmapp_question_APPID_INDEX

    Example:

    dmapp_question_staff_0
  */

  const lastUnderscore =
    customId.lastIndexOf('_');

  if (lastUnderscore === -1) {
    return interaction.reply({
      content: '❌ Invalid application question.',
      ephemeral: true,
    });
  }

  const appId =
    customId.slice(0, lastUnderscore);

  const questionIndex =
    Number(
      customId.slice(lastUnderscore + 1)
    );

  if (Number.isNaN(questionIndex)) {
    return interaction.reply({
      content: '❌ Invalid question number.',
      ephemeral: true,
    });
  }

  const appConfig =
    getApplication(appId);

  if (!appConfig) {
    return interaction.reply({
      content: '❌ That application no longer exists.',
      ephemeral: true,
    });
  }

  const answer =
    interaction.fields.getTextInputValue(
      'answer'
    );

  const currentAnswers =
    getPartial(
      interaction.user.id,
      appId
    ) || [];

  currentAnswers[questionIndex] = answer;

  /*
    More questions remain.
  */

  const nextIndex =
    questionIndex + 1;

  if (
    nextIndex <
    appConfig.questions.length
  ) {
    savePartial(
      interaction.user.id,
      appId,
      currentAnswers
    );

    await interaction.showModal(
      buildQuestionModal(
        appId,
        nextIndex,
        appConfig.questions[nextIndex]
      )
    );

    return;
  }

  /*
    FINAL QUESTION
  */

  try {
    await interaction.deferReply({
      ephemeral: true,
    });

    const guild =
      config.guildId
        ? interaction.client.guilds.cache.get(
            config.guildId
          )
        : interaction.client.guilds.cache.find(
            (g) =>
              g.members.cache.has(
                interaction.user.id
              )
          );

    /*
      Better fallback:
      find the guild where the application panel
      exists / user is a member.
    */

    let targetGuild = guild;

    if (!targetGuild) {
      for (
        const server
        of interaction.client.guilds.cache.values()
      ) {
        const member =
          await server.members
            .fetch(interaction.user.id)
            .catch(() => null);

        if (member) {
          targetGuild = server;
          break;
        }
      }
    }

    if (!targetGuild) {
      clearPartial(
        interaction.user.id,
        appId
      );

      clearApplied(
        interaction.user.id,
        appId
      );

      return interaction.editReply({
        content:
          '❌ I could not find the server for this application.',
      });
    }

    const member =
      await targetGuild.members
        .fetch(interaction.user.id)
        .catch(() => null);

    if (!member) {
      clearPartial(
        interaction.user.id,
        appId
      );

      clearApplied(
        interaction.user.id,
        appId
      );

      return interaction.editReply({
        content:
          '❌ I could not find you in the server.',
      });
    }

    /*
      Mark the application as pending.
    */

    markApplied(
      interaction.user.id,
      appId
    );

    /*
      Convert answers into the format expected
      by buildApplicationEmbed().
    */

    const answers = appConfig.questions.map(
      (question, index) => ({
        question,
        answer:
          currentAnswers[index] ||
          'No answer',
      })
    );

    /*
      CREATE APPLICATION TICKET.

      IMPORTANT:
      This uses createApplicationTicket()
      instead of createTicket().

      That means it gets the application
      review channel, accept/deny buttons,
      application roles, etc.
    */

    const channel =
      await createApplicationTicket(
        targetGuild,
        member,
        appId,
        appConfig,
        currentAnswers
      );

    clearPartial(
      interaction.user.id,
      appId
    );

    await interaction.editReply({
      content:
        `✅ Your **${appConfig.label}** application has been submitted!\n\n` +
        `Staff will review it shortly.`,
    });

    /*
      Optional confirmation DM.
    */

    if (channel) {
      await interaction.user
        .send(
          `📋 Your **${appConfig.label}** application has been submitted to **${targetGuild.name}**.`
        )
        .catch(() => {});
    }

  } catch (err) {
    console.error(
      'Failed to submit application:',
      err
    );

    clearPartial(
      interaction.user.id,
      appId
    );

    clearApplied(
      interaction.user.id,
      appId
    );

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction.editReply({
        content:
          '❌ Something went wrong submitting your application. Please try again.',
      }).catch(() => {});
    } else {
      await interaction.reply({
        content:
          '❌ Something went wrong submitting your application. Please try again.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
}


/* =========================
   CANCEL
========================= */

async function handleDmApplicationCancel(
  interaction,
  appId
) {
  const match =
    appId.match(/^(\d+)_(.+)$/);

  let realAppId = appId;

  if (match) {
    realAppId = match[2];
  }

  clearPartial(
    interaction.user.id,
    realAppId
  );

  clearApplied(
    interaction.user.id,
    realAppId
  );

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle('Application Cancelled')
        .setDescription(
          'Your application has been cancelled.'
        )
        .setColor('#ED4245')
    ],
    components: [],
  });
}


module.exports = {
  startDmApplication,
  handleDmApplicationStart,
  handleDmApplicationQuestion,
  handleDmApplicationCancel,
};
