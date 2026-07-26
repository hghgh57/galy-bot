const { SlashCommandBuilder } = require('discord.js');
const { setSticky, removeSticky, updateLastMessageId } = require('../utils/stickyManager');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Manage the sticky message for this channel')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set a sticky message for this channel')
        .addStringOption((opt) =>
          opt.setName('message').setDescription('The message to stick').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove the sticky message from this channel')
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const message = interaction.options.getString('message');
      setSticky(interaction.channel.id, message);

      const sent = await interaction.channel.send(`📌 ${message}`);
      updateLastMessageId(interaction.channel.id, sent.id);

      await interaction.reply({ content: 'Sticky message set for this channel.', ephemeral: true });
      return;
    }

    if (sub === 'remove') {
      const existing = removeSticky(interaction.channel.id);
      if (!existing) {
        return interaction.reply({ content: 'This channel has no sticky message.', ephemeral: true });
      }

      if (existing.lastMessageId) {
        const oldMsg = await interaction.channel.messages.fetch(existing.lastMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }

      await interaction.reply({ content: 'Sticky message removed.', ephemeral: true });
      return;
    }
  },
};
