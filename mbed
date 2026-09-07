const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const config = require("./config");

const giveaways = new Map();

function parseDuration(input) {
  const match = input
    .toLowerCase()
    .trim()
    .match(/^(\d+)\s*(s|m|h|d|w)$/);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function createGiveawayEmbed(giveaway) {
  const hasWinners = giveaway.winners.length > 0;
  const endTimestamp = Math.floor(giveaway.endTime / 1000);

  const lines = [
    hasWinners
      ? "🎉 This giveaway has ended!"
      : "Click the button below to enter!",
    "",
    `**Winners:** ${giveaway.winnerCount}`,
    `**Hosted by:** ${giveaway.host}`,
    `**Ends:** <t:${endTimestamp}:R>`,
    "",
    `<t:${endTimestamp}:F>`
  ];

  if (hasWinners) {
    lines.push(
      "",
      `**Winner(s):** ${giveaway.winners.map(id => `<@${id}>`).join(" ")}`
    );
  }

  return new EmbedBuilder()
    .setColor(0x0000ff)
    .setTitle(`${giveaway.prize}`)
    .setDescription(lines.join("\n"));
}

function createJoinButton(giveaway, disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway_join_${giveaway.id}`)
    .setLabel(`🎉 Join Giveaway (${giveaway.entries.size})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder().addComponents(button);
}

function createLeaveButton(giveaway) {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway_leave_${giveaway.id}`)
    .setLabel("Leave Giveaway")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(button);
}

async function startGiveaway({
  interaction,
  prize,
  winners,
  duration
}) {
  const durationMs = parseDuration(duration);

  if (!durationMs) {
    return {
      success: false,
      error:
        "Invalid duration. Use `10m`, `1h`, `7d` or `1w`."
    };
  }

  if (durationMs < 10000) {
    return {
      success: false,
      error:
        "The giveaway must last at least 10 seconds."
    };
  }

  if (
    durationMs >
    30 * 24 * 60 * 60 * 1000
  ) {
    return {
      success: false,
      error:
        "The giveaway cannot last longer than 30 days."
    };
  }

  const giveawayId =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const giveaway = {
    id: giveawayId,

    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    messageId: null,

    prize,
    winnerCount: winners,

    hostId: interaction.user.id,
    host: `<@${interaction.user.id}>`,

    endTime: Date.now() + durationMs,

    entries: new Set(),
    winners: [],
    claimed: new Set()
  };

  const giveawayMessage =
    await interaction.channel.send({
      embeds: [
        createGiveawayEmbed(giveaway)
      ],
      components: [
        createJoinButton(giveaway)
      ]
    });

  giveaway.messageId =
    giveawayMessage.id;

  giveaways.set(
    giveawayId,
    giveaway
  );

  setTimeout(() => {
    endGiveaway(
      interaction.client,
      giveawayId
    ).catch(console.error);
  }, durationMs);

  // DM the host their giveaway ID (needed for /greroll later).
  try {
    await interaction.user.send({
      content:
        `🎉 Your giveaway for **${prize}** has started in **${interaction.guild.name}**!\n` +
        `**Giveaway ID:** \`${giveawayId}\`\n` +
        `Keep this ID — you'll need it to run \`/greroll giveawayid:${giveawayId}\` if you ever need to reroll a winner.`
    });
  } catch (error) {
    console.error(
      "Could not DM giveaway host (DMs may be closed):",
      error
    );
  }

  return {
    success: true,
    giveawayId
  };
}

async function joinGiveaway(
  interaction,
  giveawayId
) {
  const giveaway =
    giveaways.get(giveawayId);

  if (!giveaway) {
    return interaction.reply({
      content:
        "❌ This giveaway no longer exists.",
      ephemeral: true
    });
  }

  if (
    Date.now() >=
    giveaway.endTime
  ) {
    return interaction.reply({
      content:
        "❌ This giveaway has already ended.",
      ephemeral: true
    });
  }

  if (
    giveaway.entries.has(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        "You already joined the giveaway",
      components: [
        createLeaveButton(giveaway)
      ],
      ephemeral: true
    });
  }

  giveaway.entries.add(
    interaction.user.id
  );

  try {
    const channel =
      interaction.client.channels.cache.get(
        giveaway.channelId
      );

    if (channel) {
      const message =
        await channel.messages.fetch(
          giveaway.messageId
        );

      await message.edit({
        embeds: [
          createGiveawayEmbed(
            giveaway
          )
        ],
        components: [
          createJoinButton(giveaway)
        ]
      });
    }
  } catch (error) {
    console.error(
      "Giveaway update error:",
      error
    );
  }

  await interaction.reply({
    content:
      "You joined the giveaway",
    components: [
      createLeaveButton(giveaway)
    ],
    ephemeral: true
  });
}

