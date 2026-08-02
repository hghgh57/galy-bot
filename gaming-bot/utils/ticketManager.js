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

function isApplicationTicket(categoryId) {
  return (config.applications || []).some((a) => a.id === categoryId);
}

async function createTicket(interaction, categoryId) {
  const { guild, user } = interaction;
  const category = config.categories.find((c) => c.id === categoryId);
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
  ];

  for (const roleId of getTicketRoleIds()) {
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

  if (config.ticketCategoryId && !config.ticketCategoryId.startsWith('PUT_')) {
    channelOptions.parent = config.ticketCategoryId;
  }

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

  const mentions = getTicketRoleIds()
    .filter((id) => id && !id.startsWith('PUT_'))
    .map((id) => `<@&${id}>`)
    .join(' ');

  await channel.send({
    content: `${user} ${mentions}`.trim(),
    embeds: [welcomeEmbed],
    components: [buildTicketControlRow()],
  });

  await interaction.editReply({ content: `Your ticket has been created: ${channel}` });
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
  const roleIds = isApplicationTicket(meta.categoryId) ? getApplicationTicketRoleIds() : getTicketRoleIds();
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
}

async function closeTicket(interaction, reason) {
  const meta = parseTopic(interaction.channel.topic);
  if (!meta) {
    return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
  }

  const member = interaction.member;
  const roleIds = isApplicationTicket(meta.categoryId) ? getApplicationTicketRoleIds() : getTicketRoleIds();
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
};
