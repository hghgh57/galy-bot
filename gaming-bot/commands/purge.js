const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages from this channel')
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('How many messages to delete')
        .setRequired(true)
        .addChoices({ name: '1', value: 1 }, { name: '10', value: 10 }, { name: '100', value: 100 })
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');

    await interaction.deferReply({ ephemeral: true });

    let deleted;
    try {
      // bulkDelete only works on messages younger than 14 days; older ones are skipped automatically.
      deleted = await interaction.channel.bulkDelete(amount, true);
    } catch (err) {
      return interaction.editReply({
        content: "Couldn't delete messages — I may be missing the Manage Messages permission in this channel.",
      });
    }

    await interaction.editReply({ content: `🧹 Deleted ${deleted.size} message(s).` });

    await logModAction(interaction.guild, {
      action: 'Purge',
      moderator: interaction.user,
      target: interaction.user,
      reason: `Purged messages in #${interaction.channel.name}`,
      extra: [
        { name: 'Channel', value: `${interaction.channel}`, inline: true },
        { name: 'Requested', value: `${amount}`, inline: true },
        { name: 'Deleted', value: `${deleted.size}`, inline: true },
      ],
    });
  },
};
