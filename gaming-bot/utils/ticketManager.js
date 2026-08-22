const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config.json');

const {
  buildTranscript,
} = require('./transcript');

const {
  buildApplicationEmbed,
  buildDecisionRow,
} = require('./applicationManager');

const {
  incrementStat,
} = require('./staffTracker');


/* =========================
   PARSE TICKET TOPIC
========================= */

function parseTopic(topic) {
  if (
    !topic ||
    !topic.startsWith('ticket|')
  ) {
    return null;
  }

  const parts =
    topic.split('|');

  if (parts.length < 3) {
    return null;
  }

  return {
    userId: parts[1],
    categoryId: parts.slice(2).join('|'),
  };
}


/* =========================
   COUNT OPEN TICKETS
========================= */

function countOpenTicketsForUser(
  guild,
  userId
) {
  return guild.channels.cache.filter(
    (channel) => {
      const meta =
        parseTopic(channel.topic);

      return (
        meta &&
        meta.userId === userId
      );
    }
  ).size;
}


/* =========================
   TICKET BUTTONS
========================= */

function buildTicketControlRow(
  claimed = false
) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          'ticket_claim'
        )
        .setLabel(
          claimed
            ? 'Claimed'
            : 'Claim'
        )
        .setEmoji('🙋')
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          claimed
        ),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close'
        )
        .setLabel(
          'Close'
        )
        .setEmoji('🔒')
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close_reason'
        )
        .setLabel(
          'Close with Reason'
        )
        .setEmoji('📝')
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}


/* =========================
   ROLE CONFIGURATION
========================= */

function getTicketRoleIds() {
  return (
    config.ticketRoleIds || []
  );
}


function getApplicationTicketRoleIds() {
  return (
    config.applicationTicketRoleIds ||
    []
  );
}


function getServiceTicketRoleIds() {
  const ids =
    (
      config.serviceTicketRoleIds ||
      []
    ).filter(
      (id) =>
        id &&
        !id.startsWith('PUT_')
    );

  return ids.length
    ? ids
    : getTicketRoleIds();
}


/* =========================
   CATEGORY DETECTION
========================= */

function isApplicationTicket(
  categoryId
) {
  return (
    config.applications || []
  ).some(
    (application) =>
      application.id === categoryId
  );
}


function isServiceTicket(
  categoryId
) {
  return (
    config.serviceCategories || []
  ).some(
    (category) =>
      category.id === categoryId
  );
}


function findCategory(
  categoryId
) {
  return (
    (
      config.categories || []
    ).find(
      (category) =>
        category.id === categoryId
    )

    ||

    (
      config.serviceCategories || []
    ).find(
      (category) =>
        category.id === categoryId
    )
  );
}


function getRoleIdsForTicket(
  categoryId
) {
  if (
    isApplicationTicket(
      categoryId
    )
  ) {
    return getApplicationTicketRoleIds();
  }

  if (
    isServiceTicket(
      categoryId
    )
  ) {
    return getServiceTicketRoleIds();
  }

  return getTicketRoleIds();
}


/* =========================
   CREATE TICKET
========================= */