async function leaveGiveaway(
  interaction,
  giveawayId
) {
  const giveaway =
    giveaways.get(giveawayId);

  if (!giveaway) {
    await interaction.reply({
      content:
        "❌ This giveaway no longer exists.",
      ephemeral: true
    });
    return { success: false };
  }

  if (
    Date.now() >=
    giveaway.endTime
  ) {
    await interaction.reply({
      content:
        "❌ This giveaway has already ended.",
      ephemeral: true
    });
    return { success: false };
  }

  if (
    !giveaway.entries.has(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "❌ You are not entered in this giveaway.",
      ephemeral: true
    });
    return { success: false };
  }

  giveaway.entries.delete(
    interaction.user.id
  );

  try {
    const channel =
      interaction.client.channels.cache.get(
        giveaway.channelId
      );

    if (channel) {
      const message =
        await channel.messages.fetch(
          giveaway.messageId
        );

      await message.edit({
        embeds: [
          createGiveawayEmbed(
            giveaway
          )
        ],
        components: [
          createJoinButton(giveaway)
        ]
      });
    }
  } catch (error) {
    console.error(
      "Giveaway update error:",
      error
    );
  }

  await interaction.reply({
    content:
      "You left the giveaway",
    components: [
      createJoinButton(giveaway)
    ],
    ephemeral: true
  });

  return { success: true };
}

async function endGiveaway(
  client,
  giveawayId
) {
  const giveaway =
    giveaways.get(giveawayId);

  if (!giveaway) return;

  if (
    giveaway.winners.length > 0
  ) {
    return;
  }

  const entries = [
    ...giveaway.entries
  ];

  const winners = [];

  while (
    winners.length <
      giveaway.winnerCount &&
    entries.length > 0
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
          entries.length
      );

    winners.push(
      entries.splice(
        randomIndex,
        1
      )[0]
    );
  }

  giveaway.winners = winners;

  const channel =
    client.channels.cache.get(
      giveaway.channelId
    );

  if (!channel) return;

  let winnerText;

  if (winners.length === 0) {
    winnerText =
      `🎉 **${giveaway.prize}**\n\n` +
      "❌ **No one entered this giveaway.**";
  } else {
    const winnerMentions =
      winners
        .map(id => `<@${id}>`)
        .join(" ");

    winnerText =
      `🎉 ${winnerMentions} **you won ${giveaway.prize}!**`;
  }

  const claimButton =
    new ButtonBuilder()
      .setCustomId(
        `giveaway_claim_${giveaway.id}`
      )
      .setLabel(
        "Claim Now"
      )
      .setStyle(
        ButtonStyle.Success
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        claimButton
      );

  await channel.send({
    content: winnerText,
    components: [row]
  });

  // Keep the original giveaway message up (with the final embed and a
  // disabled join button) instead of stripping its components away.
  try {
    const originalMessage =
      await channel.messages.fetch(
        giveaway.messageId
      );

    await originalMessage.edit({
      embeds: [
        createGiveawayEmbed(giveaway)
      ],
      components: [
        createJoinButton(giveaway, true)
      ]
    });
  } catch (error) {
    console.error(
      "Could not update the giveaway message after it ended:",
      error
    );
  }
}

