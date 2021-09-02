// @flow

import 'regenerator-runtime/runtime'

import { makeBeldexPlugin } from './bdxPlugin.js'

const edgeCorePlugins = {
  beldex: makeBeldexPlugin
}

export default edgeCorePlugins

if (
  typeof window !== 'undefined' &&
  typeof window.addEdgeCorePlugins === 'function'
) {
  window.addEdgeCorePlugins(edgeCorePlugins)
}
