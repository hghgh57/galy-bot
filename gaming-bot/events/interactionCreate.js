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
  savePartial,
  getPartial,
  clearPartial,
  hasApplied,
  markApplied,
  clearApplied,
  buildApplicationEmbed,
} = require('../utils/applicationManager');
const config = require('../config.json');
const { loadGiveaways, saveGiveaways, buildGiveawayEmbed } = require('../utils/giveawayManager');

function buildQuestionModal(customId, title, questions) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  questions.forEach((question, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(question.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

function buildDecisionRow(userId, appId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${userId}_${appId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app_deny_${userId}_${appId}`)
      .setLabel('Deny')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

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

async function submitApplication(interaction, appId, appConfig, fullAnswers) {
  clearPartial(interaction.user.id, appId);
  markApplied(interaction.user.id, appId);

  const embed = buildApplicationEmbed(interaction.member, appConfig, fullAnswers);
  const reviewChannel = await interaction.guild.channels
    .fetch(appConfig.reviewChannelId)
    .catch(() => null);

  if (reviewChannel) {
    const row = buildDecisionRow(interaction.user.id, appId);
    await reviewChannel.send({ embeds: [embed], components: [row] });
  }
  await interaction.reply({ content: '✅ Your application has been submitted!', ephemeral: true });
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
        await createTicket(interaction, categoryId);
        await resetTicketDropdown(interaction.message);
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

        const firstFive = appConfig.questions.slice(0, 5);
        const modal = buildQuestionModal(
          `application_modal1_${appId}`,
          appConfig.label.slice(0, 45),
          firstFive
        );

        await interaction.showModal(modal);
        await resetApplicationDropdown(interaction.message);
        return;
      }

      if (interaction.isButton()) {
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

          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.reply({ content: 'That role no longer exists.', ephemeral: true });
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => {});
            await interaction.reply({ content: `Removed the **${role.name}** role.`, ephemeral: true });
          } else {
            await member.roles.add(roleId).catch(() => {});
            await interaction.reply({ content: `Gave you the **${role.name}** role!`, ephemeral: true });
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

        if (interaction.customId.startsWith('application_continue_')) {
          const appId = interaction.customId.replace('application_continue_', '');
          const appConfig = (config.applications || []).find((a) => a.id === appId);

          if (!appConfig) {
            return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
          }

          const remaining = appConfig.questions.slice(5);
          const modal2 = buildQuestionModal(
            `application_modal2_${appId}`,
            appConfig.label.slice(0, 45),
            remaining
          );
          await interaction.showModal(modal2);
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

      if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal1_')) {
        const appId = interaction.customId.replace('application_modal1_', '');
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const answers = [];
        for (let i = 0; i < 5; i++) {
          answers.push(interaction.fields.getTextInputValue(`q${i}`));
        }
        savePartial(interaction.user.id, appId, answers);

        const remaining = appConfig.questions.slice(5);

        if (remaining.length === 0) {
          const fullAnswers = getPartial(interaction.user.id, appId);
          await submitApplication(interaction, appId, appConfig, fullAnswers);
          return;
        }

        const continueRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`application_continue_${appId}`)
            .setLabel('Continue Application')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: 'Almost done! Click below to answer the last question.',
          components: [continueRow],
          ephemeral: true,
        });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal2_')) {
        const appId = interaction.customId.replace('application_modal2_', '');
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const firstFive = getPartial(interaction.user.id, appId) || [];
        const remainingCount = appConfig.questions.length - 5;
        const lastAnswers = [];
        for (let i = 0; i < remainingCount; i++) {
          lastAnswers.push(interaction.fields.getTextInputValue(`q${i}`));
        }

        const fullAnswers = [...firstFive, ...lastAnswers];
        await submitApplication(interaction, appId, appConfig, fullAnswers);
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
