const {address} = require('./../tokenslib');
const {crypto} = require('./../tokenslib');
const {networks} = require('./../tokenslib');
const pkSwapScript = require('./pk_swap_script');
const pkHashSwapScript = require('./pkhash_swap_script');
const {script} = require('./../tokenslib');

const {fromOutputScript} = address;
const encodeScriptHash = script.scriptHash.output.encode;
const {hash160} = crypto;
const {sha256} = crypto;
const {witnessScriptHash} = script;

/** Derive a chain swap address for a swap

  @param
  {
    destination_public_key: <Destination Public Key Serialized String>
    network: <Network Name String>
    payment_hash: <Payment Hash String>
    [refund_public_key]: <Refund Public Key Serialized String>
    [refund_public_key_hash]: <Refund Public Key Hash Hex String>
    timeout_block_height: <Swap Expiration Date Number>
  }

  @throws
  <Error> on chain address creation failure

  @returns
  {
    p2sh_address: <Legacy P2SH Base58 Address String>
    p2sh_output_script: <Legacy P2SH Output Script Hex String>
    p2sh_p2wsh_output_script: <P2SH Nested Output Script Hex String>
    p2sh_p2wsh_address: <Nested Pay to Witness Script Address String>
    p2wsh_address: <Pay to Witness Script Hash Address String>
    redeem_script: <Redeem Script Hex String>
    witness_output_script: <Witness Output Script Hex String>
  }
*/
module.exports = args => {
  console.log("Swap address starting");
  if (!args.network || !networks[args.network]) {
    throw new Error('ExpectedKnownNetworkForSwapAddress');
  }

  const network = networks[args.network];
  let redeemScriptHex;

  if (!!args.refund_public_key) {
    redeemScriptHex = pkSwapScript({
      destination_public_key: args.destination_public_key,
      payment_hash: args.payment_hash,
      refund_public_key: args.refund_public_key,
      timeout_block_height: args.timeout_block_height,
    });
  } else if (!!args.refund_public_key_hash) {
    redeemScriptHex = pkHashSwapScript({
      destination_public_key: args.destination_public_key,
      payment_hash: args.payment_hash,
      refund_public_key_hash: args.refund_public_key_hash,
      timeout_block_height: args.timeout_block_height,
    });
  } else {
    throw new Error('ExpectedRefundKey');
  }

  const redeemScript = Buffer.from(redeemScriptHex, 'hex');

  // Legacy P2SH output script
  const p2shLegacyOutput = encodeScriptHash(hash160(redeemScript));

  // The witness program is part of the scriptPub: "pay to this script hash"
  const witnessProgram = witnessScriptHash.output.encode(sha256(redeemScript));

  // When wrapping for legacy p2sh, the program is hashed more and with RIPE160
  const p2shWrappedWitnessProgram = encodeScriptHash(hash160(witnessProgram));

  const p2shNestedAddr = fromOutputScript(p2shWrappedWitnessProgram, network);
  console.log("swap address ending");
  console.log(fromOutputScript(p2shLegacyOutput, network));
  console.log(p2shWrappedWitnessProgram.toString('hex'));
  console.log(p2shNestedAddr);
  console.log(" ");
  console.log(fromOutputScript(witnessProgram, network));
  console.log(redeemScriptHex.toString('hex'));
  console.log(witnessProgram.toString('hex'));
  return {
    p2sh_address: fromOutputScript(p2shLegacyOutput, network),
    p2sh_output_script: p2shLegacyOutput.toString('hex'),
    p2sh_p2wsh_output_script: p2shWrappedWitnessProgram.toString('hex'),
    p2sh_p2wsh_address: p2shNestedAddr,
    p2wsh_address: fromOutputScript(witnessProgram, network),
    redeem_script: redeemScriptHex.toString('hex'),
    witness_output_script: witnessProgram.toString('hex'),
  };
};

