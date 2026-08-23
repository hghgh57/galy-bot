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
const { buildApplicationEmbed, buildDecisionRow } = require('./applicationManager');
const { incrementStat } = require('./staffTracker');

function parseTopic(topic) {
  if (!topic || !topic.startsWith('ticket|')) return null;
  const [, userId, categoryId] = topic.split('|');
  return { userId, categoryId };
}

function countOpenTicketsForUser(guild, userId) {
  return guild.channels.cache.filter((c) => {
    const meta = parseTopic(c.topic);
    return meta && meta.userId === userId;
  }).size;
}

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

function getTicketRoleIds() {
  return config.ticketRoleIds || [];
}

function getApplicationTicketRoleIds() {
  return config.applicationTicketRoleIds || [];
}

function getServiceTicketRoleIds() {
  const ids = (config.serviceTicketRoleIds || []).filter((id) => id && !id.startsWith('PUT_'));
  return ids.length ? ids : getTicketRoleIds();
}

function isApplicationTicket(categoryId) {
  return (config.applications || []).some((a) => a.id === categoryId);
}

function isServiceTicket(categoryId) {
  return (config.serviceCategories || []).some((c) => c.id === categoryId);
}

// Support tickets and service tickets both use "regular" categories, just
// from two separate config lists — this looks across both so createTicket
// doesn't need to know which panel a category came from.
function findCategory(categoryId) {
  return (
    (config.categories || []).find((c) => c.id === categoryId) ||
    (config.serviceCategories || []).find((c) => c.id === categoryId)
  );
}

function getRoleIdsForTicket(categoryId) {
  // Per-category override takes priority — lets each ticket category ping
  // its own specific role(s) instead of sharing one group-wide list.
  const category = findCategory(categoryId);
  const categoryRoleIds = (category?.roleIds || []).filter((id) => id && !id.startsWith('PUT_'));
  if (categoryRoleIds.length) return categoryRoleIds;

  if (isApplicationTicket(categoryId)) return getApplicationTicketRoleIds();
  if (isServiceTicket(categoryId)) return getServiceTicketRoleIds();
  return getTicketRoleIds();
}

