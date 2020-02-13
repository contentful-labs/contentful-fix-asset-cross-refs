import test from 'ava'
import * as pino from 'pino'

import { processAsset } from '../process-assets'

const logger = pino({ level: 'silent' })

class MockAsset {
  public sys: any
  public fields: any

  constructor({ file, version = 1, publishedVersion, archivedVersion }: { file: any, version?: number, publishedVersion?: number, archivedVersion?: number }) {
    this.sys = {
      id: 'asset',
      space: {
        sys: {
          id: 'space',
        },
      },
      publishedVersion,
      archivedVersion,
      version,
    }
    this.fields = { file }
  }

  isDraft() { return this.sys.publishedVersion === undefined }

  isUpdated() { return this.sys.publishedVersion === undefined || (this.sys.version - this.sys.publishedVersion) > 1 }

  isPublished() { return !this.isDraft() }

  isArchived() { return this.sys.archivedVersion !== undefined }

  unarchive() {
    if (!this.isArchived()) { throw new Error('Cannot unarchive a non-archived asset') }

    delete this.sys.archivedVersion
    ++this.sys.version
    return Promise.resolve(this)
  }

  archive() {
    if (this.isPublished()) { throw new Error('Cannot archive a published asset') }

    this.sys.archivedVersion = this.sys.version
    ++this.sys.version
    return Promise.resolve(this)
  }

  update() {
    if (this.isArchived()) { throw new Error('Cannot update archived asset') }

    ++this.sys.version
    return Promise.resolve(this)
  }

  publish() {
    if (this.isArchived()) { throw new Error('Cannot publish archived asset') }
    if (!this.isUpdated()) { throw new Error('Nothing to publish') }

    for (const [_locale, file] of Object.entries(this.fields.file as { [k: string]: any})) {
      if (file.upload || !file.url) {
        throw new Error('Cannot publish a file with non-processed assets')
      }
    }

    this.sys.publishedVersion = this.sys.version
    ++this.sys.version
    return Promise.resolve(this)
  }

  processForLocale(locale: string) {
    if (this.isArchived()) { throw new Error('Cannot processForLocale archived asset') }

    const file = this.fields.file[locale]
    if (!file) {
      throw new Error('Missing locale')
    }
    if (!file.upload) {
      throw new Error('Nothing to process')
    }
    file.url = `//images.ctfassets.net/${this.sys.space.sys.id}/${this.sys.id}/nonce/file.png`
    delete file.upload
    ++this.sys.version
    return Promise.resolve(this)
  }
}

test('does not crash if the file is null', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': null,
    },
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  // no update
  t.is(asset.sys.version, 1)
})

test('does not update assets that need no update', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset/nonce/no-cross-ref.png'
      }
    },
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  // no update
  t.is(asset.sys.version, 1)
})

test('updating but not publishing an unpublished asset', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset.isPublished())
})

test('publishing an updated asset with no pending changes and multiple locales', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      },
      'en-UK': {
        url: '//images.ctfassets.net/space1/asset/nonce/space-id-cross-ref.png'
      }
    },
    version: 2,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.is(asset.fields.file['en-UK'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset.isPublished())
  t.false(asset.isUpdated())
})

test('publishing an updated asset with no pending changes', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 2,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset.isPublished())
  t.false(asset.isUpdated())
})

test('updating but not publishing updated asset with pending changes', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.is(asset.sys.publishedVersion, 1)
  t.true(asset.isUpdated())
})

test('updating and publishing an asset with pending changes when forceRepublish is true', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: true, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset.isUpdated())
  t.true(asset.isPublished())
})

test('not publishing an asset if unpublished but forcePublish is true', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: true, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset.isPublished())
})

test('does nothing when dryRun is true', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 1,
    publishedVersion: 2,
  })

  await processAsset({ asset, opts: { processArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: true }, logger })
  t.is(asset.sys.version, 1)
  t.is(asset.sys.publishedVersion, 2)
})

test('does nothing when dryRun is true for archived assets', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    archivedVersion: 2
  })

  await processAsset({ asset, opts: { processArchived: true, processingAttempts: 3, forceRepublish: false, dryRun: true }, logger })
  t.is(asset.sys.version, 3)
  t.is(asset.sys.archivedVersion, 2)
})

test('unarchives and rearchives if processArchived is true ', async t => {
  const asset: any = new MockAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    archivedVersion: 2
  })

  await processAsset({ asset, opts: { processArchived: true, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset.isArchived())
})
