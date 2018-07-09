const asyncAuto = require('async/auto');

const addressForPublicKey = require('./address_for_public_key');
const {broadcastTransaction} = require('../../../chain/index');
const {claimTransaction} = require('../../../swaps/index');
const {chainConstants} = require('../../../chain/index');
const {clearCache} = require('../../../cache/index');
const {findSwapTransaction} = require('../../../service/index');
const {generateChainBlocks} = require('../../../chain/index');
const generateInvoice = require('./generate_invoice');
const {generateKeyPair} = require('../../../chain/index');
const {getCurrentHeight} = require('../../../chain/index');
const mineTransaction = require('./mine_transaction');
const sendChainTokensTransaction = require('./send_chain_tokens_tx');
const spawnChainDaemon = require('./spawn_chain_daemon');
const {stopChainDaemon} = require('../../../chain/index');
const {swapAddress} = require('../../../swaps/index');
const {swapScriptInTransaction} = require('../../../swaps/index');
const chainRpc = require('../../../chain/call_chain_rpc');

const imp = require('./spawn_chain_daemon');


const blockSearchDepth = 20;
const coinbaseIndex = chainConstants.coinbase_tx_index;
const maturityBlockCount = chainConstants.maturity_block_count;
const staticFeePerVirtualByte = 100;
const swapTimeoutBlockCount = 200;