async function createTicket(
  interaction,
  categoryId,
  answers = []
) {
  const {
    guild,
    user,
  } = interaction;

  const category =
    findCategory(categoryId);

  if (!category) {
    if (
      interaction.deferred ||
      interaction.replied
    ) {
      return interaction.editReply({
        content:
          '❌ Unknown ticket category.',
      });
    }

    return interaction.reply({
      content:
        '❌ Unknown ticket category.',
      ephemeral: true,
    });
  }


  /* =========================
     OPEN TICKET LIMIT
  ========================= */

  const existing =
    countOpenTicketsForUser(
      guild,
      user.id
    );

  const maxTickets =
    Number(
      config.maxOpenTicketsPerUser ||
      1
    );

  if (
    existing >= maxTickets
  ) {
    return interaction.reply({
      content:
        `You already have ${existing} open ticket(s). Please close them before opening another ticket.`,
      ephemeral: true,
    });
  }


  /* =========================
     ACKNOWLEDGE INTERACTION
  ========================= */

  await interaction.deferReply({
    ephemeral: true,
  });


  /* =========================
     PERMISSIONS
  ========================= */

  const permissionOverwrites = [

    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },

    {
      id:
        user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },

    {
      id:
        interaction.client.user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];


  /* =========================
     STAFF ROLES
  ========================= */

  for (
    const roleId of
      getRoleIdsForTicket(
        categoryId
      )
  ) {
    if (
      !roleId ||
      roleId.startsWith('PUT_')
    ) {
      continue;
    }

    permissionOverwrites.push({
      id: roleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }


  /* =========================
     CHANNEL NAME
  ========================= */

  const safeName =
    user.username
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ''
      )
      .slice(0, 20) ||
    'user';


  /* =========================
     CHANNEL OPTIONS
  ========================= */

  const channelOptions = {
    name:
      `ticket-${safeName}`,

    type:
      ChannelType.GuildText,

    topic:
      `ticket|${user.id}|${categoryId}`,

    permissionOverwrites,
  };


  /* =========================
     SERVICE TICKET CATEGORY
  ========================= */

  if (
    isServiceTicket(
      categoryId
    )
  ) {
    if (
      config.serviceTicketCategoryId &&
      !config.serviceTicketCategoryId.startsWith(
        'PUT_'
      )
    ) {
      channelOptions.parent =
        config.serviceTicketCategoryId;
    }
  }


  /* =========================
     NORMAL TICKET CATEGORY
  ========================= */

  else if (
    config.ticketCategoryId &&
    !config.ticketCategoryId.startsWith(
      'PUT_'
    )
  ) {
    channelOptions.parent =
      config.ticketCategoryId;
  }


  /* =========================
     CREATE CHANNEL
  ========================= */

  try {
    const channel =
      await guild.channels.create(
        channelOptions
      );


    /* =========================
       WELCOME EMBED
    ========================= */

    const welcomeEmbed =
      new EmbedBuilder()
        .setTitle(
          `${category.emoji || '🎫'} ${category.label}`
        )
        .setDescription(
          `Hi ${user}, thanks for reaching out!\n\n` +
          `**Category:** ${category.label}\n\n` +
          `Please describe what you need in as much detail as possible. ` +
          `A member of our team will be with you shortly.`
        )
        .setColor(
          config.panel?.color ||
          '#5865F2'
        )
        .setTimestamp();


    /* =========================
       QUESTIONS
    ========================= */

    if (
      Array.isArray(answers) &&
      answers.length
    ) {
      welcomeEmbed.addFields(
        answers.map(
          (answer) => ({
            name:
              String(
                answer.question ||
                'Question'
              ).slice(0, 256),

            value:
              String(
                answer.answer ||
                'No answer'
              ).slice(0, 1024),
          })
        )
      );
    }


    /* =========================
       STAFF MENTIONS
    ========================= */

    const mentions =
      getRoleIdsForTicket(
        categoryId
      )
        .filter(
          (id) =>
            id &&
            !id.startsWith('PUT_')
        )
        .map(
          (id) =>
            `<@&${id}>`
        )
        .join(' ');


    /* =========================
       SEND TICKET MESSAGE
    ========================= */

    await channel.send({
      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        welcomeEmbed,
      ],

      components: [
        buildTicketControlRow(),
      ],
    });


    await interaction.editReply({
      content:
        `✅ Your ticket has been created: ${channel}`,
    });


    return channel;

  } catch (error) {

    console.error(
      'Failed to create ticket:',
      error
    );

    await interaction
      .editReply({
        content:
          '❌ Something went wrong creating your ticket. Please try again or contact staff.',
      })
      .catch(() => {});

    return null;
  }
}


/* =========================
   CREATE APPLICATION TICKET
========================= */

