import test from 'ava'
import * as pino from 'pino'

import { rewriteAssetUrls } from '../process-assets'

const nullLogger = pino({ level: 'silent' })
const makeMockAsset = (file: any): any => ({
  sys: {
    id: 'asset',
    space: {
      sys: {
        id: 'space'
      },
    },
  },
  fields: {
    file
  }
})

test('empty locales list', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: '//images.ctfassets.net/space/asset/nonce/hello.png'
    },
    'es-US': {
      details: {},
      url: '//images.ctfassets.net/space/asset/nonce/hola.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, [])
})

test('differing asset ids', t => {
  const asset = makeMockAsset({
    'es-ES': {
      details: {},
      url: '//images.ctfassets.net/space/asset1/nonce/oye.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, ['es-ES'])
})

test('differing space ids', t => {
  const asset = makeMockAsset({
    'es-ES': {
      details: {},
      url: '//images.ctfassets.net/space1/asset/nonce/oye.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, ['es-ES'])
})

test('mix of locales for reprocessing correctly', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: '//images.ctfassets.net/space/asset1/nonce/hello.png'
    },
    'es-US': {
      details: {},
      url: '//images.ctfassets.net/space/asset/nonce/hola.png'
    },
    'es-ES': {
      details: {},
      url: '//images.ctfassets.net/space1/asset/nonce/oye.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, ['en-US', 'es-ES'])
})

test('clears the details on all file fields, regardless of processing', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: '//images.ctfassets.net/space/asset1/nonce/hello.png'
    },
    'es-US': {
      details: {},
      url: 'https://images.ctfassets.net/space/asset/nonce/hola.png'
    },
  })

  rewriteAssetUrls(asset, nullLogger)
  t.is(asset.fields.file['en-US'].details, undefined)
  t.is(asset.fields.file['es-US'].details, undefined)
})

test('handling of assets with an upload attribute', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      upload: 'http://images.ctfassets.net/space1/asset/nonce/hello.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, [])
  t.deepEqual(asset.fields.file['en-US'], {
    upload: 'http://images.ctfassets.net/space1/asset/nonce/hello.png'
  })
})

test('handling of assets with malformed url', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: 'http://images.ctfassets.net/space1/nonce/hello.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, [])
  t.deepEqual(asset.fields.file['en-US'], {
    url: 'http://images.ctfassets.net/space1/nonce/hello.png'
  })
})

test('handling of urls with http prefix', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: 'http://images.ctfassets.net/space1/asset/nonce/hello.png'
    },
  })

  rewriteAssetUrls(asset, nullLogger)
  t.is(asset.fields.file['en-US'].upload, 'http://images.ctfassets.net/space1/asset/nonce/hello.png')
  t.is(asset.fields.file['en-US'].url, undefined)
  t.is(asset.fields.file['en-US'].details, undefined)
})

test('handling of urls with https prefix', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: 'https://images.ctfassets.net/space1/asset/nonce/hello.png'
    },
  })

  rewriteAssetUrls(asset, nullLogger)
  t.is(asset.fields.file['en-US'].upload, 'https://images.ctfassets.net/space1/asset/nonce/hello.png')
  t.is(asset.fields.file['en-US'].url, undefined)
  t.is(asset.fields.file['en-US'].details, undefined)
})

test('handling of urls without https prefix', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: '//images.ctfassets.net/space1/asset/nonce/hello.png'
    },
  })

  rewriteAssetUrls(asset, nullLogger)
  t.is(asset.fields.file['en-US'].upload, 'https://images.ctfassets.net/space1/asset/nonce/hello.png')
  t.is(asset.fields.file['en-US'].url, undefined)
  t.is(asset.fields.file['en-US'].details, undefined)
})

test('mix of asset files', t => {
  const asset = makeMockAsset({
    'en-US': {
      details: {},
      url: 'https://images.ctfassets.net/space/asset/nonce/hello.png'
    },
    'en-AU': {
      details: {},
      url: '//images.ctfassets.net/space/asset/nonce/gdaymate.png'
    },
    'en-UK': {
      details: {},
      url: '//images.ctfassets.net/space1/asset/nonce/hello.png'
    },
    'es-US': {
      details: {},
      url: 'https://images.ctfassets.net/space/asset1/nonce/hola.png'
    },
  })

  const locales = rewriteAssetUrls(asset, nullLogger)
  t.deepEqual(locales, ['en-UK', 'es-US'])
  t.deepEqual(asset.fields.file['en-US'], {
    url: 'https://images.ctfassets.net/space/asset/nonce/hello.png'
  })
  t.deepEqual(asset.fields.file['en-AU'], {
    url: '//images.ctfassets.net/space/asset/nonce/gdaymate.png'
  })
  t.deepEqual(asset.fields.file['en-UK'], {
    upload: 'https://images.ctfassets.net/space1/asset/nonce/hello.png'
  })
  t.deepEqual(asset.fields.file['es-US'], {
    upload: 'https://images.ctfassets.net/space/asset1/nonce/hola.png'
  })
})
