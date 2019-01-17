'use strict'

const getEntryKey = (e) => e.v === 0 ? e.key : e.identity.publicKey

module.exports = getEntryKey
