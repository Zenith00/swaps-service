const isPublicKeyHashSpend = require('./is_pkhash_spend');
const isSwapSpend = require('./is_swap_spend');
const scriptElements = require('./script_elements');
const {Transaction} = require('./../tokenslib');

const preimageByteLength = 32;

/** Given a raw transaction, return the inputs that appear to be resolutions of
  swaps. That means that they are inputs to a refund transaction or a claim
  transaction.

  {
    inputs: [{
      hash: <Internal Byte Order Transaction Id Buffer>
      index: <Spending Outpoint Vin Number>
      script: <Script Signature Buffer>
      witness: [<Witness Stack Item Buffer>]
    }]
    network: <Network Type String>
  }

  @returns
  {
    resolutions: [{
      outpoint: <Outpoint Hex String>
      [preimage]: <Preimage Hex String> // null when refund
      script: <Redeem Script Hex String>
      type: <Type String> 'claim|refund'
    }]
  }
*/
module.exports = ({inputs, network}) => {
  // Find inputs that appear to be swap spends.
  const resolutions = inputs
    .filter(({script, witness}) => !isPublicKeyHashSpend({script, witness}))
    .filter(({script, witness}) => isSwapSpend({network, script, witness}))
    .map(({hash, index, script, witness}) => {
      const elements = scriptElements({script, witness});

      const redeem = !!witness && !witness.length ? elements[2] : elements[0];
      const secret = elements[1];

      const isClaim = secret.length === preimageByteLength;

      return {
        outpoint: `${hash.reverse().toString('hex')}:${index}`,
        preimage: isClaim ? secret.toString('hex') : null,
        script: redeem.toString('hex'),
        type: isClaim ? 'claim' : 'refund',
      };
    });

  return {resolutions};
};

