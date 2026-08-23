const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config.json');
const { buildTranscript } = require('./transcript');
const {
  buildApplicationEmbed,
  buildDecisionRow,
} = require('./applicationManager');
const { incrementStat } = require('./staffTracker');


/* =========================================================
   TICKET METADATA
========================================================= */

function parseTopic(topic) {
  if (!topic || !topic.startsWith('ticket|')) return null;

  const [, userId, categoryId] = topic.split('|');

  if (!userId || !categoryId) return null;

  return {
    userId,
    categoryId,
  };
}


function countOpenTicketsForUser(guild, userId) {
  return guild.channels.cache.filter((channel) => {
    const meta = parseTopic(channel.topic);

    return meta && meta.userId === userId;
  }).size;
}


/* =========================================================
   TICKET BUTTONS
========================================================= */

function buildTicketControlRow(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed),

    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('ticket_close_reason')
      .setLabel('Close with Reason')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
  );
}


/* =========================================================
   ROLE HELPERS
========================================================= */

function getTicketRoleIds() {
  return (config.ticketRoleIds || []).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getApplicationTicketRoleIds() {
  return (config.applicationTicketRoleIds || []).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getServiceTicketRoleIds() {
  const ids = (config.serviceTicketRoleIds || []).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );

  return ids.length
    ? ids
    : getTicketRoleIds();
}


/* =========================================================
   CATEGORY HELPERS
========================================================= */

function isApplicationTicket(categoryId) {
  return (config.applications || []).some(
    (application) =>
      application.id === categoryId
  );
}


function isServiceTicket(categoryId) {
  return (config.serviceCategories || []).some(
    (category) =>
      category.id === categoryId
  );
}


function findCategory(categoryId) {
  return (
    (config.categories || []).find(
      (category) =>
        category.id === categoryId
    )

    ||

    (config.serviceCategories || []).find(
      (category) =>
        category.id === categoryId
    )
  );
}


function getRoleIdsForTicket(categoryId) {
  const category = findCategory(categoryId);

  const categoryRoleIds = (
    category?.roleIds || []
  ).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );

  /*
    Service categories can have their own roles.
    Example:
    building_service -> builder role
    digging_service -> digging role
    regears_service -> regear role
  */

  if (categoryRoleIds.length) {
    return categoryRoleIds;
  }


  if (isApplicationTicket(categoryId)) {
    return getApplicationTicketRoleIds();
  }


  if (isServiceTicket(categoryId)) {
    return getServiceTicketRoleIds();
  }


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
  const { guild, user } = interaction;

  if (!guild) {
    return interaction.reply({
      content: '❌ Tickets can only be created inside the server.',
      ephemeral: true,
    });
  }


  const category = findCategory(categoryId);

  if (!category) {
    return interaction.reply({
      content: '❌ Unknown ticket category.',
      ephemeral: true,
    });
  }


  const existing = countOpenTicketsForUser(
    guild,
    user.id
  );


  if (
    existing >=
    (config.maxOpenTicketsPerUser || 2)
  ) {
    return interaction.reply({
      content:
        `You already have ${existing} open ticket(s). ` +
        'Please close one before opening another.',
      ephemeral: true,
    });
  }


  await interaction.deferReply({
    ephemeral: true,
  });


  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },

    {
      id: user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    },
  ];


  /*
    Give the bot explicit access.

    Use client.user.id instead of guild.members.me.id
    because guild.members.me can occasionally be null/not
    cached when the bot is starting.
  */

  if (interaction.client.user) {
    permissionOverwrites.push({
      id: interaction.client.user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }


  const staffRoleIds =
    getRoleIdsForTicket(categoryId);


  for (const roleId of staffRoleIds) {
    permissionOverwrites.push({
      id: roleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }


  const safeName =
    user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20)
    ||
    'user';


  const channelOptions = {
    name: `ticket-${safeName}`,

    type: ChannelType.GuildText,

    topic:
      `ticket|${user.id}|${categoryId}`,

    permissionOverwrites,
  };


  /*
    SERVICE TICKETS

    building_service
    digging_service
    regears_service

    all go into:
    config.serviceTicketCategoryId
  */

  if (isServiceTicket(categoryId)) {
    const parentId =
      config.serviceTicketCategoryId;

    if (
      parentId &&
      typeof parentId === 'string' &&
      !parentId.startsWith('PUT_')
    ) {
      channelOptions.parent = parentId;
    }
  }


  /*
    NORMAL SUPPORT TICKETS
  */

  else {
    const parentId =
      config.ticketCategoryId;

    if (
      parentId &&
      typeof parentId === 'string' &&
      !parentId.startsWith('PUT_')
    ) {
      channelOptions.parent = parentId;
    }
  }


  try {
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

          'Please provide as much detail as possible. ' +
          'A member of our team will be with you shortly.'
        )
        .setColor(
          config.panel?.color ||
          '#5865F2'
        )
        .setTimestamp();


    if (answers.length) {
      welcomeEmbed.addFields(
        answers.map((answer) => ({
          name:
            String(
              answer.question
            ).slice(0, 256),

          value:
            String(
              answer.answer ||
              'No answer'
            ).slice(0, 1024),
        }))
      );
    }


    const mentions =
      staffRoleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
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
  }


  catch (err) {
    console.error(
      'Failed to create ticket:',
      err
    );


    await interaction
      .editReply({
        content:
          '❌ Something went wrong creating your ticket. ' +
          'Please contact staff.',
      })
      .catch(() => {});


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
  try {
    if (!guild) {
      throw new Error(
        'Missing guild when creating application ticket.'
      );
    }


    if (!member) {
      throw new Error(
        'Missing member when creating application ticket.'
      );
    }


    if (!member.user) {
      throw new Error(
        'Missing member user when creating application ticket.'
      );
    }


    if (!appConfig) {
      throw new Error(
        'Missing application configuration.'
      );
    }


    const user =
      member.user;


    /*
      Applications are staff-only tickets.

      The applicant can see the channel so they can
      see that their application exists.

      Application staff roles can access it too.
    */

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
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
    ];


    /*
      Explicit bot permissions.

      This fixes the problem where the channel could
      be created but the bot failed when trying to
      send the application embed.
    */

    const botId =
      guild.members.me?.id ||
      guild.client.user?.id;


    if (!botId) {
      throw new Error(
        'Could not determine bot user ID.'
      );
    }


    permissionOverwrites.push({
      id: botId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });


    const applicationRoleIds =
      getApplicationTicketRoleIds();


    /*
      Add configured application staff roles.
    */

    for (
      const roleId
      of applicationRoleIds
    ) {
      permissionOverwrites.push({
        id: roleId,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      });
    }


    /*
      Also allow the general support/admin roles.

      This prevents your application channel from
      being inaccessible if applicationTicketRoleIds
      was changed or the application staff role does
      not have the required channel access.
    */

    const extraRoleIds = [
      ...(config.supportRoleIds || []),
      ...(config.adminRoleIds || []),
    ].filter(
      (roleId) =>
        roleId &&
        typeof roleId === 'string' &&
        !roleId.startsWith('PUT_') &&
        !applicationRoleIds.includes(roleId)
    );


    for (
      const roleId
      of extraRoleIds
    ) {
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


    const safeName =
      user.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20)
      ||
      'user';


    const channelOptions = {
      name:
        `app-${safeName}`,

      type:
        ChannelType.GuildText,

      topic:
        `ticket|${user.id}|application_${appId}`,

      permissionOverwrites,
    };


    /*
      APPLICATION CATEGORY PRIORITY

      1. reviewChannelId if it is actually a category
      2. applicationTicketCategoryId
      3. ticketCategoryId

      Your config currently has:
      applicationTicketCategoryId:
      1533068861174452255

      so the application will go there.
    */

    const parentId =
      config.applicationTicketCategoryId;


    if (
      parentId &&
      typeof parentId === 'string' &&
      !parentId.startsWith('PUT_')
    ) {
      channelOptions.parent =
        parentId;
    }


    console.log(
      '[APPLICATION] Creating application ticket:',
      {
        userId: user.id,
        appId,
        parentId:
          channelOptions.parent ||
          'none',
        roles:
          applicationRoleIds,
      }
    );


    const channel =
      await guild.channels.create(
        channelOptions
      );


    /*
      Build the application embed.

      buildApplicationEmbed can throw if Discord
      rejects one of the fields, so keep everything
      inside this try block.
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
      applicationRoleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(' ');


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


    await channel.send({
      components: [
        buildTicketControlRow(),
      ],
    });


    console.log(
      `[APPLICATION] Successfully created application ticket ${channel.id}`
    );


    return channel;
  }


  catch (err) {
    console.error(
      '[APPLICATION] Failed to create application ticket:',
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
        'This does not look like a ticket channel.',

      ephemeral:
        true,
    });
  }


  const member =
    interaction.member;


  let roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  /*
    Application ticket topics use:
    application_staff
    application_pm

    Fall back to application roles.
  */

  if (
    meta.categoryId.startsWith(
      'application_'
    )
  ) {
    roleIds =
      getApplicationTicketRoleIds();
  }


  const isTicketStaff =
    roleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId
        )
    );


  if (
    !isTicketStaff &&
    !member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    return interaction.reply({
      content:
        'Only ticket staff can claim tickets.',

      ephemeral:
        true,
    });
  }


  const embed =
    new EmbedBuilder()
      .setDescription(
        `🙋 This ticket has been claimed by ${interaction.user}.`
      )
      .setColor(
        '#57F287'
      );


  await interaction.reply({
    embeds: [
      embed,
    ],
  });


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


  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsHandled'
  ).catch((err) => {
    console.error(
      'Failed to update staff tracker for ticket claim:',
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
        'This does not look like a ticket channel.',

      ephemeral:
        true,
    });
  }


  const member =
    interaction.member;


  let roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  if (
    meta.categoryId.startsWith(
      'application_'
    )
  ) {
    roleIds =
      getApplicationTicketRoleIds();
  }


  const isTicketStaff =
    roleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId
        )
    );


  const isOwner =
    member.id ===
    meta.userId;


  if (
    !isTicketStaff &&
    !isOwner &&
    !member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    return interaction.reply({
      content:
        'You do not have permission to close this ticket.',

      ephemeral:
        true,
    });
  }


  await interaction.deferReply();


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
          `This channel will be deleted in ${
            config.closeCountdownSeconds || 5
          } seconds.`,
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
  ).catch((err) => {
    console.error(
      'Failed to update staff tracker for ticket close:',
      err
    );
  });


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


  try {
    const attachment =
      await buildTranscript(
        interaction.channel
      );


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
          .fetch(
            logChannelId
          )
          .catch(
            () => null
          );


      if (
        logChannel &&
        logChannel.isTextBased()
      ) {
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

                inline:
                  true,
              },

              {
                name:
                  'Opened by',

                value:
                  `<@${meta.userId}>`,

                inline:
                  true,
              },

              {
                name:
                  'Closed by',

                value:
                  `${interaction.user}`,

                inline:
                  true,
              },

              {
                name:
                  'Category',

                value:
                  meta.categoryId,

                inline:
                  true,
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
              reason.slice(
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


    /*
      DM THE TRANSCRIPT TO THE USER
    */

    const opener =
      await interaction.guild.members
        .fetch(
          meta.userId
        )
        .catch(
          () => null
        );


    if (opener) {
      const dmAttachment =
        await buildTranscript(
          interaction.channel
        );


      await opener.send({
        content:
          'Here is a transcript of your closed ticket.',

        files: [
          dmAttachment,
        ],
      }).catch(() => {});
    }
  }


  catch (err) {
    console.error(
      'Failed to build/send transcript:',
      err
    );
  }


  setTimeout(() => {
    interaction.channel
      .delete()
      .catch(() => {});
  },
  (config.closeCountdownSeconds || 5) * 1000
  );
}


/* =========================================================
   EXPORTS
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
};
