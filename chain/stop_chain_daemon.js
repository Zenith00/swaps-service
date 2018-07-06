const chainRpc = require('./call_chain_rpc');

const {stop} = require('./conf/rpc_commands');

/** Stop the chain daemon

  {
    network: <Network Name String>
  }
*/
module.exports = ({network}, cbk) => {
  // return chainRpc({network, cmd: ""}, cbk);
  // return chainRpc({network, cmd: stop}, (err, res) => {
  //   console.log(err);
  //   console.log(res);
  //   return cbk(err, res);
  // }
  // );

  return chainRpc({network, cmd: stop}, cbk);
};

