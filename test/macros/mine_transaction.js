const asyncAuto = require('async/auto');

const {broadcastTransaction} = require('./../../chain');
const {generateChainBlocks} = require('./../../chain');
const {getTransaction} = require('./../../chain');
const {returnResult} = require('./../../async-util');
const {Transaction} = require('./../../tokenslib');

const txConfirmationCount = 6;

/** Mine a transaction into a block

  {
    network: <Network Name String>
    transaction: <Transaction Hex String>
  }
*/
module.exports = ({network, transaction}, cbk) => {
  return asyncAuto({
    // Check if the transaction is already broadcast
    getTransaction: cbk => {
      return getTransaction({
        network,
        id: Transaction.fromHex(transaction).getId(),
      },
      cbk);
    },

    // Broadcast the transaction into the mempool
    broadcastTransaction: ['getTransaction', ({getTransaction}, cbk) => {
      // Exit early when the transaction has already been broadcast
      if (!!getTransaction.transaction) {
        return cbk();
      }
      console.log("Calling broadcastTransaction with transaction: " + transaction);
      return broadcastTransaction({network, transaction}, cbk);
    }],

    // Generate blocks to confirm the transaction into a block
    generateBlock: ['broadcastTransaction', ({}, cbk) => {
      console.log("bloks generated");
      return generateChainBlocks({
        network,
        count: txConfirmationCount,
      },
      cbk);
    }],
  },
  returnResult({}, cbk));
};

