const {nextTick} = process;

const asyncAuto = require('async/auto');
const {getPendingChannels} = require('ln-service');
const {getRoutes} = require('ln-service');
const {parseInvoice} = require('ln-service');

const {checkInvoicePayable} = require('./../swaps');
const {getExchangeRate} = require('./../fiat');
const getFeeForSwap = require('./get_fee_for_swap');
const {getRecentChainTip} = require('./../blocks');
const {getRecentFeeRate} = require('./../blocks');
const {lightningDaemon} = require('./../lightning');
const {returnResult} = require('./../async-util');
const swapParameters = require('./swap_parameters');

const currency = 'BTC';
const estimatedTxVirtualSize = 200;
const fiatCurrency = 'USD';

/** Get invoice details in the context of a swap

  {
    cache: <Cache Type String>
    invoice: <Invoice String>
    network: <Network of Chain Swap String>
  }

  @returns via cbk
  {
    created_at: <Created At ISO 8601 Date String>
    description: <Payment Description String>
    destination_public_key: invoice.destination,
    expires_at: <Expires At ISO 8601 Date String>
    fee: <Swap Fee Tokens Number>
    [fee_fiat_value]: <Fee Fiat Cents Value Number>
    [fiat_currency_code]: <Fiat Currency Code String>
    [fiat_value]: <Fiat Value in Cents Number>
    id: <Invoice Id String>
    is_expired: <Invoice is Expired Bool>
    network: <Network of Invoice String>
    tokens: <Tokens to Send Number>
  }
*/
module.exports = ({cache, invoice, network}, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      console.log("zzzzzzz")
      if (!cache) {
        return cbk([400, 'ExpectedCacheForInvoiceDetails']);
      }

      if (!invoice) {
        return cbk([400, 'ExpectedInvoiceForInvoiceDetails']);
      }

      if (!network) {
        return cbk([400, 'ExpectedNetworkForInvoiceDetails']);
      }

      return cbk();
    },

    // Determine where the chain tip is at
    getChainTip: ['validate', ({}, cbk) => {
      console.log("zzzzz")
      return getRecentChainTip({cache, network}, cbk);
    }],

    // Get the current fee rate
    getFeeRate: ['validate', ({}, cbk) => {
      console.log("zzz")
      return getRecentFeeRate({cache, network}, cbk);
    }],

    // Decode the supplied invoice
    parsedInvoice: ['validate', ({}, cbk) => {
      console.log("parsedInvoice in getInvoiceChainTip")
      try {
        return cbk(null, parseInvoice({invoice}));
      } catch (e) {
        return cbk([400, 'DecodeInvoiceFailure', e]);
      }
    }],

    // Get the chain tip for the invoice's network
    getInvoiceChainTip: ['parsedInvoice', ({parsedInvoice}, cbk) => {
      console.log("getInvoiceChainTip in get_invoice_details")
      return getRecentChainTip({cache, network: parsedInvoice.network}, cbk);
    }],

    // Figure out what it will cost to do this swap
    getSwapFee: ['parsedInvoice', ({parsedInvoice}, cbk) => {
      console.log("getSwapFee in get_invoice_details")
      const to = parsedInvoice.network;
      console.log(parsedInvoice);
      const {tokens} = parsedInvoice;
      console.log("GETTING FEE FOR SWAP");
      return getFeeForSwap({cache, network, to, tokens}, cbk);
    }],

    // LND connection
    lnd: ['parsedInvoice', ({parsedInvoice}, cbk) => {
      console.log("parsed invoice, making LND");
      try {
        return cbk(null, lightningDaemon({network: parsedInvoice.network}));
      } catch (e) {
        console.log(e);
        return cbk([500, 'FailedToInstantiateLndConnection']);
      }
    }],

    // Parameters for a swap with an invoice
    swapParams: ['validate', ({}, cbk) => {
      console.log("swapParams")
      try {
        return cbk(null, swapParameters({network}));
      } catch (e) {
        return cbk([400, 'ExpectedSwapParameters', e]);
      }
    }],

    // Pull the pending channels to see if we have a related pending channel
    getPending: ['lnd', ({lnd}, cbk) => {
        console.log('get pending');
            getPendingChannels({lnd}, cbk)}],

    // See if this invoice is payable
    getRoutes: ['lnd', 'parsedInvoice', ({lnd, parsedInvoice}, cbk) => {
      console.log("getRoutes")
      const {destination} = parsedInvoice;
      const {tokens} = parsedInvoice;
      console.log("finished getroutes")
      return getRoutes({destination, lnd, tokens}, cbk);
    }],

    // Check to make sure the invoice can be paid
    checkPayable: [
      'getChainTip',
      'getFeeRate',
      'getInvoiceChainTip',
      'getPending',
      'getRoutes',
      'getSwapFee',
      'parsedInvoice',
      'swapParams',
      ({
        getChainTip,
        getFeeRate,
        getInvoiceChainTip,
        getPending,
        getRoutes,
        getSwapFee,
        parsedInvoice,
        swapParams,
      },
      cbk) =>
    {
      try {
        console.log("checkPyaable");
        const check = checkInvoicePayable({
          network,
          claim_window: swapParams.claim_window,
          current_height: getChainTip.height,
          destination: parsedInvoice.destination,
          destination_height: getInvoiceChainTip.height,
          expires_at: parsedInvoice.expires_at,
          invoice_network: parsedInvoice.network,
          pending_channels: getPending.pending_channels,
          refund_height: getChainTip.height + swapParams.timeout,
          required_confirmations: swapParams.funding_confs,
          routes: getRoutes.routes,
          swap_fee: getSwapFee.fee,
          sweep_fee: getFeeRate.fee_tokens_per_vbyte * estimatedTxVirtualSize,
          tokens: parsedInvoice.tokens,
        });
         console.log("end checkpayable")
        return cbk();
      } catch (e) {
        return cbk([400, e.message]);
      }
    }],

    // Get the exchange rate
    getFiatRate: ['checkPayable', 'parsedInvoice', ({parsedInvoice}, cbk) => {
      console.log("getFiatRate")
      const {network} = parsedInvoice;

      return getExchangeRate({cache, network}, cbk);
    }],

    // Get the exchange rate for the fee (may be on a different network)
    getFeeFiatRate: ['checkPayable', ({}, cbk) => {
      console.log("getFeeFiatRate")
      return getExchangeRate({cache, network}, cbk);
    }],

    // Fiat value of fee
    feeFiatValue: [
      'getFeeFiatRate',
      'getSwapFee',
      ({getFeeFiatRate, getSwapFee}, cbk) =>
    {
      console.log("feeFiatValue");
      return cbk(null, getSwapFee.fee * getFeeFiatRate.cents);
    }],

    // Fiat value
    fiatValue: [
      'getFiatRate',
      'parsedInvoice',
      ({getFiatRate, parsedInvoice}, cbk) =>
    {
      console.log("fiatValue")
      return cbk(null, parsedInvoice.tokens * getFiatRate.cents);
    }],

    // Invoice Details
    invoiceDetails: [
      'feeFiatValue',
      'fiatValue',
      'getSwapFee',
      'parsedInvoice',
      ({feeFiatValue, fiatValue, getSwapFee, parsedInvoice}, cbk) =>
    {
      console.log("invoiceDetails");
      return cbk(null, {
        created_at: parsedInvoice.created_at,
        description: parsedInvoice.description,
        destination_public_key: parsedInvoice.destination,
        expires_at: parsedInvoice.expires_at,
        fee: getSwapFee.fee,
        fee_fiat_value: feeFiatValue,
        fiat_currency_code: fiatCurrency,
        fiat_value: fiatValue || null,
        id: parsedInvoice.id,
        is_expired: parsedInvoice.is_expired,
        network: parsedInvoice.network,
        tokens: parsedInvoice.tokens,
      });
    }],
  },
  returnResult({of: 'invoiceDetails'}, cbk));
};

