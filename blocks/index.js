/** Blocks allows access to abstracted blockchain data from the chain or cache.
*/
const confirmChainBackend = require('./confirm_chain_backend');
const getBlockPlacement = require('./get_block_placement');
const getRecentChainTip = require('./get_recent_chain_tip');
const getRecentFeeRate = require('./get_recent_fee_rate');

module.exports = {
  confirmChainBackend,
  getBlockPlacement,
  getRecentChainTip,
  getRecentFeeRate,
};

