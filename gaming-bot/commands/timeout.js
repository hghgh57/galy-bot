const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription("Timeout a member (Discord's built-in temporary mute)")
    .addUserOption((opt) => opt.setName('user').setDescription('Who to timeout').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320)
    )
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason');

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: 'Could not find that member in this server.', ephemeral: true });
    }

    try {
      await member.timeout(minutes * 60 * 1000, reason || undefined);
    } catch (err) {
      return interaction.reply({
        content: "Couldn't timeout that member — they may have a higher role than this bot, or be a server admin.",
        ephemeral: true,
      });
    }

    await interaction.reply(`⏱️ ${target} has been timed out for ${minutes} minute(s).`);

    await logModAction(interaction.guild, {
      action: 'Timeout',
      moderator: interaction.user,
      target,
      reason,
      extra: [{ name: 'Duration', value: `${minutes} minute(s)`, inline: true }],
    });
  },
};
