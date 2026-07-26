const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Check the Minecraft server's current status and player count"),

  async execute(interaction) {
    const ip = config.minecraftServerIp;
    if (!ip || ip.startsWith('PUT_')) {
      return interaction.reply({
        content: 'The server IP has not been configured yet.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`);
      const data = await res.json();

      if (!data.online) {
        const embed = new EmbedBuilder()
          .setTitle('🔴 Server Offline')
          .setDescription(`**${ip}** appears to be offline right now.`)
          .setColor('#ED4245');
        return interaction.editReply({ embeds: [embed] });
      }

      const onlineCount = data.players?.online ?? 0;
      const maxCount = data.players?.max ?? 0;
      const playerList = data.players?.list?.slice(0, 15).join(', ') || 'No players online';

      const embed = new EmbedBuilder()
        .setTitle('🟢 Server Online')
        .setDescription(`**${ip}**`)
        .addFields(
          { name: 'Players', value: `${onlineCount} / ${maxCount}`, inline: true },
          { name: 'Version', value: data.version || 'Unknown', inline: true },
          { name: 'Who\'s Online', value: playerList, inline: false }
        )
        .setColor('#57F287')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Failed to fetch server status:', err);
      await interaction.editReply({ content: 'Could not reach the status service right now — try again shortly.' });
    }
  },
};