async function createApplicationTicket(
  guild,
  member,
  appId,
  appConfig,
  answers
) {
  const user =
    member.user;


  /* =========================
     BOT MEMBER
  ========================= */

  const botMember =
    guild.members.me ||
    await guild.members.fetch(
      guild.client.user.id
    ).catch(() => null);

  if (!botMember) {
    throw new Error(
      'Could not find bot member.'
    );
  }


  /* =========================
     PERMISSIONS
  ========================= */

  const permissionOverwrites = [

    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },

    {
      id:
        user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },

    {
      id:
        botMember.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];


  /* =========================
     APPLICATION STAFF ROLES
  ========================= */

  for (
    const roleId of
      getApplicationTicketRoleIds()
  ) {
    if (
      !roleId ||
      roleId.startsWith('PUT_')
    ) {
      continue;
    }

    permissionOverwrites.push({
      id: roleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }


  /* =========================
     CHANNEL NAME
  ========================= */

  const safeName =
    user.username
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ''
      )
      .slice(0, 20) ||
    'user';


  const channelOptions = {
    name:
      `app-${safeName}`,

    type:
      ChannelType.GuildText,

    topic:
      `ticket|${user.id}|${appId}`,

    permissionOverwrites,
  };


  /* =========================
     APPLICATION CATEGORY
  ========================= */

  const appCategoryId =
    config.applicationTicketCategoryId &&
    !config.applicationTicketCategoryId.startsWith(
      'PUT_'
    )
      ? config.applicationTicketCategoryId
      : config.ticketCategoryId;


  if (
    appCategoryId &&
    !appCategoryId.startsWith(
      'PUT_'
    )
  ) {
    channelOptions.parent =
      appCategoryId;
  }


  /* =========================
     CREATE CHANNEL
  ========================= */

  const channel =
    await guild.channels.create(
      channelOptions
    );


  /* =========================
     APPLICATION EMBED
  ========================= */

  const embed =
    buildApplicationEmbed(
      member,
      appConfig,
      answers
    );


  const decisionRow =
    buildDecisionRow(
      user.id,
      appId
    );


  /* =========================
     STAFF MENTIONS
  ========================= */

  const mentions =
    getApplicationTicketRoleIds()
      .filter(
        (id) =>
          id &&
          !id.startsWith('PUT_')
      )
      .map(
        (id) =>
          `<@&${id}>`
      )
      .join(' ');


  /* =========================
     SEND APPLICATION
  ========================= */

  await channel.send({
    content:
      `${user} ${mentions}`.trim(),

    embeds: [
      embed,
    ],

    components: [
      decisionRow,
    ],
  });


  /* =========================
     TICKET CONTROLS
  ========================= */

  await channel.send({
    components: [
      buildTicketControlRow(),
    ],
  });


  return channel;
}


/* =========================
   CLAIM TICKET
========================= */

async function claimTicket(
  interaction
) {
  const meta =
    parseTopic(
      interaction.channel.topic
    );

  if (!meta) {
    return interaction.reply({
      content:
        '❌ This does not look like a ticket channel.',
      ephemeral: true,
    });
  }


  const member =
    interaction.member;


  const roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  const isTicketStaff =
    roleIds.some(
      (id) =>
        member.roles.cache.has(id)
    );


  const isManager =
    member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    );


  if (
    !isTicketStaff &&
    !isManager
  ) {
    return interaction.reply({
      content:
        '❌ Only ticket staff can claim tickets.',
      ephemeral: true,
    });
  }


  /* =========================
     ACKNOWLEDGE IMMEDIATELY
  ========================= */

  await interaction.deferReply();


  const embed =
    new EmbedBuilder()
      .setDescription(
        `🙋 This ticket has been claimed by ${interaction.user}.`
      )
      .setColor(
        '#57F287'
      );


  await interaction.editReply({
    embeds: [
      embed,
    ],
  });


  /* =========================
     DISABLE CLAIM BUTTON
  ========================= */

  const disabledRow =
    buildTicketControlRow(
      true
    );


  await interaction.message
    .edit({
      components: [
        disabledRow,
      ],
    })
    .catch(() => {});


  /* =========================
     STAFF STATS
  ========================= */

  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsHandled'
  ).catch(
    (error) => {
      console.error(
        'Failed to update staff tracker:',
        error
      );
    }
  );
}


/* =========================
   CLOSE TICKET
========================= */

