const {test} = require('tap');

const {refundSuccess} = require('../macros/index');

[false, true].forEach(isRefundToPublicKeyHash => {
  test(`p2sh p2wsh refund test: is pkhash? ${isRefundToPublicKeyHash}`, t => {
    return refundSuccess({
      is_refund_to_public_key_hash: isRefundToPublicKeyHash,
      network: 'core_regtest',
      swap_type: 'p2sh_p2wsh',
    },
    err => {
      if (!!err) {
        console.log(err);
        throw new Error('FailedRefundSuccess');
      }

      t.end();

      return;
    });
  });
});

