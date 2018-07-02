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
  console.log("getting trans with: " + id);
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

      if (!transaction) {
        console.log("init gettrans failed");
        var start = new Date().getTime();
        var end = start;
        while (end < start + 10000) {
          end = new Date().getTime();
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
          return cbk(null, {transaction});
        })
        }
      return cbk(null, {transaction});
    });
};

