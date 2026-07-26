const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false))
    .addIntegerOption((opt) =>
      opt
        .setName('delete_days')
        .setDescription("Delete this many days of the user's messages (0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    await target
      .send(`You have been banned from **${interaction.guild.name}**.\nReason: ${reason || 'No reason provided'}`)
      .catch(() => {});

    try {
      await interaction.guild.members.ban(target.id, {
        reason: reason || undefined,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });
    } catch (err) {
      return interaction.reply({
        content: "Couldn't ban that user — they may have a higher role than this bot, or be a server admin.",
        ephemeral: true,
      });
    }

    await interaction.reply(`🔨 ${target} has been banned.`);
    await logModAction(interaction.guild, { action: 'Ban', moderator: interaction.user, target, reason });
  },
};
