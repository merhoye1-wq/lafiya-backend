const mtnMomo = require('./mtnMomo');
const orangeMoney = require('./orangeMoney');

function adapterFor(method) {
  if (method === 'momo') return mtnMomo;
  if (method === 'orange') return orangeMoney;
  throw new Error(`Unsupported mobile money method: ${method}`);
}

module.exports = { adapterFor, mtnMomo, orangeMoney };
