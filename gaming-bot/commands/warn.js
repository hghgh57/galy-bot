const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');
const { addWarning } = require('../utils/warnManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to warn').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const warningCount = addWarning(target.id, reason, interaction.user.id);

    await interaction.reply(`⚠️ ${target} has been warned. (Total warnings: ${warningCount})`);
    await target.send(`You have been warned in **${interaction.guild.name}**.\nReason: ${reason}`).catch(() => {});

    await logModAction(interaction.guild, {
      action: 'Warn',
      moderator: interaction.user,
      target,
      reason,
      extra: [{ name: 'Total Warnings', value: `${warningCount}`, inline: true }],
    });
  },
};
