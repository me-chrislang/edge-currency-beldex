/**
 * Created by paul on 8/8/17.
 */
// @flow

import { bns } from 'biggystring'
import {
  type EdgeCorePluginOptions,
  type EdgeCurrencyEngine,
  type EdgeCurrencyEngineOptions,
  type EdgeCurrencyPlugin,
  type EdgeCurrencyTools,
  type EdgeEncodeUri,
  type EdgeIo,
  type EdgeLog,
  type EdgeParsedUri,
  type EdgeWalletInfo
} from 'edge-core-js/types'
import { initBeldex } from 'beldex-core-js'
import { parse, serialize } from 'uri-js'

import { BeldexEngine } from './bdxEngine.js'
import { currencyInfo } from './bdxInfo.js'
import { DATA_STORE_FILE, WalletLocalData } from './bdxTypes.js'

type InitOptions = {
  apiKey: string
}

function getDenomInfo(denom: string) {
  return currencyInfo.denominations.find(element => {
    return element.name === denom
  })
}

function getParameterByName(param, url) {
  const name = param.replace(/[[\]]/g, '\\$&')
  const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)')
  const results = regex.exec(url)
  if (!results) return null
  if (!results[2]) return ''
  return decodeURIComponent(results[2].replace(/\+/g, ' '))
}

async function makeBeldexTools(
  io: EdgeIo,
  log: EdgeLog,
  initOptions: InitOptions
): Promise<EdgeCurrencyTools> {
  const {BeldexApi} = await initBeldex()
  log(`Creating Currency Plugin for beldex`)
  const options = {
    appUserAgentProduct: 'tester',
    appUserAgentVersion: '0.0.1',
    apiKey: initOptions.apiKey,
    apiServer: 'https://edge.beldex.io',
    fetch: io.fetch,
    randomBytes: io.random
  }
  const beldexApi = new BeldexApi(options)

  const beldexPlugin: EdgeCurrencyTools = {
    pluginName: 'beldex',
    currencyInfo,
    beldexApi,

    createPrivateKey: async (walletType: string) => {
      const type = walletType.replace('wallet:', '')

      if (type === 'beldex') {
        const result = await beldexApi.createWallet()
        return {
          beldexKey: result.mnemonic,
          beldexSpendKeyPrivate: result.beldexSpendKeyPrivate,
          beldexSpendKeyPublic: result.beldexSpendKeyPublic
        }
      } else {
        throw new Error('InvalidWalletType')
      }
    },

    derivePublicKey: async (walletInfo: EdgeWalletInfo) => {
      const type = walletInfo.type.replace('wallet:', '')
      if (type === 'beldex') {
        const result = await beldexApi.createWalletFromMnemonic(
          walletInfo.keys.beldexKey
        )
        return {
          beldexAddress: result.beldexAddress,
          beldexViewKeyPrivate: result.beldexViewKeyPrivate,
          beldexViewKeyPublic: result.beldexViewKeyPublic,
          beldexSpendKeyPublic: result.beldexSpendKeyPublic
        }
      } else {
        throw new Error('InvalidWalletType')
      }
    },

    parseUri: async (uri: string): Promise<EdgeParsedUri> => {
      const parsedUri = parse(uri)
      let address: string
      let nativeAmount: string | null = null
      let currencyCode: string | null = null

      if (
        typeof parsedUri.scheme !== 'undefined' &&
        parsedUri.scheme !== 'beldex'
      ) {
        throw new Error('InvalidUriError') // possibly scanning wrong crypto type
      }
      if (typeof parsedUri.host !== 'undefined') {
        address = parsedUri.host
      } else if (typeof parsedUri.path !== 'undefined') {
        address = parsedUri.path
      } else {
        throw new Error('InvalidUriError')
      }
      address = address.replace('/', '') // Remove any slashes

      try {
        // verify address is decodable for currency
        const result = await beldexApi.decodeAddress(address)
        if (result.err_msg === 'Invalid address') {
          throw new Error('InvalidUriError')
        }
      } catch (e) {
        throw new Error('InvalidPublicAddressError')
      }

      const amountStr = getParameterByName('amount', uri)
      if (amountStr && typeof amountStr === 'string') {
        const denom = getDenomInfo('BDX')
        if (!denom) {
          throw new Error('InternalErrorInvalidCurrencyCode')
        }
        nativeAmount = bns.mul(amountStr, denom.multiplier)
        nativeAmount = bns.toFixed(nativeAmount, 0, 0)
        currencyCode = 'BDX'
      }
      const uniqueIdentifier = getParameterByName('tx_payment_id', uri)
      const label = getParameterByName('label', uri)
      const message = getParameterByName('message', uri)
      const category = getParameterByName('category', uri)

      const edgeParsedUri: EdgeParsedUri = {
        publicAddress: address
      }
      if (nativeAmount) {
        edgeParsedUri.nativeAmount = nativeAmount
      }
      if (currencyCode) {
        edgeParsedUri.currencyCode = currencyCode
      }
      if (uniqueIdentifier) {
        edgeParsedUri.uniqueIdentifier = uniqueIdentifier
      }
      if (label || message || category) {
        edgeParsedUri.metadata = {}
        if (label) {
          edgeParsedUri.metadata.name = label
        }
        if (message) {
          edgeParsedUri.metadata.notes = message
        }
        if (category) {
          edgeParsedUri.metadata.category = category
        }
      }

      return edgeParsedUri
    },

    encodeUri: async (obj: EdgeEncodeUri): Promise<string> => {
      if (!obj.publicAddress) {
        throw new Error('InvalidPublicAddressError')
      }
      try {
        const result = await beldexApi.decodeAddress(obj.publicAddress)
        if (result.err_msg === 'Invalid address') {
          throw new Error('InvalidUriError')
        }
      } catch (e) {
        throw new Error('InvalidPublicAddressError')
      }
      if (!obj.nativeAmount && !obj.label && !obj.message) {
        return obj.publicAddress
      } else {
        let queryString: string = ''

        if (typeof obj.nativeAmount === 'string') {
          const currencyCode: string = 'BDX'
          const nativeAmount: string = obj.nativeAmount
          const denom = getDenomInfo(currencyCode)
          if (!denom) {
            throw new Error('InternalErrorInvalidCurrencyCode')
          }
          const amount = bns.div(nativeAmount, denom.multiplier, 12)

          queryString += 'amount=' + amount + '&'
        }
        if (typeof obj.label === 'string') {
          queryString += 'label=' + obj.label + '&'
        }
        if (typeof obj.message === 'string') {
          queryString += 'message=' + obj.message + '&'
        }
        queryString = queryString.substr(0, queryString.length - 1)

        const serializeObj = {
          scheme: 'beldex',
          path: obj.publicAddress,
          query: queryString
        }
        const url = serialize(serializeObj)
        return url
      }
    }
  }

  return beldexPlugin
}

