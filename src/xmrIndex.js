// @flow

import 'regenerator-runtime/runtime'

import { makeMoneroPlugin } from './xmrPlugin.js'

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
