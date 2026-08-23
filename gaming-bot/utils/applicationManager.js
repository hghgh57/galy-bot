const fs = require('fs');
const path = require('path');

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

/* =========================================================
   APPLICATION STATE
========================================================= */

const pendingApplications = new Map();

function applicationKey(userId, appId) {
  return `${userId}:${appId}`;
}

function savePartial(userId, appId, answers) {
  const key = applicationKey(userId, appId);

  pendingApplications.set(key, {
    answers: Array.isArray(answers) ? answers : [],
    createdAt: Date.now(),
  });

  // Automatically remove unfinished applications after 30 minutes
  setTimeout(() => {
    pendingApplications.delete(key);
  }, 30 * 60 * 1000);
}

function getPartial(userId, appId) {
  const data = pendingApplications.get(
    applicationKey(userId, appId)
  );

  if (!data) return null;

  return data.answers;
}

function clearPartial(userId, appId) {
  pendingApplications.delete(
    applicationKey(userId, appId)
  );
}

/* =========================================================
   PERSISTENT APPLICATION STATUS
========================================================= */

const DATA_DIR =
  process.env.DATA_DIR || '/app/data';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });
}

const APPLIED_FILE =
  path.join(DATA_DIR, 'applied.json');

function loadApplied() {
  if (!fs.existsSync(APPLIED_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        APPLIED_FILE,
        'utf8'
      )
    );
  } catch (err) {
    console.error(
      'Failed to read applied.json:',
      err
    );

    return {};
  }
}

function saveApplied(data) {
  try {
    fs.writeFileSync(
      APPLIED_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (err) {
    console.error(
      'Failed to save applied.json:',
      err
    );
  }
}

function hasApplied(userId, appId) {
  const data = loadApplied();

  return Boolean(
    data[applicationKey(userId, appId)]
  );
}

function markApplied(userId, appId) {
  const data = loadApplied();

  data[applicationKey(userId, appId)] = {
    status: 'pending',
    createdAt: Date.now(),
  };

  saveApplied(data);
}

function clearApplied(userId, appId) {
  const data = loadApplied();

  delete data[
    applicationKey(userId, appId)
  ];

  saveApplied(data);
}

/* =========================================================
   FIND APPLICATION
========================================================= */

function getApplication(appId) {
  return (
    config.applications || []
  ).find(
    app => app.id === appId
  );
}

/* =========================================================
   START APPLICATION DM
========================================================= */

async function startDmApplication(
  guild,
  user,
  appId,
  appConfig
) {
  try {
    const dm = await user.createDM();

    const embed =
      new EmbedBuilder()
        .setTitle(
          `📋 ${appConfig.label}`
        )
        .setDescription(
          `You are about to apply for **${appConfig.label}** in **${guild.name}**.\n\n` +
          `You will be asked **${appConfig.questions.length} questions**.\n\n` +
          `Please answer every question honestly and with as much detail as possible.`
        )
        .setColor(
          appConfig.color ||
          '#5865F2'
        )
        .setFooter({
          text:
            'You can cancel the application at any time.',
        });

    const row =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              `dmapp_start_${guild.id}_${appId}`
            )
            .setLabel(
              'Start Application'
            )
            .setEmoji('📋')
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              `dmapp_cancel_${guild.id}_${appId}`
            )
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(
              ButtonStyle.Danger
            )

        );

    await dm.send({
      embeds: [embed],
      components: [row],
    });

    return true;

  } catch (err) {

    console.error(
      'Failed to DM application:',
      err
    );

    return false;
  }
}

/* =========================================================
   BUILD QUESTION MODAL
========================================================= */

function buildQuestionModal(
  appId,
  questionIndex,
  question
) {

  const modal =
    new ModalBuilder()
      .setCustomId(
        `dmapp_question_${appId}_${questionIndex}`
      )
      .setTitle(
        `Question ${questionIndex + 1}`
      );

  const input =
    new TextInputBuilder()
      .setCustomId('answer')
      .setLabel(
        String(question).slice(0, 45)
      )
      .setStyle(
        TextInputStyle.Paragraph
      )
      .setRequired(true)
      .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(input)
  );

  return modal;
}

/* =========================================================
   START APPLICATION
========================================================= */

