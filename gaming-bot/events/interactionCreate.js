const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');
const { createTicket, claimTicket, closeTicket } = require('../utils/ticketManager');
const {
  hasApplied,
  clearApplied,
  buildDecisionRow,
} = require('../utils/applicationManager');
const {
  startDmApplication,
  handleDmApplicationStart,
  handleDmApplicationCancel,
} = require('../utils/dmApplication');
const config = require('../config.json');
const { loadGiveaways, saveGiveaways, buildGiveawayEmbed } = require('../utils/giveawayManager');
const { OPTION_LABELS, buildStarsRow } = require('../utils/vouchManager');

function isSupport(member) {
  const roleIds = config.supportRoleIds || [];
  return roleIds.some((id) => id && !id.startsWith('PUT_') && member.roles.cache.has(id));
}

async function resetTicketDropdown(message) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Select a ticket category…')
    .addOptions(
      config.categories.map((cat) => ({
        label: cat.label,
        description: cat.description,
        value: cat.id,
        emoji: cat.emoji || undefined,
      }))
    );
  await message.edit({ components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => {});
}

async function resetApplicationDropdown(message) {
  const apps = config.applications || [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId('application_select')
    .setPlaceholder('Select an application…')
    .addOptions(
      apps.map((app) => ({
        label: app.label,
        description: app.description,
        value: app.id,
        emoji: app.emoji || undefined,
      }))
    );
  await message.edit({ components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => {});
}

// Builds a short modal asking a category's configured questions (up to 5,
// Discord's per-modal limit). The category id is embedded in the modal's
// customId so the submit handler below knows which ticket to create.
function buildQuestionsModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_questions_modal_${category.id}`)
    .setTitle(category.label.slice(0, 45));

  category.questions.slice(0, 5).forEach((question, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q_${i}`)
      .setLabel(question.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
        const categoryId = interaction.values[0];
        const category = (config.categories || []).find((c) => c.id === categoryId);

        // Categories with configured questions get a modal first — the
        // ticket itself is created once that's submitted, in the
        // ticket_questions_modal_ handler below.
        if (category?.questions?.length) {
          await interaction.showModal(buildQuestionsModal(category));
          await resetTicketDropdown(interaction.message);
          return;
        }

        try {
          await createTicket(interaction, categoryId);
        } finally {
          await resetTicketDropdown(interaction.message);
        }
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_questions_modal_')) {
        const categoryId = interaction.customId.replace('ticket_questions_modal_', '');
        const category = (config.categories || []).find((c) => c.id === categoryId);

        if (!category) {
          return interaction.reply({ content: 'Unknown ticket category.', ephemeral: true });
        }

        const answers = category.questions.map((question, i) => ({
          question,
          answer: interaction.fields.getTextInputValue(`q_${i}`),
        }));

        await createTicket(interaction, categoryId, answers);
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'application_select') {
        const appId = interaction.values[0];
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          await resetApplicationDropdown(interaction.message);
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        if (hasApplied(interaction.user.id, appId)) {
          await resetApplicationDropdown(interaction.message);
          return interaction.reply({
            content: 'You already have a pending application for this. Please wait for a decision before applying again.',
            ephemeral: true,
          });
        }

        await resetApplicationDropdown(interaction.message);

        const started = await startDmApplication(interaction.guild, interaction.user, appId, appConfig);

        if (!started) {
          return interaction.reply({
            content: "❌ I couldn't DM you. Please enable direct messages from server members and try again.",
            ephemeral: true,
          });
        }

        return interaction.reply({ content: '📬 Check your DMs to fill out the application!', ephemeral: true });
      }

      if (interaction.isButton()) {
        // These were previously unhandled — dmApplication.js sends buttons
        // with these customIds in DMs, but nothing here ever called the
        // handlers for them, so clicking Start/Cancel on the DM
        // confirmation silently failed.
        if (interaction.customId.startsWith('dmapp_start_')) {
          const appId = interaction.customId.replace('dmapp_start_', '');
          await handleDmApplicationStart(interaction, appId);
          return;
        }

        if (interaction.customId.startsWith('dmapp_cancel_')) {
          const appId = interaction.customId.replace('dmapp_cancel_', '');
          await handleDmApplicationCancel(interaction, appId);
          return;
        }

        if (interaction.customId.startsWith('vouch_no_')) {
          const rest = interaction.customId.replace('vouch_no_', '');
          const [requesterId, optionValue] = rest.split('|');
          const optionLabel = OPTION_LABELS[optionValue] || optionValue;

          await interaction.update({
            embeds: [new EmbedBuilder().setDescription('No worries — thanks for letting us know!').setColor('#ED4245')],
            components: [],
          });

          const logChannelId = config.vouchLogChannelId;
          if (logChannelId && !logChannelId.startsWith('PUT_')) {
            const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
              const logEmbed = new EmbedBuilder()
                .setTitle('Vouch Declined')
                .addFields(
                  { name: 'From', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                  { name: 'Requested by', value: `<@${requesterId}>`, inline: true },
                  { name: 'Category', value: optionLabel, inline: true }
                )
                .setColor('#ED4245')
                .setTimestamp();
              await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
          }
          return;
        }

        if (interaction.customId.startsWith('vouch_yes_')) {
          const rest = interaction.customId.replace('vouch_yes_', '');
          const [requesterId, optionValue] = rest.split('|');

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setDescription('Awesome! How many stars would you like to give? (1-5)')
                .setColor('#5865F2'),
            ],
            components: [buildStarsRow(requesterId, optionValue)],
          });
          return;
        }

        if (interaction.customId.startsWith('vouch_stars_')) {
          const rest = interaction.customId.replace('vouch_stars_', '');
          const [requesterId, optionValue, stars] = rest.split('|');

          const modal = new ModalBuilder()
            .setCustomId(`vouch_comment_modal_${requesterId}|${optionValue}|${stars}`)
            .setTitle('Leave a Comment');

          const commentInput = new TextInputBuilder()
            .setCustomId('vouch_comment_input')
            .setLabel('Comment (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId === 'giveaway_join') {
          const giveaways = loadGiveaways();
          const giveaway = giveaways[interaction.message.id];

          if (!giveaway || giveaway.ended) {
            return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
          }

          const userId = interaction.user.id;
          const idx = giveaway.entrants.indexOf(userId);

          if (idx === -1) {
            giveaway.entrants.push(userId);
            saveGiveaways(giveaways);
            await interaction.reply({ content: '🎉 You entered the giveaway!', ephemeral: true });
          } else {
            giveaway.entrants.splice(idx, 1);
            saveGiveaways(giveaways);
            await interaction.reply({ content: 'You left the giveaway.', ephemeral: true });
          }

          const updatedEmbed = buildGiveawayEmbed(
            giveaway.prize,
            giveaway.endTimestamp,
            giveaway.winnerCount,
            giveaway.entrants.length
          );
          await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
          return;
        }

        if (interaction.customId.startsWith('rr_')) {
          const roleId = interaction.customId.replace('rr_', '');
          const member = interaction.member;

          // Acknowledge immediately — role fetch/add/remove below are all
          // network calls, and doing them before any response risks missing
          // Discord's 3-second interaction deadline, which leaves the
          // button stuck showing a loading spinner client-side.
          await interaction.deferReply({ ephemeral: true });

          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.editReply({ content: 'That role no longer exists.' });
          }

          // Prefer the friendly label from config.json over the raw Discord
          // role name, so the message matches what's configured (e.g.
          // "Giveaway ping") instead of whatever the role happens to be
          // named in the server.
          const configEntry = (config.reactionRoles?.roles || []).find((r) => r.roleId === roleId);
          const displayName = configEntry?.label || role.name;

          if (member.roles.cache.has(roleId)) {
            try {
              await member.roles.remove(roleId);
              await interaction.editReply({ content: `Removed the **${displayName}** role.` });
            } catch (err) {
              console.error(`Failed to remove role ${roleId} (${displayName}) from ${member.user.tag}:`, err);
              await interaction.editReply({
                content: `❌ I couldn't remove the **${displayName}** role — I may not have permission (check my role is above it in Server Settings → Roles).`,
              });
            }
          } else {
            try {
              await member.roles.add(roleId);
              await interaction.editReply({ content: `Gave you the **${displayName}** role!` });
            } catch (err) {
              console.error(`Failed to add role ${roleId} (${displayName}) to ${member.user.tag}:`, err);
              await interaction.editReply({
                content: `❌ I couldn't give you the **${displayName}** role — I may not have permission (check my role is above it in Server Settings → Roles).`,
              });
            }
          }
          return;
        }

        if (interaction.customId === 'ticket_claim') {
          await claimTicket(interaction);
          return;
        }

        if (interaction.customId === 'ticket_close') {
          await closeTicket(interaction, null);
          return;
        }

        if (interaction.customId === 'ticket_close_reason') {
          const modal = new ModalBuilder()
            .setCustomId('ticket_close_reason_modal')
            .setTitle('Close Ticket');

          const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason_input')
            .setLabel('Reason for closing')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g. Issue resolved')
            .setRequired(true)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await interaction.showModal(modal);
          return;
        }

        if (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_deny_')) {
          const isAccept = interaction.customId.startsWith('app_accept_');
          const prefix = isAccept ? 'app_accept_' : 'app_deny_';
          const rest = interaction.customId.replace(prefix, '');
          const [applicantId, appId] = rest.split('_');

          if (!isSupport(interaction.member)) {
            return interaction.reply({
              content: 'Only staff can accept or deny applications.',
              ephemeral: true,
            });
          }

          const appConfig = (config.applications || []).find((a) => a.id === appId);
          const label = appConfig ? appConfig.label : 'Application';

          const originalEmbed = interaction.message.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(isAccept ? '#57F287' : '#ED4245')
            .setFooter({
              text: `${isAccept ? 'Accepted' : 'Denied'} by ${interaction.user.tag}`,
            });

          await interaction.update({
            embeds: [updatedEmbed],
            components: [buildDecisionRow(applicantId, appId, true)],
          });

          clearApplied(applicantId, appId);

          const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
          if (applicant) {
            await applicant
              .send(
                isAccept
                  ? `🎉 Your **${label}** application in **${interaction.guild.name}** was accepted!`
                  : `Your **${label}** application in **${interaction.guild.name}** was denied.`
              )
              .catch(() => {});
          }
          return;
        }
      }

      if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_reason_modal') {
        const reason = interaction.fields.getTextInputValue('close_reason_input');
        await closeTicket(interaction, reason);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('vouch_comment_modal_')) {
        const rest = interaction.customId.replace('vouch_comment_modal_', '');
        const [requesterId, optionValue, stars] = rest.split('|');
        const comment = interaction.fields.getTextInputValue('vouch_comment_input') || 'No comment left.';
        const optionLabel = OPTION_LABELS[optionValue] || optionValue;
        const starsNum = parseInt(stars, 10);
        const starDisplay = '⭐'.repeat(starsNum) + '☆'.repeat(5 - starsNum);

        // The modal was launched from the star-rating button, so .update()
        // both acknowledges the submission and edits that same DM message.
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription('✅ Thanks for your vouch!').setColor('#57F287')],
          components: [],
        });

        const vouchChannelId = config.vouchChannelId;
        if (vouchChannelId && !vouchChannelId.startsWith('PUT_')) {
          const vouchChannel = await interaction.client.channels.fetch(vouchChannelId).catch(() => null);
          if (vouchChannel) {
            const requester = await interaction.client.users.fetch(requesterId).catch(() => null);
            const vouchEmbed = new EmbedBuilder()
              .setTitle('⭐ New Vouch')
              .addFields(
                { name: 'Vouch For', value: requester ? `${requester}` : `<@${requesterId}>`, inline: true },
                { name: 'From', value: `${interaction.user}`, inline: true },
                { name: 'Category', value: optionLabel, inline: true },
                { name: 'Rating', value: starDisplay },
                { name: 'Comment', value: comment }
              )
              .setColor('#FEE75C')
              .setTimestamp();
            await vouchChannel.send({ embeds: [vouchEmbed] }).catch(() => {});
          }
        }
        return;
      }
    } catch (err) {
      console.error('Error handling interaction:', err);
      const errMsg = { content: 'Something went wrong handling that action.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};
