import CryptoJS from 'crypto-js';

export const createId = () => CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
