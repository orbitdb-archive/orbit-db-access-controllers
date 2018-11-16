'use strict'

const isValidEthAddress = (web3, address) => {
  return web3.utils.isAddress(address)
}
module.exports = isValidEthAddress
