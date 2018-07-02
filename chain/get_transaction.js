const chainRpc = require('./call_chain_rpc');
const {getRawTransaction} = require('./conf/rpc_commands');

/** Get a raw transaction

  {
    id: <Transaction Id String>
    network: <Network Name String>
  }

  @returns via cbk
  {
    [transaction]: <Transaction Hex String>
  }
*/
module.exports = ({id, network}, cbk) => {
  if (!id) {
    return cbk([500, 'ExpectedIdForTransaction']);
  }

  if (!network) {
    return cbk([500, 'ExpectedNetworkToLookForTransaction']);
  }

  return chainRpc({
    network,
    cmd: getRawTransaction,
    params: [id],
  },
  (err, transaction) => {
    console.log("Ran gettrans");
    if (!!err) {
      return cbk(err);
    }

    if (!transaction){
      console.log("init gettrans failed");
      return chainRpc({
          network,
          cmd: "decoderawtransaction",
          params: [id],
        },
        (err, transaction) => {
        console.log("Backup: "  + transaction);
          if (!!err) {
            return cbk(err);
          }

          return cbk(null, {transaction});
        });
    }

    return cbk(null, {transaction});
  });
};

