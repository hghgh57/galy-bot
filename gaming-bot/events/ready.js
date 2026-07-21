module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('for /ticket-panel', { type: 3 }); // 3 = Watching
  },
};
