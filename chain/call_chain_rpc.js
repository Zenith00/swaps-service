const chainQueue = require('./chain_queue');

/** Call the chain RPC but in a way that will be queued

  {
    cmd: <Chain RPC Command String>
    network: <Network Name String>
    [params]: <RPC Arguments Array>
  }

  @returns via cbk
  <Result Object>
*/
module.exports = ({cmd, network, params}, cbk) => {
  let cbk2 = function(){
    setTimeout(function(){return cbk }, 100);
  };
  return chainQueue({}).push({cmd, network, params}, cbk2);
};

