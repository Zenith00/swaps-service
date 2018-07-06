const asyncAuto = require('async/auto');

const {getJsonFromCache} = require('./../cache');
const {getTransaction} = require('./../chain');
const {returnResult} = require('./../async-util');
const {setJsonInCache} = require('./../cache');
const swapsFromInputs = require('./swaps_from_inputs');
const swapsFromOutputs = require('./swaps_from_outputs');

const cacheSwapsMs = 1000 * 60 * 60 * 2;

/** Check a transaction to see if there are any associated swaps.

  {
    cache: <Cache Type String> 'dynamodb|memory|redis'
    id: <Transaction Id Hex String>
    network: <Network Name String>
  }

  @return via cbk
  {
    swaps: [{
      index: <Redeem Script Claim Key Index Number>
      [invoice] <Funding Related BOLT 11 Invoice String>
      [outpoint]: <Resolution Spent Outpoint String>
      [output]: <Funding Output Script Hex String>
      [preimage]: <Claim Preimage Hex String>
      script: <Swap Redeem Script Hex String>
      [tokens]: <Token Count Number>
      type: <Transaction Type String> claim|funding|refund
      [vout]: <Funding Output Index Number>
    }]
  }
*/
module.exports = ({cache, id, network}, cbk) => {
  return asyncAuto({
    // Check arguments

    validate: cbk => {
      console.log(`detectswaps called with cache ${cache} id ${id} network ${network}`);

      if (!cache) {
        return cbk([400, 'ExpectedCacheToCheck']);
      }

      if (!id) {
        return cbk([400, 'ExpectedTxIdToCheck']);
      }

      if (!network) {
        return cbk([400, 'ExpectedNetworkName']);
      }

      return cbk();
    },

    // See if we already know swaps related to this transaction
    getCachedSwaps: ['validate', ({}, cbk) => {
      console.log("getCachedSwaps");
      return getJsonFromCache({cache, key: id, type: 'swaps_for_tx'}, cbk);
    }],

    // Get the raw transaction to look for swaps
    getTransaction: ['getCachedSwaps', ({getCachedSwaps}, cbk) => {
      console.log("getTransaction in detect_swaps");
      // Exit early when we already have swap details
      if (!!getCachedSwaps) {
        console.log("already have swap details, early exit");
        return cbk();
      }

      // This will get the transaction from the chain. There's no need to cache
      // it because we are caching the end result of our analysis.
      console.log("getting transaction in gettransaction in detect_swaps");
      return getTransaction({id, network}, cbk);
    }],

    // Determine if the inputs have swaps. (Claim or refund type)
    swapsFromInputs: ['getTransaction', ({getTransaction}, cbk) => {
      console.log("swapsFromInputs in detect_swaps");
      console.log(getTransaction);
      // Exit early when there's no transaction to lookup
      if (!getTransaction) {
        return cbk();
      }

      const {transaction} = getTransaction;

      return swapsFromInputs({cache, network, transaction}, cbk);
    }],

    // Determine if the outputs have swap output scripts (funding type)
    swapsFromOutputs: ['getTransaction', ({getTransaction}, cbk) => {
      console.log("Swapsfromoutputs");
      console.log(getTransaction);
      // Exit early when there's no transaction to lookup
      if (!getTransaction) {
        return cbk();
      }

      const {transaction} = getTransaction;

      return swapsFromOutputs({cache, network, transaction}, cbk);
    }],
    debugStep: ['swapsFromOutputs', 'swapsFromInputs', ({swapsFromOutputs, swapsFromInputs}, cbk) => {
      console.log("==");
      console.log("DebugStep");
      console.log("==");
      console.log("outputs");

      console.log(swapsFromOutputs);
      console.log("=\ninputs");
      console.log(swapsFromInputs);
      return cbk();
    }],
    // Concat all detected swaps
    swaps: [
      'debugStep',
      'getCachedSwaps',
      'getTransaction',
      'swapsFromInputs',
      'swapsFromOutputs',
      ({
        getCachedSwaps,
        getTransaction,
        swapsFromInputs,
        swapsFromOutputs,
      },
      cbk) =>
    {
      console.log("concatenating detected swaps");

      // Exit early when the swaps results were cached
      if (!!getCachedSwaps) {
        return cbk(null, getCachedSwaps);
      }
      console.log("@getCachedSwaps");
      console.log(getCachedSwaps);
      console.log("@getTransaction");
      console.log(getTransaction);
      console.log("@swapsFromInputs");
      console.log(swapsFromInputs);
      console.log("@swapsFromOutputs");
      console.log(swapsFromOutputs);
      console.log("\n");
      const fundingSwaps = !swapsFromOutputs ? [] : swapsFromOutputs.swaps;
      const resolutionSwaps = !swapsFromInputs ? [] : swapsFromInputs.swaps;
      console.log("\n"*2);
      console.log("fundingswaps:");
      console.log(fundingSwaps);
      console.log("resolutionswaps:");
      console.log(resolutionSwaps);
      console.log("\n");
      return cbk(null, [].concat(fundingSwaps).concat(resolutionSwaps));
    }],

    // Set cached swap status
    setCachedSwaps: ['getCachedSwaps', 'swaps', (res, cbk) => {
      console.log("setting cached swaps");
      console.log(res);
      // Exit early without caching when the swaps are a cached result
      if (!!res.getCachedSwaps) {
        return cbk();
      }

      return setJsonInCache({
        cache,
        key: id,
        ms: cacheSwapsMs,
        type: 'swaps_for_tx',
        value: res.swaps,
      },
      cbk);
    }],

    // Final swaps result
    detectedSwaps: ['swaps', ({swaps}, cbk) => cbk(null, {swaps})],
  },
  returnResult({of: 'detectedSwaps'}, cbk));
};