async function handleDmApplicationStart(
  interaction,
  encodedData
) {

  let guildId;
  let appId;

  /*
    Button:

    dmapp_start_GUILDID_APPID
  */

  const match =
    encodedData.match(
      /^(\d+)_(.+)$/
    );

  if (match) {
    guildId = match[1];
    appId = match[2];
  } else {
    appId = encodedData;
  }

  const appConfig =
    getApplication(appId);

  if (!appConfig) {
    return interaction.reply({
      content:
        '❌ That application no longer exists.',
      ephemeral: true,
    });
  }

  const guild =
    interaction.client.guilds.cache.get(
      guildId
    );

  if (!guild) {
    return interaction.reply({
      content:
        '❌ I could not find the server for this application.',
      ephemeral: true,
    });
  }

  /*
    IMPORTANT:

    Only block them if they actually have an
    application waiting for staff.

    An unfinished application is NOT permanent.
  */

  if (
    hasApplied(
      interaction.user.id,
      appId
    )
  ) {
    return interaction.reply({
      content:
        '❌ You already have a pending application for this position.',
      ephemeral: true,
    });
  }

  /*
    If there is an old unfinished application,
    clear it so they can start again.
  */

  clearPartial(
    interaction.user.id,
    appId
  );

  savePartial(
    interaction.user.id,
    appId,
    []
  );

  if (
    !appConfig.questions ||
    !appConfig.questions.length
  ) {
    return interaction.reply({
      content:
        '❌ This application has no questions configured.',
      ephemeral: true,
    });
  }

  await interaction.showModal(
    buildQuestionModal(
      appId,
      0,
      appConfig.questions[0]
    )
  );
}

/* =========================================================
   HANDLE APPLICATION QUESTION
========================================================= */