/** Test a claim success script against regtest

  Alice and Bob will execute a successful swap:
  : Alice creates a swap address with both public keys and pay hash
  : Bob sends funds to the swap address
  : Alice sweeps the funds into her address

  {
    [is_refund_to_public_key_hash]: <Is Refund to PKHash Flow Bool>
    network: <Network Name String>
    swap_type: <Swap Address Type String>
  }
*/
module.exports = (args, cbk) => {
  return asyncAuto({

    // Alice will make a keypair that she will use to claim her rewarded funds
    generateAliceKeyPair: cbk => {
      try {
        return cbk(null, generateKeyPair({network: args.network}));
      } catch (e) {
        return cbk([0, 'ExpectedGeneratedKeyPair', e]);
      }
    },

    // Bob will make a keypair that he will use if Alice doesn't do the swap
    generateBobKeyPair: cbk => {
      console.log("generateBobKeyPair start");
      try {
        return cbk(null, generateKeyPair({network: args.network}));
      } catch (e) {
        return cbk([0, 'ExpectedGeneratedKeyPair', e]);
      }
    },

    // Bob will make a Lightning invoice to pay
    generatePaymentPreimage: ['generateBobKeyPair', (res, cbk) => {
      console.log("generatePaymentPreimage1");
      return generateInvoice({
        network: args.network,
        private_key: res.generateBobKeyPair.private_key,
      },
      cbk);
    }],

    // We'll bring up a fake chain for this core, with Bob getting the rewards
    spawnChainDaemon: ['generateBobKeyPair', ({generateBobKeyPair}, cbk) => {
      console.log("generateBobKeyPair");
      console.log(generateBobKeyPair);
      return spawnChainDaemon({
        network: args.network,
        mining_public_key: generateBobKeyPair.public_key,
      },
      cbk);
    }],

    // The chain needs to progress to maturity for Bob to spend his rewards
    generateToMaturity: ['spawnChainDaemon', ({}, cbk) => {
      console.log("generateToMaturity start");
      return generateChainBlocks({
        network: args.network,
        count: maturityBlockCount,
      },
      cbk);
    }],

    transferToWallet: ['generateToMaturity','generateBobKeyPair', ({generateBobKeyPair}, cbk) => {
      console.log(`Transferring to wallet ${generateBobKeyPair.p2wpkh_address}...`);
      return cbk(null, {});
      return chainRpc({
          network: "regtest",
          cmd: "sendtoaddress",
          params: [imp.miningaddr, 5000],
        },
        (err, details) => {
          console.log(details);
          return cbk(null, {});
        });

    }],
    // Bob creates a swap address that pays out to Alice or back to him on fail
    createChainSwapAddress: [
      'generateAliceKeyPair',
      'generateBobKeyPair',
      'generatePaymentPreimage',
      (res, cbk) =>
    {
      console.log("createChainSwapAddress start");
      const isPkHash = !!args.is_refund_to_public_key_hash;

      const refundPkHash = !isPkHash ? null : res.generateBobKeyPair.pk_hash;
      const refundPk = !isPkHash ? res.generateBobKeyPair.public_key : null;
      console.log("createChainSwapAddress end");
      try {
        return cbk(null, swapAddress({
          destination_public_key: res.generateAliceKeyPair.public_key,
          network: args.network,
          payment_hash: res.generatePaymentPreimage.payment_hash,
          refund_public_key: refundPk,
          refund_public_key_hash: refundPkHash,
          timeout_block_height: maturityBlockCount + swapTimeoutBlockCount,
        }));
      } catch (e) {
        return cbk([0, 'ChainSwapAddrCreationFail', e]);
      }
    }],

    // Bob needs to go get a block to spend his block reward to the swap
    bobUtxo: ['generateToMaturity','transferToWallet', ({generateToMaturity}, cbk) => {
      console.log("bobUtxo begin"); 
      const [firstRewardBlock] = generateToMaturity.blocks;

      const [coinbaseTransaction] = firstRewardBlock.transactions;

      const [firstCoinbaseOutput] = coinbaseTransaction.outputs;
      console.log("bobUtxo end");

      return cbk(null, {
        tokens: firstCoinbaseOutput.tokens,
        transaction_id: coinbaseTransaction.id,
        vout: coinbaseIndex,
      });
    }],

    // Bob makes a send transaction to fund the swap with his coins
    fundSwapAddress: ['bobUtxo', 'createChainSwapAddress', (res, cbk) => {
      console.log("sendChainTokensTransactionStart");
      return sendChainTokensTransaction({
        destination: res.createChainSwapAddress[`${args.swap_type}_address`],
        network: args.network,
        private_key: res.generateBobKeyPair.private_key,
        spend_transaction_id: res.bobUtxo.transaction_id,
        spend_vout: res.bobUtxo.vout,
        tokens: res.bobUtxo.tokens - 1000,
      },
      cbk);
    }],



    debugFundingTx: ['generateToMaturity', 'fundSwapAddress', ({fundSwapAddress}, cbk) => {
      console.log("debugTx start");
          return chainRpc({
              network: "regtest",
              cmd: "gettransaction",
              params: [fundSwapAddress.txid],
            },
            (err, details) => {
              if (!!err) {
                return cbk(err);
              }
              console.log("fundswapaddress:");
              console.log(fundSwapAddress);
              console.log("details: ");
              console.log(details);
              return cbk(null, {});
            });
    }
    ],

    // The chain progresses and confirms the swap funding
    mineFundingTx: ['fundSwapAddress', 'debugFundingTx' , ({fundSwapAddress}, cbk) => {
      console.log("mineFundingTx");

      return mineTransaction({
        network: args.network,
        transaction: fundSwapAddress.transaction,
      },
      cbk);
    }],

    // Find the funding transaction
    findFundingTransaction: [
      'bobUtxo',
      'generateAliceKeyPair',
      'generateBobKeyPair',
      'generatePaymentPreimage',
      'mineFundingTx',
      (res, cbk) =>
    {
      console.log("findFundingTransaction start");
      const isPkHash = !!args.is_refund_to_public_key_hash;

      const refundPkHash = !isPkHash ? null : res.generateBobKeyPair.pk_hash;
      const refundPk = !isPkHash ? res.generateBobKeyPair.public_key : null;
      console.log("Alice:");
      console.log(res.generateAliceKeyPair);
      console.log("Bob:");
      console.log(res.generateBobKeyPair);
      console.log("Finding swap transaction with:");
      console.log(`network: ${args.network}`);
      console.log(`block_search_depth ${blockSearchDepth}`);
      console.log(`destination_public_key ${res.generateAliceKeyPair.public_key}`);
      console.log(`payment_hash ${res.generatePaymentPreimage.payment_hash}`);
      console.log(`refund_public_key: ${refundPk}`);
      console.log(`refund_public_key_hash: ${refundPkHash}`);
      console.log(`timeout_block_height ${maturityBlockCount} + ${swapTimeoutBlockCount} = ${maturityBlockCount+swapTimeoutBlockCount}`);
      console.log(`tokens: ${res.bobUtxo.tokens - 1000}`);
      return findSwapTransaction({
        cache: 'memory',
        network: args.network,
        block_search_depth: blockSearchDepth,
        destination_public_key: res.generateAliceKeyPair.public_key,
        payment_hash: res.generatePaymentPreimage.payment_hash,
        refund_public_key: refundPk,
        refund_public_key_hash: refundPkHash,
        timeout_block_height: maturityBlockCount + swapTimeoutBlockCount,
          tokens: res.bobUtxo.tokens,

          // tokens: res.bobUtxo.tokens - 1000,
      },
      cbk);
    }],

    // Alice gets the height of the chain for her claim tx
    getHeightForSweepTransaction: ['mineFundingTx', ({}, cbk) => {
      console.log("getHeightForSweepTransaction start");
      return getCurrentHeight({network: args.network}, cbk);
    }],

    // Alice grabs the utxo she can spend to herself from the funded swap utxo
    fundingTransactionUtxos: [
      'createChainSwapAddress',
      'findFundingTransaction',
      ({createChainSwapAddress, findFundingTransaction}, cbk) =>
    {
      console.log("fundingTransactionUtxos start");
      console.log(findFundingTransaction);
      if (!findFundingTransaction.transaction) {
        return cbk([0, 'ExpectedFundedSwapTransaction']);
      }

      try {
        return cbk(null, swapScriptInTransaction({
          redeem_script: createChainSwapAddress.redeem_script,
          transaction: findFundingTransaction.transaction,
        }));
      } catch (e) {
        return cbk([0, e.message, e]);
      }
    }],

    // Make sure that we are ready to claim
    readyToClaim: [
      'fundingTransactionUtxos', // Figured out which utxos are swap ones
      'generateAliceKeyPair',
      'generatePaymentPreimage',
      'getHeightForSweepTransaction', // Got a good locktime for the sweep tx
      (res, cbk) =>
    {
      console.log("checking ready to claim");
      return cbk(null, {
        current_block_height: res.getHeightForSweepTransaction.height,
        destination: res.generateAliceKeyPair.p2wpkh_address,
        fee_tokens_per_vbyte: staticFeePerVirtualByte,
        preimage: res.generatePaymentPreimage.payment_preimage,
        private_key: res.generateAliceKeyPair.private_key,
        utxos: res.fundingTransactionUtxos.matching_outputs,
      });
    }],

    // Test `claim_fail_preimage` where the claim is attempted with bad preimg
    claimWithBadPreimage: ['readyToClaim', ({readyToClaim}, cbk) => {
      try {
        console.log("claimWithBadPreimage start");
        return cbk(null, claimTransaction({
          current_block_height: readyToClaim.current_block_height,
          destination: readyToClaim.destination,
          fee_tokens_per_vbyte: readyToClaim.fee_tokens_per_vbyte,
          network: args.network,
          preimage: readyToClaim.preimage.replace(/\d/g, '0'),
          private_key: readyToClaim.private_key,
          utxos: readyToClaim.utxos,
        }));
      } catch (e) {
        return cbk([0, 'ClaimTransactionFailed', e]);
      }
    }],

    // Make sure that using a bad preimage fails the claim tx broadcast
    confirmFailWithBadPreimage: ['claimWithBadPreimage', (res, cbk) => {
      console.log('confirmFailWithBadPreimage start');
      return broadcastTransaction({
        network: args.network,
        transaction: res.claimWithBadPreimage.transaction,
      },
      err => {
        if (!err) {
          return cbk([0, 'ExpectedFailWithBadPreimage']);
        }

        return cbk();
      });
    }],

    // Test `claim_fail_sig` where the claim is attempted with a bad sig
    claimWithBobSig: ['generateBobKeyPair', 'readyToClaim', (res, cbk) => {
      console.log("claimWithBobSig start");
      try {
        return cbk(null, claimTransaction({
          current_block_height: res.readyToClaim.current_block_height,
          destination: res.readyToClaim.destination,
          fee_tokens_per_vbyte: res.readyToClaim.fee_tokens_per_vbyte,
          network: args.network,
          preimage: res.readyToClaim.preimage,
          private_key: res.generateBobKeyPair.private_key, // Wrong key
          utxos: res.readyToClaim.utxos,
        }));
      } catch (e) {
        return cbk([0, 'ExpectedClaimTransaction', e]);
      }
    }],

    // Make sure that using a bad claim signature fails the tx broadcast
    confirmFailWithBadSig: ['claimWithBobSig', ({claimWithBobSig}, cbk) => {
      console.log("confirmFailWithBadSig start");
      return broadcastTransaction({
        network: args.network,
        transaction: claimWithBobSig.transaction,
      },
      err => {
        if (!Array.isArray(err)) {
          return cbk([0, 'ExpectBadSigFails']);
        }

        const [code, msg] = err;

        if (code !== 503) {
          return cbk([0, 'ExpectedRemoteFailureCode']);
        }

        if (msg !== 'TransactionBroadcastFailed') {
          return cbk([0, 'ExpectedTransactionBroadcastFailure']);
        }

        return cbk();
      });
    }],

    // Alice paid Bob's invoice so she now uses that preimage for the reward
    claimTransaction: ['readyToClaim', ({readyToClaim}, cbk) => {
      console.log("claimTransaction start");
      try {
        return cbk(null, claimTransaction({
          current_block_height: readyToClaim.current_block_height,
          destination: readyToClaim.destination,
          fee_tokens_per_vbyte: readyToClaim.fee_tokens_per_vbyte,
          network: args.network,
          preimage: readyToClaim.preimage,
          private_key: readyToClaim.private_key,
          utxos: readyToClaim.utxos,
        }));
      } catch (e) {
        return cbk([0, 'ExpectedClaimTransaction', e]);
      }
    }],

    // Alice's rewarded coins are confirmed back to an address she controls
    mineClaimTransaction: ['claimTransaction', ({claimTransaction}, cbk) => {
      console.log("mineClaimTransaction");
      const {transaction} = claimTransaction;

      return mineTransaction({network: args.network, transaction}, cbk);
    }],
  },
  (err, res) => {
    if (!!res.spawnChainDaemon && !!res.spawnChainDaemon.is_ready) {
      console.log("Stopping chain daemon!!");
      console.log("Stopping chain daemon!!");
      console.log("Stopping chain daemon!!");
      console.log("Stopping chain daemon!!");

      return stopChainDaemon({network: args.network}, stopErr => {
        if(stopErr){
          stopChainDaemon({network: args.network}, stopErr2 => {
            console.log(stopErr);
            return cbk(stopErr || err);
          })
        }
        return cbk();
      });
    }

    if (!!err) {
      return cbk(err);
    }

    return clearCache({cache: 'memory'}, cbk);
  });
};
