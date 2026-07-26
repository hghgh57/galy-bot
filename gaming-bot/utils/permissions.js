const config = require('../config.json');

function isAdmin(member) {
  const roleIds = config.adminRoleIds || [];
  return roleIds.some((id) => id && !id.startsWith('PUT_') && member.roles.cache.has(id));
}

function isMod(member) {
  const roleIds = config.modRoleIds || [];
  return roleIds.some((id) => id && !id.startsWith('PUT_') && member.roles.cache.has(id));
}

module.exports = { isAdmin, isMod };