async function handleDmApplicationQuestion(
  interaction
) {

  const customId =
    interaction.customId.replace(
      'dmapp_question_',
      ''
    );

  const lastUnderscore =
    customId.lastIndexOf('_');

  if (lastUnderscore === -1) {
    return interaction.reply({
      content:
        '❌ Invalid application question.',
      ephemeral: true,
    });
  }

  const appId =
    customId.slice(
      0,
      lastUnderscore
    );

  const questionIndex =
    Number(
      customId.slice(
        lastUnderscore + 1
      )
    );

  if (
    Number.isNaN(questionIndex)
  ) {
    return interaction.reply({
      content:
        '❌ Invalid question number.',
      ephemeral: true,
    });
  }

  const appConfig =
    getApplication(appId);

  if (!appConfig) {
    return interaction.reply({
      content:
        '❌ That application no longer exists.',
      ephemeral: true,
    });
  }

  if (
    questionIndex < 0 ||
    questionIndex >=
      appConfig.questions.length
  ) {
    return interaction.reply({
      content:
        '❌ Invalid application question.',
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

  currentAnswers[
    questionIndex
  ] = answer;

  const nextIndex =
    questionIndex + 1;

  /*
    MORE QUESTIONS
  */

  if (
    nextIndex <
    appConfig.questions.length
  ) {

    savePartial(
      interaction.user.id,
      appId,
      currentAnswers
    );

    return interaction.showModal(
      buildQuestionModal(
        appId,
        nextIndex,
        appConfig.questions[
          nextIndex
        ]
      )
    );
  }

  /*
    FINAL QUESTION
  */

  await interaction.deferReply({
    ephemeral: true,
  });

  try {

    /*
      Find the guild from the application
      panel / user's membership.
    */

    let targetGuild = null;

    if (config.guildId) {
      targetGuild =
        interaction.client.guilds.cache.get(
          config.guildId
        );
    }

    if (!targetGuild) {
      for (
        const guild of
        interaction.client.guilds.cache.values()
      ) {

        const member =
          await guild.members
            .fetch(
              interaction.user.id
            )
            .catch(() => null);

        if (member) {
          targetGuild = guild;
          break;
        }
      }
    }

    if (!targetGuild) {

      clearPartial(
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
        .fetch(
          interaction.user.id
        )
        .catch(() => null);

    if (!member) {

      clearPartial(
        interaction.user.id,
        appId
      );

      return interaction.editReply({
        content:
          '❌ You are not a member of the server.',
      });
    }

    /*
      CREATE THE APPLICATION TICKET FIRST.

      We only mark the user as applied AFTER
      the ticket successfully exists.

      This fixes the "it locks and I can't
      click it again" problem when ticket
      creation fails.
    */

    const {
      createApplicationTicket,
    } = require('./ticketManager');

    const channel =
      await createApplicationTicket(
        targetGuild,
        member,
        appId,
        appConfig,
        currentAnswers
      );

    if (!channel) {
      throw new Error(
        'Application ticket was not created.'
      );
    }

    /*
      NOW mark application as pending.
    */

    markApplied(
      interaction.user.id,
      appId
    );

    /*
      Clear temporary answers.
    */

    clearPartial(
      interaction.user.id,
      appId
    );

    /*
      Confirm to the applicant.
    */

    await interaction.editReply({
      content:
        `✅ Your **${appConfig.label}** application has been submitted!\n\n` +
        `Staff will review it shortly.`,
    });

    /*
      Send confirmation DM.

      Failure here should NOT make the
      application fail.
    */

    await interaction.user
      .send(
        `📋 Your **${appConfig.label}** application has been submitted to **${targetGuild.name}**.`
      )
      .catch(() => {});

  } catch (err) {

    console.error(
      'Failed to submit application:',
      err
    );

    /*
      CRITICAL:
      If ticket creation failed, remove
      the temporary application lock.
    */

    clearPartial(
      interaction.user.id,
      appId
    );

    clearApplied(
      interaction.user.id,
      appId
    );

    await interaction.editReply({
      content:
        '❌ Something went wrong submitting your application. You have NOT been locked out — please try again.',
    }).catch(() => {});
  }
}

/* =========================================================
   CANCEL APPLICATION
========================================================= */

async function handleDmApplicationCancel(
  interaction,
  encodedData
) {

  let appId = encodedData;

  const match =
    encodedData.match(
      /^(\d+)_(.+)$/
    );

  if (match) {
    appId = match[2];
  }

  clearPartial(
    interaction.user.id,
    appId
  );

  clearApplied(
    interaction.user.id,
    appId
  );

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          'Application Cancelled'
        )
        .setDescription(
          'Your application has been cancelled. You can apply again whenever you want.'
        )
        .setColor('#ED4245'),
    ],
    components: [],
  });
}

/* =========================================================
   APPLICATION EMBED
========================================================= */

function buildApplicationEmbed(
  member,
  appConfig,
  answers
) {

  const embed =
    new EmbedBuilder()
      .setTitle(
        `📋 New Application: ${appConfig.label}`
      )
      .setColor(
        appConfig.color ||
        '#5865F2'
      )
      .setThumbnail(
        member.user.displayAvatarURL()
      )
      .addFields({
        name: 'Applicant',
        value:
          `${member} (${member.user.tag})`,
        inline: false,
      })
      .setFooter({
        text:
          `User ID: ${member.id}`,
      })
      .setTimestamp();

  appConfig.questions.forEach(
    (question, index) => {

      let answer =
        answers[index] ||
        'No answer';

      /*
        Discord embed fields cannot exceed
        1024 characters.
      */

      if (answer.length > 1024) {
        answer =
          answer.slice(0, 1021) +
          '...';
      }

      let questionName =
        String(question);

      if (questionName.length > 256) {
        questionName =
          questionName.slice(
            0,
            253
          ) + '...';
      }

      embed.addFields({
        name: questionName,
        value: answer,
        inline: false,
      });
    }
  );

  return embed;
}

/* =========================================================
   ACCEPT / DENY BUTTONS
========================================================= */

function buildDecisionRow(
  userId,
  appId,
  disabled = false
) {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `app_accept_${userId}_${appId}`
        )
        .setLabel('Accept')
        .setEmoji('✅')
        .setStyle(
          ButtonStyle.Success
        )
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(
          `app_deny_${userId}_${appId}`
        )
        .setLabel('Deny')
        .setEmoji('❌')
        .setStyle(
          ButtonStyle.Danger
        )
        .setDisabled(disabled)

    );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  // Application state
  savePartial,
  getPartial,
  clearPartial,

  hasApplied,
  markApplied,
  clearApplied,

  // Application configuration
  getApplication,

  // DM application
  startDmApplication,
  handleDmApplicationStart,
  handleDmApplicationQuestion,
  handleDmApplicationCancel,

  // Application ticket display
  buildApplicationEmbed,
  buildDecisionRow,
};