async function createTicket(interaction, categoryId, answers = []) {
  const { guild, user } = interaction;
  const category = findCategory(categoryId);
  if (!category) {
    return interaction.reply({ content: 'Unknown ticket category.', ephemeral: true });
  }

  const existing = countOpenTicketsForUser(guild, user.id);
  if (existing >= config.maxOpenTicketsPerUser) {
    return interaction.reply({
      content: `You already have ${existing} open ticket(s). Please close them before opening a new one.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    // Explicitly grant the bot itself access — without this, the bot only
    // gets into the channel it just created via its base server-wide
    // permissions, which can silently fail (channel.send throwing Missing
    // Permissions) if the bot's role isn't broadly permissioned.
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  for (const roleId of getRoleIdsForTicket(categoryId)) {
    if (!roleId || roleId.startsWith('PUT_')) continue;
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

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

  const channelOptions = {
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    topic: `ticket|${user.id}|${categoryId}`,
    permissionOverwrites,
  };

  if (isServiceTicket(categoryId)) {
    if (config.serviceTicketCategoryId && !config.serviceTicketCategoryId.startsWith('PUT_')) {
      channelOptions.parent = config.serviceTicketCategoryId;
    }
  } else if (config.ticketCategoryId && !config.ticketCategoryId.startsWith('PUT_')) {
    channelOptions.parent = config.ticketCategoryId;
  }

  // Everything below can fail for reasons outside our control (missing
  // permissions, invalid parent category, rate limits) — without a
  // try/catch here, a throw leaves the interaction stuck on "thinking"
  // forever with no reply and no error visible to the user.
  try {
    const channel = await guild.channels.create(channelOptions);

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${category.emoji || '🎫'} ${category.label}`)
      .setDescription(
        `Hi ${user}, thanks for reaching out!\n\n` +
          `**Category:** ${category.label}\n` +
          `Please describe your issue in as much detail as possible. A member of our team will be with you shortly.`
      )
      .setColor(config.panel.color || '#5865F2')
      .setTimestamp();

    if (answers.length) {
      welcomeEmbed.addFields(answers.map((a) => ({ name: a.question, value: a.answer || 'No answer' })));
    }

    const mentions = getRoleIdsForTicket(categoryId)
      .filter((id) => id && !id.startsWith('PUT_'))
      .map((id) => `<@&${id}>`)
      .join(' ');

    await channel.send({
      content: `${user} ${mentions}`.trim(),
      embeds: [welcomeEmbed],
      components: [buildTicketControlRow()],
    });

    await interaction.editReply({ content: `Your ticket has been created: ${channel}` });
  } catch (err) {
    console.error('Failed to create ticket:', err);
    await interaction
      .editReply({ content: '❌ Something went wrong creating your ticket. Please try again or contact staff.' })
      .catch(() => {});
  }
}

async function createApplicationTicket(guild, member, appId, appConfig, answers) {
  const user = member.user;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    // Same reasoning as createTicket above — explicitly grant the bot
    // itself access so posting into the channel it just made can't fail
    // silently due to relying on base server-wide permissions alone.
    {
      id: guild.members.me.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  for (const roleId of getApplicationTicketRoleIds()) {
    if (!roleId || roleId.startsWith('PUT_')) continue;
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

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

  const channelOptions = {
    name: `app-${safeName}`,
    type: ChannelType.GuildText,
    // Reuses the same "ticket|userId|id" topic format as support tickets, so
    // claimTicket()/closeTicket() work on application tickets for free.
    topic: `ticket|${user.id}|${appId}`,
    permissionOverwrites,
  };

  const appCategoryId =
    config.applicationTicketCategoryId && !config.applicationTicketCategoryId.startsWith('PUT_')
      ? config.applicationTicketCategoryId
      : config.ticketCategoryId;

  if (appCategoryId && !appCategoryId.startsWith('PUT_')) {
    channelOptions.parent = appCategoryId;
  }

  const channel = await guild.channels.create(channelOptions);

  const embed = buildApplicationEmbed(member, appConfig, answers);
  const decisionRow = buildDecisionRow(user.id, appId);

  const mentions = getApplicationTicketRoleIds()
    .filter((id) => id && !id.startsWith('PUT_'))
    .map((id) => `<@&${id}>`)
    .join(' ');

  await channel.send({
    content: `${user} ${mentions}`.trim(),
    embeds: [embed],
    components: [decisionRow],
  });

  await channel.send({ components: [buildTicketControlRow()] });

  return channel;
}

async function claimTicket(interaction) {
  const meta = parseTopic(interaction.channel.topic);
  if (!meta) {
    return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
  }

  const member = interaction.member;
  const roleIds = getRoleIdsForTicket(meta.categoryId);
  const isTicketStaff = roleIds.some((id) => member.roles.cache.has(id));
  if (!isTicketStaff && !member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'Only ticket staff can claim tickets.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setDescription(`🙋 This ticket has been claimed by ${interaction.user}.`)
    .setColor('#57F287');

  await interaction.reply({ embeds: [embed] });

  const disabledRow = buildTicketControlRow(true);
  await interaction.message.edit({ components: [disabledRow] }).catch(() => {});

  incrementStat(interaction.guild, interaction.user.id, 'ticketsHandled').catch((err) => {
    console.error('Failed to update staff tracker for ticket claim:', err);
  });
}

async function closeTicket(interaction, reason) {
  const meta = parseTopic(interaction.channel.topic);
  if (!meta) {
    return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
  }

  const member = interaction.member;
  const roleIds = getRoleIdsForTicket(meta.categoryId);
  const isTicketStaff = roleIds.some((id) => member.roles.cache.has(id));
  const isOwner = member.id === meta.userId;
  if (!isTicketStaff && !isOwner && !member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
  }

  await interaction.deferReply();

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Closing')
    .setDescription(
      `Closed by ${interaction.user}.` + (reason ? `\n**Reason:** ${reason}` : '')
    )
    .setColor('#ED4245')
    .setFooter({ text: `This channel will be deleted in ${config.closeCountdownSeconds} seconds.` });

  await interaction.editReply({ embeds: [closeEmbed] });

  incrementStat(interaction.guild, interaction.user.id, 'ticketsClosed').catch((err) => {
    console.error('Failed to update staff tracker for ticket close:', err);
  });

  // Closing a "partner" or "giveaway_sponsor" category ticket also counts
  // as completing that specific type of work, on top of the general
  // ticketsClosed count.
  if (meta.categoryId === 'partner') {
    incrementStat(interaction.guild, interaction.user.id, 'partnersCompleted').catch((err) => {
      console.error('Failed to update staff tracker for partner completion:', err);
    });
  } else if (meta.categoryId === 'giveaway_sponsor') {
    incrementStat(interaction.guild, interaction.user.id, 'giveawaysSponsored').catch((err) => {
      console.error('Failed to update staff tracker for giveaway sponsorship:', err);
    });
  }

  try {
    const attachment = await buildTranscript(interaction.channel);
    const logChannelId = config.transcriptLogChannelId;

    if (logChannelId && !logChannelId.startsWith('PUT_')) {
      const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('Ticket Closed')
          .addFields(
            { name: 'Channel', value: `#${interaction.channel.name}`, inline: true },
            { name: 'Opened by', value: `<@${meta.userId}>`, inline: true },
            { name: 'Closed by', value: `${interaction.user}`, inline: true },
            { name: 'Category', value: meta.categoryId, inline: true }
          )
          .setColor('#ED4245')
          .setTimestamp();

        if (reason) logEmbed.addFields({ name: 'Reason', value: reason });

        await logChannel.send({ embeds: [logEmbed], files: [attachment] });
      }
    }

    const opener = await interaction.guild.members.fetch(meta.userId).catch(() => null);
    if (opener) {
      const dmAttachment = await buildTranscript(interaction.channel);
      await opener.send({ content: 'Here is a transcript of your closed ticket.', files: [dmAttachment] }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to build/send transcript:', err);
  }

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, config.closeCountdownSeconds * 1000);
}

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
