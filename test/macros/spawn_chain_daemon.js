const removeDir = require('rimraf');
const {spawn} = require('child_process');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const commandExists = require('command-exists').sync;
const chainServer = require('./../../chain/conf/chain_server_defaults');
const credentialsForNetwork = require('./../../chain/credentials_for_network');
const {ECPair} = require('./../../tokenslib');
const errCode = require('./../../chain/conf/error_codes');
const {networks} = require('./../../tokenslib');

const {fromPublicKeyBuffer} = ECPair;
const rpcServerReady = /RPC.server.listening/;
const unableToStartServer = /Unable.to.start.server/;

/** Spawn a chain daemon for testing on regtest

  This method will also listen for uncaught exceptions and stop the daemon
  before the process dies.

  {
    mining_public_key: <Mining Public Key Hex String>
    network: <Network Name String>
  }

  @returns via cbk
  {
    is_ready: <Chain Daemon is Ready Bool>
  }
*/
module.exports = (args, cbk) => {
  if (!args.mining_public_key) {
    return cbk([400, 'ExpectedPublicKeyForMiningRewardsPayout']);
  }

  if (!args.network) {
    return cbk([400, 'ExpectedNetworkTypeForChainDaemon']);
  }

  let credentials;

  try {
    credentials = credentialsForNetwork({network: args.network});
  } catch (e) {
    return cbk([500, 'CredentialsLookupFailure', e]);
  }

  const miningKey = Buffer.from(args.mining_public_key, 'hex');
  const network = networks[args.network];
  const tmpDir = `/tmp/${uuidv4()}`;

  let executable;
  console.log("tmpDir=" + tmpDir);

  console.log("Looking for chain server for" + chainServer);
  executable =  chainServer[args.network].executables.find( function(x){return commandExists(x);});
  console.log("Located executable: " + executable);
  var daemon;
  switch(executable){
    case "btcd":
      daemon = spawn(executable, [
        '--datadir', tmpDir,
        '--logdir', tmpDir,
        '--miningaddr', fromPublicKeyBuffer(miningKey, network).getAddress(),
        '--notls',
        '--regtest',
        '--relaynonstd',
        '--rpclisten', `${credentials.host}:${credentials.port}`,
        '--rpcpass', credentials.pass,
        '--rpcuser', credentials.user,
        '--txindex',
      ]);
      console.log("daemon spawned");
      // console.log(
      // daemon.stdin);
      break;
    case "bitcoind":
      console.log("Exists?: " + fs.existsSync(tmpDir));
      fs.mkdirSync(tmpDir);

      daemon = spawn(executable, [
        `-datadir=${tmpDir}`,
        '-debuglogfile=debug.log',
        // '--miningaddr', fromPublicKeyBuffer(miningKey, network).getAddress(),
        // '--notls',
        '-regtest=1',
        // '--relaynonstd',
        `-rpcport=${credentials.port}`,
        `-rpcpassword=${credentials.pass}`,
        `-rpcuser=${credentials.user}`,
        '-txindex=1',
        // '-server',
      ]);
      console.log("daemon spawned");
      break;
  }

  console.log("daemon spawned");

  console.log(daemon.connected);
  // console.log(daemon);
  console.log(daemon.pid);

  daemon.stderr.on('data', data => console.log(`p1p:${data}`));
  
  daemon.stdout.on('data', data => {
    if (unableToStartServer.test(`${data}`)) {
      return cbk([errCode.local_err, 'SpawnDaemonFailure']);
    }

    if (rpcServerReady.test(`${data}`)) {
      return cbk(null, {is_ready: true});
    }

    return;
  });

  daemon.on('close', code => removeDir(tmpDir, () => {}));

  process.on('uncaughtException', err => {
    console.log('CHAIN ERROR', err);
    daemon.kill();
    process.exit(1)
  });

  return;
};