async function rerollGiveaway(
  interaction,
  giveawayId
) {
  const giveaway =
    giveaways.get(giveawayId);

  if (!giveaway) {
    return interaction.reply({
      content:
        "❌ This giveaway no longer exists.",
      ephemeral: true
    });
  }

  if (giveaway.winners.length === 0) {
    return interaction.reply({
      content:
        "❌ This giveaway hasn't ended yet, so there's nothing to reroll.",
      ephemeral: true
    });
  }

  const entries = [
    ...giveaway.entries
  ];

  if (entries.length === 0) {
    return interaction.reply({
      content:
        "❌ There are no entries to pick a new winner from.",
      ephemeral: true
    });
  }

  const winnerCount = Math.min(
    giveaway.winnerCount,
    entries.length
  );

  const newWinners = [];

  while (
    newWinners.length < winnerCount &&
    entries.length > 0
  ) {
    const randomIndex =
      Math.floor(
        Math.random() * entries.length
      );

    newWinners.push(
      entries.splice(randomIndex, 1)[0]
    );
  }

  giveaway.winners = newWinners;
  giveaway.claimed = new Set();

  const winnerMentions =
    newWinners
      .map(id => `<@${id}>`)
      .join(" ");

  const channel =
    interaction.client.channels.cache.get(
      giveaway.channelId
    );

  if (channel) {
    const claimButton =
      new ButtonBuilder()
        .setCustomId(
          `giveaway_claim_${giveaway.id}`
        )
        .setLabel("Claim Now")
        .setStyle(ButtonStyle.Success);

    const row =
      new ActionRowBuilder().addComponents(
        claimButton
      );

    await channel.send({
      content:
        `🎉 New winner(s) for **${giveaway.prize}**: ${winnerMentions}!`,
      components: [row]
    });

    try {
      const originalMessage =
        await channel.messages.fetch(
          giveaway.messageId
        );

      await originalMessage.edit({
        embeds: [
          createGiveawayEmbed(giveaway)
        ],
        components: [
          createJoinButton(giveaway, true)
        ]
      });
    } catch (error) {
      console.error(
        "Could not update the giveaway message after reroll:",
        error
      );
    }
  }

  return interaction.reply({
    content: `✅ Rerolled! New winner(s): ${winnerMentions}`,
    ephemeral: true
  });
}

async function claimGiveaway(
  interaction,
  giveawayId
) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const giveaway =
    giveaways.get(giveawayId);

  if (!giveaway) {
    return interaction.editReply({
      content:
        "❌ This giveaway no longer exists.",
      ephemeral: true
    });
  }

  if (
    !giveaway.winners.includes(
      interaction.user.id
    )
  ) {
    return interaction.editReply({
      content:
        "❌ You are not one of the winners of this giveaway.",
      ephemeral: true
    });
  }

  if (
    giveaway.claimed.has(
      interaction.user.id
    )
  ) {
    return interaction.editReply({
      content:
        "❌ You have already claimed this giveaway.",
      ephemeral: true
    });
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return interaction.editReply({
      content:
        "❌ This can only be claimed inside the server.",
      ephemeral: true
    });
  }

  const channelName =
    `giveaway-claim-${interaction.user.username}`
      .toLowerCase()
      .replace(
        /[^a-z0-9-]/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .slice(0, 90);

  const supportRoleId =
    config.tickets?.support?.roleId;

  const permissions = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },

    {
      id: giveaway.hostId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (supportRoleId) {
    permissions.push({
      id: supportRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  let ticketChannel;

  try {
    ticketChannel =
      await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: "1510706103300784240",
        permissionOverwrites:
          permissions
      });
  } catch (error) {
    console.error(
      "Giveaway ticket error:",
      error
    );

    return interaction.editReply({
      content:
        "❌ I could not create the ticket. Please check my permissions.",
      ephemeral: true
    });
  }

  giveaway.claimed.add(
    interaction.user.id
  );

  await interaction.editReply({
    content:
      `✅ **Ticket created!**\nYour giveaway claim ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });

  const winnerMention =
    `<@${interaction.user.id}>`;

  const hostMention =
    `<@${giveaway.hostId}>`;

  const embed =
    new EmbedBuilder()
      .setColor(0x0000ff)
      .setTitle(
        `Giveaway Claim — ${interaction.user.username}`
      )
      .setDescription(
        `Hey ${winnerMention}, thanks for claiming the giveaway!\n\n` +
        "Our support team will be with you shortly."
      )
      .addFields(
        {
          name: "Prize",
          value: giveaway.prize,
          inline: false
        },
        {
          name: "Host",
          value: hostMention,
          inline: true
        },
        {
          name: "Winner",
          value: winnerMention,
          inline: true
        }
      )
      .setFooter({
        text:
          "Brankos community support"
      });

  const closeButton =
    new ButtonBuilder()
      .setCustomId(
        "ticket_close"
      )
      .setLabel(
        "Close Ticket"
      )
      .setStyle(
        ButtonStyle.Danger
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        closeButton
      );

  await ticketChannel.send({
    content:
      `${hostMention} ${winnerMention}`,
    embeds: [embed],
    components: [row]
  });
}

function initGiveaways(client) {
  // Giveaway state is kept in-memory only (no DB/file persistence),
  // so there is nothing to restore on restart. This just confirms
  // the manager is ready once the client is logged in.
  console.log(
    `✅ Giveaway manager initialized (${giveaways.size} active giveaways).`
  );
}

module.exports = {
  initGiveaways,
  startGiveaway,
  joinGiveaway,
  leaveGiveaway,
  claimGiveaway,
  rerollGiveaway
};
