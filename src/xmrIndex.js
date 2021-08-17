// @flow

import 'regenerator-runtime/runtime'

import { makeMoneroPlugin } from './xmrPlugin.js'

console.log('from node_modules in initial call beldex src')
const edgeCorePlugins = {
  beldex: makeMoneroPlugin
}

export default edgeCorePlugins

if (
  typeof window !== 'undefined' &&
  typeof window.addEdgeCorePlugins === 'function'
) {
  window.addEdgeCorePlugins(edgeCorePlugins)
}