async function closeTicket(
  interaction,
  reason
) {
  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {
    return interaction.reply({
      content:
        '❌ This does not look like a ticket channel.',
      ephemeral: true,
    });
  }


  const member =
    interaction.member;


  const roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  const isTicketStaff =
    roleIds.some(
      (id) =>
        member.roles.cache.has(id)
    );


  const isOwner =
    member.id ===
    meta.userId;


  const isManager =
    member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    );


  if (
    !isTicketStaff &&
    !isOwner &&
    !isManager
  ) {
    return interaction.reply({
      content:
        '❌ You do not have permission to close this ticket.',
      ephemeral: true,
    });
  }


  /* =========================
     ACKNOWLEDGE
  ========================= */

  await interaction.deferReply();


  const countdown =
    Number(
      config.closeCountdownSeconds ??
      5
    );


  const closeEmbed =
    new EmbedBuilder()
      .setTitle(
        '🔒 Ticket Closing'
      )
      .setDescription(
        `Closed by ${interaction.user}.` +
        (
          reason
            ? `\n**Reason:** ${reason}`
            : ''
        )
      )
      .setColor(
        '#ED4245'
      )
      .setFooter({
        text:
          `This channel will be deleted in ${countdown} seconds.`,
      });


  await interaction.editReply({
    embeds: [
      closeEmbed,
    ],
  });


  /* =========================
     STAFF STATS
  ========================= */

  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsClosed'
  ).catch(
    (error) => {
      console.error(
        'Failed to update staff tracker:',
        error
      );
    }
  );


  /* =========================
     SPECIAL TICKET STATS
  ========================= */

  if (
    meta.categoryId ===
    'partner'
  ) {
    incrementStat(
      interaction.guild,
      interaction.user.id,
      'partnersCompleted'
    ).catch(() => {});
  }

  else if (
    meta.categoryId ===
    'giveaway_sponsor'
  ) {
    incrementStat(
      interaction.guild,
      interaction.user.id,
      'giveawaysSponsored'
    ).catch(() => {});
  }


  /* =========================
     TRANSCRIPT
  ========================= */

  try {
    const attachment =
      await buildTranscript(
        interaction.channel
      );


    /* =========================
       TRANSCRIPT LOG
    ========================= */

    const logChannelId =
      config.transcriptLogChannelId;


    if (
      logChannelId &&
      !logChannelId.startsWith(
        'PUT_'
      )
    ) {
      const logChannel =
        await interaction.guild.channels
          .fetch(logChannelId)
          .catch(() => null);


      if (logChannel) {
        const logEmbed =
          new EmbedBuilder()
            .setTitle(
              'Ticket Closed'
            )
            .addFields(
              {
                name:
                  'Channel',

                value:
                  `#${interaction.channel.name}`,

                inline: true,
              },

              {
                name:
                  'Opened by',

                value:
                  `<@${meta.userId}>`,

                inline: true,
              },

              {
                name:
                  'Closed by',

                value:
                  `${interaction.user}`,

                inline: true,
              },

              {
                name:
                  'Category',

                value:
                  meta.categoryId,

                inline: true,
              }
            )
            .setColor(
              '#ED4245'
            )
            .setTimestamp();


        if (reason) {
          logEmbed.addFields({
            name:
              'Reason',

            value:
              String(reason).slice(
                0,
                1024
              ),
          });
        }


        await logChannel.send({
          embeds: [
            logEmbed,
          ],

          files: [
            attachment,
          ],
        });
      }
    }


    /* =========================
       DM TRANSCRIPT
    ========================= */

    const opener =
      await interaction.guild.members
        .fetch(meta.userId)
        .catch(() => null);


    if (opener) {
      const dmAttachment =
        await buildTranscript(
          interaction.channel
        );


      await opener
        .send({
          content:
            '📄 Here is a transcript of your closed ticket.',

          files: [
            dmAttachment,
          ],
        })
        .catch(() => {});
    }

  } catch (error) {
    console.error(
      'Failed to build/send transcript:',
      error
    );
  }


  /* =========================
     DELETE CHANNEL
  ========================= */

  setTimeout(
    () => {
      interaction.channel
        .delete()
        .catch(() => {});
    },
    Math.max(
      1,
      countdown
    ) * 1000
  );
}


/* =========================
   EXPORTS
========================= */

module.exports = {
  createTicket,
  createApplicationTicket,
  claimTicket,
  closeTicket,
  parseTopic,
  buildTicketControlRow,
  findCategory,
  isServiceTicket,
};
