const bodyParser = require('body-parser');
const {Router} = require('express');

const {checkSwapStatus} = require('./../service');
const {createSwap} = require('./../service');
const {findSwapOutpoint} = require('./../service');
const {getAddressDetails} = require('./../service');
const {getExchangeRates} = require('./../service');
const {getInvoiceDetails} = require('./../service');
const {returnJson} = require('./../async-util');

const cache = 'redis';
const maxInvoiceFeeRate = 0.005;

/** Make an api router

  {
    log: <Log Function>
  }

  @returns
  <Router Object>
*/
module.exports = ({log}) => {
  const router = Router({caseSensitive: true});

  router.use(bodyParser.json());

  // GET details about an address
  router.get('/address_details/:network/:address', ({params}, res) => {
    const {address} = params;

    return getAddressDetails({address, network}, returnJson({log, res}));
  });

  // GET exchange rate information
  router.get('/exchange_rates/', ({}, res) => {
    return getExchangeRates({cache}, returnJson({log, res}));
  });

  // GET details about an invoice
  router.get('/invoice_details/:invoice', ({params}, res) => {
    const {invoice} = params;

    return getInvoiceDetails({
      invoice,
      max_invoice_fee_rate: maxInvoiceFeeRate,
    },
    returnJson({log, res}));
  });

  // POST a swap output find details request
  router.post('/swap_outputs/', ({body}, res) => {
    return findSwapOutpoint({
      network: body.network,
      redeem_script: body.redeem_script,
    },
    returnJson({log, res}));
  });

  // POST a new swap
  router.post('/swaps/', ({body}, res) => {
    return createSwap({
      cache,
      invoice: body.invoice,
      network: body.network,
      refund: body.refund,
    },
    returnJson({log, res}));
  });

  // POST a swap check request
  router.post('/swaps/check', ({body, params}, res) => {
    return checkSwapStatus({
      cache,
      invoice: body.invoice,
      network: body.network,
      script: body.redeem_script,
    },
    returnJson({log, res}));
  });

  return router;
};

