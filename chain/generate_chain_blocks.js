const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const asyncTimesSeries = require('async/timesSeries');
const imp = require('./../test/macros/spawn_chain_daemon');
const chainRpc = require('./call_chain_rpc');
const {generate} = require('./conf/rpc_commands');
const getBlockDetails = require('./get_block_details');
const {returnResult} = require('./../async-util');

const noDelay = 0;

/** Generate blocks on the chain

  {
    [count]: <Count of Generated Blocks Number>
    [delay]: <Delay Between Blocks Ms Number> = 0
    network: <Network Name String>
  }

  @returns via cbk
  {
    blocks: [{
      transactions: [{
        id: <Transaction Id Hex String>
        outputs: [{
          tokens: <Tokens Send Number>
        }]
      }]
    }]
  }
*/
module.exports = ({count, delay, network}, cbk) => {
  return asyncAuto({
    // Make blocks to maturity
    generateBlocks: cbk => {
      if (!network) {
        return cbk([400, 'ExpectedNetworkForGeneration']);
      }
      let command;
      let parameters;
      switch (imp.implementation) {
        case "btcd":
          command = generate;
          parameters = [[delay].length];
          break;
        case "bitcoind":
          console.log("Generating to address...");
          command = "generatetoaddress";
          paramaters = [[delay].length, imp.walletaddr];
      }
      command = generate;
      parameters = [[delay].length];

      return asyncTimesSeries(count, ({}, cbk) => {
        console.log("Generating block..");
        return chainRpc({
          network,
          cmd: command,
          params: parameters,
        },
        (err, blockHashes) => {
          // if (!!err) {
          //   return cbk(err);
          // }
          console.log("Blockhashes: " + blockHashes);
          console.log(err);
          const [blockHash] = blockHashes;

          return setTimeout(() => cbk(null, blockHash), delay || noDelay);
        });
      },
      cbk);
    },

    // Grab the full details of each blocks, including transaction info
    blocks: ['generateBlocks', ({generateBlocks}, cbk) => {
      return asyncMapSeries(generateBlocks, (blockHash, cbk) => {
        return getBlockDetails({network, id: blockHash}, cbk);
      },
      cbk);
    }],

    // Final blocks
    blockDetails: ['blocks', ({blocks}, cbk) => cbk(null, {blocks})],
  },
  returnResult({of: 'blockDetails'}, cbk));
};

