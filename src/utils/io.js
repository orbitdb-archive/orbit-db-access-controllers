import * as io from 'orbit-db-io'

const read = async (ipfs, cid, options = {}) => {
  const access = await io.read(ipfs, cid, options)
  return (typeof access.write === 'string') ? JSON.parse(access.write) : access.write // v0 access.write not stringified
}

const write = io.write

export {
  read,
  write
}
