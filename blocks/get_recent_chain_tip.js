const asyncAuto = require('async/auto');

const {getCurrentHash} = require('./../chain');
const {getCurrentHeight} = require('./../chain');
const {getJsonFromCache} = require('./../cache');
const {returnResult} = require('./../async-util');
const {setJsonInCache} = require('./../cache');

const cacheChainTipMs = 1000 * 5;

/** Get recent-ish chain tip values

  {
    cache: <Cache Type String>
    network: <Network Name String>
  }

  @returns via cbk
  {
    hash: <Block Hash Hex String>
    height: <Block Height Number>
  }
*/
module.exports = ({cache, network}, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!cache) {
        return cbk([400, 'ExpectedCacheForChainTip']);
      }

      if (!network) {
        return cbk([400, 'ExpectedNetworkToFindChainTip']);
      }

      return cbk();
    },

    // Get the cached chain tip value
    getCached: ['validate', ({}, cbk) => {
      return getJsonFromCache({cache, key: network, type: 'chain_tip'}, cbk);
    }],

    // Get the fresh chain tip hash value as necessary
    getFreshHash: ['getCached', ({getCached}, cbk) => {
      if (!!getCached && !!getCached.hash) {
        return cbk();
      }

      return getCurrentHash({network}, cbk);
    }],

    // Get the fresh chain tip height as necessary
    getFreshHeight: ['getCached', ({getCached}, cbk) => {
      if (!!getCached && !!getCached.height) {
        return cbk();
      }

      return getCurrentHeight({network}, cbk);
    }],

    // Set the cached chain tip value
    setCached: ['chainTip', 'getCached', ({chainTip, getCached}, cbk) => {
      if (!!getCached) {
        return cbk()
      }

      return setJsonInCache({
        cache,
        key: network,
        ms: cacheChainTipMs,
        type: 'chain_tip',
        value: {hash: chainTip.hash, height: chainTip.height},
      },
      cbk);
    }],

    // Final chain tip result
    chainTip: [
      'getCached',
      'getFreshHash',
      'getFreshHeight',
      ({getCached, getFreshHash, getFreshHeight}, cbk) =>
    {
      return cbk(null, {
        hash: !!getFreshHash ? getFreshHash.hash : getCached.hash,
        height: !!getFreshHeight ? getFreshHeight.height : getCached.height,
      });
    }],
  },
  returnResult({of: 'chainTip'}, cbk));
};

