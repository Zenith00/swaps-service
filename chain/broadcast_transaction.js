const chainRpc = require('./call_chain_rpc');

const {sendRawTransaction} = require('./conf/rpc_commands');

/** Broadcast a transaction

  {
    network: <Network Name String>
    transaction: <Transaction Hex String>
  }

  @returns via cbk
  {
    id: <Transaction Id Hex String>
  }
*/
module.exports = ({network, transaction}, cbk) => {
  const cmd = sendRawTransaction;
  const params = transaction;
  console.log(`broadcast_transaction called on network ${network} for transaction ${transaction} `);
  return chainRpc({cmd, network, params}, (err, id) => {
    console.log(`broadcast_transaction chain_rpc called on network ${network} with cmd ${cmd} with params ${params}`)
    if (!!err) {
      return cbk(err);
    }
    console.log(`broadcast_transaction rpc callback returned with error ${err} and id ${id}`);
    // console.log("Error? " + err);
    // console.log("transaction id: " + id);
    // Exit early when a transaction id was not returned, indicating failure.
    if (!id) {
      return cbk([503, 'TransactionBroadcastFailed', transaction]);
    }
    console.log("complete");
    return cbk(null, {id});
  });
};