export function makeBeldexPlugin(
  opts: EdgeCorePluginOptions
): EdgeCurrencyPlugin {
  const { io, nativeIo, initOptions = { apiKey: '' } } = opts
  if (nativeIo['edge-currency-beldex']) {
    const { callBeldex } = nativeIo['edge-currency-beldex']
    global.beldexCore = { methodByString: callBeldex }
  }

  let toolsPromise: Promise<EdgeCurrencyTools>
  function makeCurrencyTools(): Promise<EdgeCurrencyTools> {
    if (toolsPromise != null) return toolsPromise
    toolsPromise = makeBeldexTools(io, opts.log, initOptions)
    return toolsPromise
  }

  async function makeCurrencyEngine(
    walletInfo: EdgeWalletInfo,
    opts: EdgeCurrencyEngineOptions
  ): Promise<EdgeCurrencyEngine> {
    const tools: EdgeCurrencyTools = await makeCurrencyTools()
    const beldexEngine = new BeldexEngine(
      tools,
      io,
      walletInfo,
      // $FlowFixMe
      tools.beldexApi,
      opts
    )
    await beldexEngine.init()
    try {
      const result = await beldexEngine.walletLocalDisklet.getText(
        DATA_STORE_FILE
      )
      beldexEngine.walletLocalData = new WalletLocalData(result)
      beldexEngine.walletLocalData.beldexAddress =
        beldexEngine.walletInfo.keys.beldexAddress
      beldexEngine.walletLocalData.beldexViewKeyPrivate =
        beldexEngine.walletInfo.keys.beldexViewKeyPrivate
      beldexEngine.walletLocalData.beldexViewKeyPublic =
        beldexEngine.walletInfo.keys.beldexViewKeyPublic
      beldexEngine.walletLocalData.beldexSpendKeyPublic =
        beldexEngine.walletInfo.keys.beldexSpendKeyPublic
    } catch (err) {
      try {
        opts.log('No walletLocalData setup yet: Failure is ok')
        beldexEngine.walletLocalData = new WalletLocalData(null)
        beldexEngine.walletLocalData.beldexAddress =
          beldexEngine.walletInfo.keys.beldexAddress
        beldexEngine.walletLocalData.beldexViewKeyPrivate =
          beldexEngine.walletInfo.keys.beldexViewKeyPrivate
        beldexEngine.walletLocalData.beldexViewKeyPublic =
          beldexEngine.walletInfo.keys.beldexViewKeyPublic
        beldexEngine.walletLocalData.beldexSpendKeyPublic =
          beldexEngine.walletInfo.keys.beldexSpendKeyPublic
        await beldexEngine.walletLocalDisklet.setText(
          DATA_STORE_FILE,
          JSON.stringify(beldexEngine.walletLocalData)
        )
      } catch (e) {
        opts.log.error(
          'Error writing to localDataStore. Engine not started:' + e
        )
      }
    }

    const out: EdgeCurrencyEngine = beldexEngine
    return out
  }

  return {
    currencyInfo,
    makeCurrencyEngine,
    makeCurrencyTools
  }
}
