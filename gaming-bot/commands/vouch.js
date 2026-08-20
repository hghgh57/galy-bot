const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');
const { OPTION_LABELS, sendVouchRequestDm } = require('../utils/vouchManager');

function hasVouchRole(member) {
  const roleId = config.vouchRoleId;
  return roleId && !roleId.startsWith('PUT_') && member.roles.cache.has(roleId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Request a vouch from a user about a recent transaction')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to request a vouch from').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('option')
        .setDescription('What the vouch is about')
        .setRequired(true)
        .addChoices(
          { name: 'Spawner Sell', value: 'spawner_sell' },
          { name: 'Spawner Buy', value: 'spawner_buy' },
          { name: 'Giveaway Claim', value: 'giveaway_claim' }
        )
    ),

  async execute(interaction) {
    if (!hasVouchRole(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to request vouches.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const optionValue = interaction.options.getString('option');
    const optionLabel = OPTION_LABELS[optionValue];

    if (target.bot) {
      return interaction.reply({ content: "You can't request a vouch from a bot.", ephemeral: true });
    }

    const sent = await sendVouchRequestDm(target, interaction.user, optionValue);

    if (!sent) {
      return interaction.reply({
        content: `❌ I couldn't DM ${target} — they may have DMs disabled.`,
        ephemeral: true,
      });
    }

    await interaction.reply({ content: `📨 Vouch request sent to ${target} for **${optionLabel}**.`, ephemeral: true });
  },
};
