const {lightningDaemon} = require('ln-service');
const {subscribeToInvoices} = require('ln-service');

const daemons = {};

/** Get the Lightning Network Daemon connection.

  {
    network: <Network Name String>
  }

  @throws
  <Error> when daemon credentials are not available

  @returns
  <LND GRPC API Object>
*/
module.exports = ({network}) => {
  console.log("Initiating LND on network");
  console.log(network);
  if (!network) {
    throw new Error('ExpectedNetworkForLightningDaemon');
  }

  if (daemons[network] && daemons[network].lnd) {
    return daemons[network].lnd;
  }

  let lnd;
  const networkName = network.toUpperCase();

  const cert = process.env[`SSS_LND_${networkName}_TLS_CERT`];
  const host = process.env[`SSS_LND_${networkName}_GRPC_HOST`];
  const macaroon = process.env[`SSS_LND_${networkName}_MACAROON`];

  if (!cert) {
    throw new Error('ExpectedDaemonCert');
  }

  if (!host) {
    throw new Error('ExpectedDaemonHost');
  }

  if (!macaroon) {
    throw new Error('ExpectedDaemonMacaroon');
  }

  try {
    console.log("FINAL INIT LND");
    console.log(host);
    console.log(cert);
    console.log(macaroon)
    lnd = lightningDaemon({cert, host, macaroon});
  } catch (err) {
    console.log("LIGHTNING DAEMON FAILED TO INSTANTIATE")
    console.log(err);
    throw new Error('FailedToInstantiateDaemon');
  }
  console.log("So far so good LND!!!")
  const sub = subscribeToInvoices({lnd});

  daemons[network] = {lnd, sub};

  // Clear daemon cache on errors or end of subscription
  // This subscription allows opportunistic reconnecting on remote restarts.
  daemons[network].sub.on('end', () => daemons[network] = null);
  daemons[network].sub.on('error', ({}) => daemons[network] = null);

  return lnd;
};

