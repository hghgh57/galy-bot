const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config =
  require('../config.json');

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

/* =========================================================
   TOPIC
========================================================= */

function parseTopic(topic) {

  if (
    !topic ||
    !topic.startsWith('ticket|')
  ) {
    return null;
  }

  const parts =
    topic.split('|');

  return {
    userId: parts[1],
    categoryId: parts[2],
  };
}

/* =========================================================
   COUNT OPEN TICKETS
========================================================= */

function countOpenTicketsForUser(
  guild,
  userId
) {

  return guild.channels.cache.filter(
    channel => {

      const meta =
        parseTopic(
          channel.topic
        );

      return (
        meta &&
        meta.userId === userId
      );
    }
  ).size;
}

/* =========================================================
   TICKET CONTROL BUTTONS
========================================================= */

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
        .setDisabled(claimed),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close'
        )
        .setLabel('Close')
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

/* =========================================================
   ROLE CONFIG
========================================================= */

function getTicketRoleIds() {
  return config.ticketRoleIds || [];
}

function getApplicationTicketRoleIds() {
  return (
    config.applicationTicketRoleIds || []
  );
}

function getServiceTicketRoleIds() {

  const ids =
    (
      config.serviceTicketRoleIds ||
      []
    ).filter(
      id =>
        id &&
        !id.startsWith('PUT_')
    );

  return ids.length
    ? ids
    : getTicketRoleIds();
}

/* =========================================================
   CATEGORY TYPES
========================================================= */

function isApplicationTicket(
  categoryId
) {

  return (
    config.applications || []
  ).some(
    app =>
      app.id === categoryId
  );
}

function isServiceTicket(
  categoryId
) {

  return (
    config.serviceCategories || []
  ).some(
    category =>
      category.id === categoryId
  );
}

/* =========================================================
   FIND CATEGORY
========================================================= */

function findCategory(
  categoryId
) {

  return (
    (config.categories || [])
      .find(
        category =>
          category.id === categoryId
      ) ||

    (config.serviceCategories || [])
      .find(
        category =>
          category.id === categoryId
      )
  );
}

/* =========================================================
   ROLE IDS FOR TICKET
========================================================= */

function getRoleIdsForTicket(
  categoryId
) {

  const category =
    findCategory(
      categoryId
    );

  /*
    Category-specific roles first.
  */

  const categoryRoleIds =
    (
      category?.roleIds || []
    ).filter(
      id =>
        id &&
        !id.startsWith('PUT_')
    );

  if (categoryRoleIds.length) {
    return categoryRoleIds;
  }

  /*
    Application roles.
  */

  if (
    isApplicationTicket(
      categoryId
    )
  ) {
    return getApplicationTicketRoleIds();
  }

  /*
    Service ticket roles.
  */

  if (
    isServiceTicket(
      categoryId
    )
  ) {
    return getServiceTicketRoleIds();
  }

  /*
    Normal ticket roles.
  */

  return getTicketRoleIds();
}

