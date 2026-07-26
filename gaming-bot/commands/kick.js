const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to kick').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: 'Could not find that member in this server.', ephemeral: true });
    }

    await target.send(`You have been kicked from **${interaction.guild.name}**.\nReason: ${reason || 'No reason provided'}`).catch(() => {});

    try {
      await member.kick(reason || undefined);
    } catch (err) {
      return interaction.reply({
        content: "Couldn't kick that member — they may have a higher role than this bot, or be a server admin.",
        ephemeral: true,
      });
    }

    await interaction.reply(`👢 ${target} has been kicked.`);
    await logModAction(interaction.guild, { action: 'Kick', moderator: interaction.user, target, reason });
  },
};
