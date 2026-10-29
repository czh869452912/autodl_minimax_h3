// Only the candidate DeepAgents binary-offload callsite is eligible for this shim.
const CryptoJS = require('crypto-js');
exports.createHash = algorithm => {
  if (algorithm !== 'sha256') throw new Error('Unsupported hash algorithm');
  const hash = CryptoJS.algo.SHA256.create();
  let finished = false;
  const api = {
    update(input) {
      if (finished) throw new Error('Hash already finalized');
      if (typeof input === 'string') hash.update(input);
      else {
        if (!(input instanceof Uint8Array)) throw new Error('Expected Uint8Array');
        const words = [];
        for (let i = 0; i < input.length; i++) words[i >>> 2] = (words[i >>> 2] || 0) | input[i] << (24 - i % 4 * 8);
        hash.update(CryptoJS.lib.WordArray.create(words, input.length));
      }
      return api;
    },
    digest(encoding) {
      if (finished || encoding !== 'hex') throw new Error('Expected one hexadecimal digest');
      finished = true; return hash.finalize().toString(CryptoJS.enc.Hex);
    },
  };
  return api;
};
