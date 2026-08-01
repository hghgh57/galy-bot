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

// ... parseTopic, countOpenTicketsForUser, buildTicketControlRow, getTicketRoleIds, createTicket unchanged ...

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
    name: `app-${safeName}`,
    type: ChannelType.GuildText,
    // Reuses the same "ticket|userId|id" topic format as support tickets, so
    // claimTicket()/closeTicket() work on application tickets for free.
    topic: `ticket|${user.id}|${appId}`,
    permissionOverwrites,
  };

  if (config.ticketCategoryId && !config.ticketCategoryId.startsWith('PUT_')) {
    channelOptions.parent = config.ticketCategoryId;
  }

  const channel = await guild.channels.create(channelOptions);

  const embed = buildApplicationEmbed(member, appConfig, answers);
  const decisionRow = buildDecisionRow(user.id, appId);

  const mentions = getTicketRoleIds()
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

// ... claimTicket, closeTicket unchanged ...

module.exports = {
  createTicket,
  createApplicationTicket,
  claimTicket,
  closeTicket,
  parseTopic,
  buildTicketControlRow,
};