/* =========================================================
   CREATE NORMAL / SERVICE TICKET
========================================================= */

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
    findCategory(
      categoryId
    );

  if (!category) {

    return interaction.reply({
      content:
        '❌ Unknown ticket category.',
      ephemeral: true,
    });
  }

  const existing =
    countOpenTicketsForUser(
      guild,
      user.id
    );

  const maxTickets =
    Number(
      config.maxOpenTicketsPerUser || 1
    );

  if (
    existing >= maxTickets
  ) {

    return interaction.reply({
      content:
        `❌ You already have ${existing} open ticket(s). Please close them before opening another one.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  try {

    const permissionOverwrites = [

      {
        id:
          guild.roles.everyone.id,

        deny: [
          PermissionsBitField.Flags
            .ViewChannel,
        ],
      },

      {
        id: user.id,

        allow: [
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .AttachFiles,
        ],
      },

      {
        id:
          interaction.client.user.id,

        allow: [
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .ManageChannels,

          PermissionsBitField.Flags
            .ManageMessages,
        ],
      },
    ];

    /*
      Add ticket/service roles.
    */

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
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .ManageMessages,
        ],
      });
    }

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
        `ticket-${safeName}`,

      type:
        ChannelType.GuildText,

      topic:
        `ticket|${user.id}|${categoryId}`,

      permissionOverwrites,
    };

    /*
      SERVICE TICKETS
    */

    if (
      isServiceTicket(
        categoryId
      )
    ) {

      if (
        config.serviceTicketCategoryId &&
        !config.serviceTicketCategoryId
          .startsWith('PUT_')
      ) {

        channelOptions.parent =
          config.serviceTicketCategoryId;
      }

    } else {

      /*
        NORMAL TICKETS
      */

      if (
        config.ticketCategoryId &&
        !config.ticketCategoryId
          .startsWith('PUT_')
      ) {

        channelOptions.parent =
          config.ticketCategoryId;
      }
    }

    const channel =
      await guild.channels.create(
        channelOptions
      );

    const welcomeEmbed =
      new EmbedBuilder()
        .setTitle(
          `${category.emoji || '🎫'} ${category.label}`
        )
        .setDescription(
          `Hi ${user}, thanks for reaching out!\n\n` +
          `**Category:** ${category.label}\n\n` +
          `Please describe your issue in as much detail as possible. A member of our team will be with you shortly.`
        )
        .setColor(
          config.panel?.color ||
          '#5865F2'
        )
        .setTimestamp();

    /*
      Add application/service answers
      if supplied.
    */

    if (
      Array.isArray(answers) &&
      answers.length
    ) {

      for (
        const answer of answers
      ) {

        let value =
          answer.answer ||
          'No answer';

        if (
          value.length > 1024
        ) {
          value =
            value.slice(0, 1021) +
            '...';
        }

        welcomeEmbed.addFields({
          name:
            String(
              answer.question ||
              'Answer'
            ).slice(0, 256),

          value,
        });
      }
    }

    const mentions =
      getRoleIdsForTicket(
        categoryId
      )
        .filter(
          id =>
            id &&
            !id.startsWith('PUT_')
        )
        .map(
          id =>
            `<@&${id}>`
        )
        .join(' ');

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

  } catch (err) {

    console.error(
      'Failed to create ticket:',
      err
    );

    await interaction.editReply({
      content:
        '❌ Something went wrong creating your ticket. Please check the bot permissions and ticket category configuration.',
    }).catch(() => {});

    return null;
  }
}

/* =========================================================
   CREATE APPLICATION TICKET
========================================================= */

async function createApplicationTicket(
  guild,
  member,
  appId,
  appConfig,
  answers
) {

  const user =
    member.user;

  try {

    const permissionOverwrites = [

      {
        id:
          guild.roles.everyone.id,

        deny: [
          PermissionsBitField.Flags
            .ViewChannel,
        ],
      },

      {
        id: user.id,

        allow: [
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .AttachFiles,
        ],
      },

      {
        id:
          guild.members.me?.id ||
          guild.client.user.id,

        allow: [
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .ManageChannels,

          PermissionsBitField.Flags
            .ManageMessages,
        ],
      },
    ];

    /*
      Application staff roles.
    */

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
          PermissionsBitField.Flags
            .ViewChannel,

          PermissionsBitField.Flags
            .SendMessages,

          PermissionsBitField.Flags
            .ReadMessageHistory,

          PermissionsBitField.Flags
            .ManageMessages,
        ],
      });
    }

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

    /*
      Application ticket category.
    */

    const appCategoryId =
      config.applicationTicketCategoryId &&
      !config.applicationTicketCategoryId
        .startsWith('PUT_')

        ? config.applicationTicketCategoryId

        : config.ticketCategoryId;

    if (
      appCategoryId &&
      !appCategoryId.startsWith('PUT_')
    ) {

      channelOptions.parent =
        appCategoryId;
    }

    const channel =
      await guild.channels.create(
        channelOptions
      );

    /*
      Build application embed.
    */

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

    const mentions =
      getApplicationTicketRoleIds()
        .filter(
          id =>
            id &&
            !id.startsWith('PUT_')
        )
        .map(
          id =>
            `<@&${id}>`
        )
        .join(' ');

    /*
      APPLICATION MESSAGE
    */

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

    /*
      TICKET CONTROLS
    */

    await channel.send({
      components: [
        buildTicketControlRow(),
      ],
    });

    return channel;

  } catch (err) {

    console.error(
      'Failed to create application ticket:',
      err
    );

    return null;
  }
}

/* =========================================================
   CLAIM TICKET
========================================================= */

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
      id =>
        member.roles.cache.has(id)
    );

  if (
    !isTicketStaff &&
    !member.permissions.has(
      PermissionsBitField.Flags
        .ManageChannels
    )
  ) {

    return interaction.reply({
      content:
        '❌ Only ticket staff can claim tickets.',
      ephemeral: true,
    });
  }

  const embed =
    new EmbedBuilder()
      .setDescription(
        `🙋 This ticket has been claimed by ${interaction.user}.`
      )
      .setColor('#57F287');

  await interaction.reply({
    embeds: [embed],
  });

  const disabledRow =
    buildTicketControlRow(true);

  await interaction.message
    .edit({
      components: [
        disabledRow,
      ],
    })
    .catch(() => {});

  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsHandled'
  ).catch(err => {

    console.error(
      'Failed to update staff tracker:',
      err
    );
  });
}

/* =========================================================
   CLOSE TICKET
========================================================= */

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
      id =>
        member.roles.cache.has(id)
    );

  const isOwner =
    member.id === meta.userId;

  if (
    !isTicketStaff &&
    !isOwner &&
    !member.permissions.has(
      PermissionsBitField.Flags
        .ManageChannels
    )
  ) {

    return interaction.reply({
      content:
        '❌ You do not have permission to close this ticket.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  const countdown =
    Number(
      config.closeCountdownSeconds || 5
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
      .setColor('#ED4245')
      .setFooter({
        text:
          `This channel will be deleted in ${countdown} seconds.`,
      });

  await interaction.editReply({
    embeds: [
      closeEmbed,
    ],
  });

  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsClosed'
  ).catch(err => {

    console.error(
      'Failed to update staff tracker:',
      err
    );
  });

  /*
    Special staff statistics.
  */

  if (
    meta.categoryId ===
    'partner'
  ) {

    incrementStat(
      interaction.guild,
      interaction.user.id,
      'partnersCompleted'
    ).catch(() => {});

  } else if (
    meta.categoryId ===
    'giveaway_sponsor'
  ) {

    incrementStat(
      interaction.guild,
      interaction.user.id,
      'giveawaysSponsored'
    ).catch(() => {});
  }

  /*
    TRANSCRIPT
  */

  try {

    const attachment =
      await buildTranscript(
        interaction.channel
      );

    const logChannelId =
      config.transcriptLogChannelId;

    if (
      logChannelId &&
      !logChannelId.startsWith('PUT_')
    ) {

      const logChannel =
        await interaction.guild.channels
          .fetch(
            logChannelId
          )
          .catch(() => null);

      if (logChannel) {

        const logEmbed =
          new EmbedBuilder()
            .setTitle(
              'Ticket Closed'
            )
            .addFields(

              {
                name: 'Channel',
                value:
                  `#${interaction.channel.name}`,
                inline: true,
              },

              {
                name: 'Opened by',
                value:
                  `<@${meta.userId}>`,
                inline: true,
              },

              {
                name: 'Closed by',
                value:
                  `${interaction.user}`,
                inline: true,
              },

              {
                name: 'Category',
                value:
                  meta.categoryId,
                inline: true,
              }

            )
            .setColor('#ED4245')
            .setTimestamp();

        if (reason) {

          logEmbed.addFields({
            name: 'Reason',
            value:
              reason.slice(0, 1024),
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

    /*
      DM transcript to ticket owner.
    */

    const opener =
      await interaction.guild.members
        .fetch(meta.userId)
        .catch(() => null);

    if (opener) {

      const dmAttachment =
        await buildTranscript(
          interaction.channel
        );

      await opener.user
        .send({
          content:
            '📄 Here is a transcript of your closed ticket.',

          files: [
            dmAttachment,
          ],
        })
        .catch(() => {});
    }

  } catch (err) {

    console.error(
      'Failed to build/send transcript:',
      err
    );
  }

  /*
    DELETE CHANNEL
  */

  setTimeout(() => {

    interaction.channel
      .delete()
      .catch(() => {});

  }, countdown * 1000);
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  createTicket,

  createApplicationTicket,

  claimTicket,

  closeTicket,

  parseTopic,

  buildTicketControlRow,

  findCategory,

  isServiceTicket,

  getRoleIdsForTicket,
};
