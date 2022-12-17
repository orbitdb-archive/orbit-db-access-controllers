export default (web3, address) => {
  return web3.utils.isAddress(address)
}
