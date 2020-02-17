import test from 'ava'
import * as rfdc from 'rfdc'
import * as pino from 'pino'

import { processAsset } from '../process-assets'

const clone = rfdc()
const logger = pino({ level: 'silent' })

function makeAsset({ file, version = 1, publishedVersion, archivedVersion }: { file: any, version?: number, publishedVersion?: number, archivedVersion?: number }): any {
  return new ClientAsset(new ServerAsset({
    sys: {
      id: 'asset',
      space: {
        sys: {
          id: 'space',
        },
      },
      publishedVersion,
      archivedVersion,
      version,
    },
    fields: { file }
  }))
}

// In order to really emulate things and properly test behavior we need to have
// client and server-side emulation of assets, where the two can drift, etc.
class ClientAsset {
  public sys: any
  public fields: any
  public _server: any

  constructor(_server: ServerAsset) {
    Object.defineProperty(this, '_server', {
      enumerable: false,
      value: _server
    })
    this.sys = clone(_server.sys)
    this.fields = clone(_server.fields)
  }

  isDraft() { return this.sys.publishedVersion === undefined }

  isUpdated() { return this.sys.publishedVersion === undefined || (this.sys.version - this.sys.publishedVersion) > 1 }

  isPublished() { return !this.isDraft() }

  isArchived() { return this.sys.archivedVersion !== undefined }

  async archive() {
    return new ClientAsset(await this._server.archive(this.sys.version))
  }

  async unarchive() {
    return new ClientAsset(await this._server.unarchive(this.sys.version))
  }

  async update() {
    return new ClientAsset(await this._server.update(this.sys.version, this.fields))
  }

  async publish() {
    return new ClientAsset(await this._server.publish(this.sys.version))
  }

  async processForLocale(locale: string) {
    return new ClientAsset(await this._server.processForLocale(this.sys.version, locale))
  }
}

class ServerAsset {
  public sys: any
  public fields: any

  constructor({ sys, fields }: { sys: any, fields: any }) {
    this.sys = sys
    this.fields = fields
  }

  isDraft() { return this.sys.publishedVersion === undefined }

  isUpdated() { return this.sys.publishedVersion === undefined || (this.sys.version - this.sys.publishedVersion) > 1 }

  isPublished() { return !this.isDraft() }

  isArchived() { return this.sys.archivedVersion !== undefined }

  unarchive(version: number) {
    if (version !== this.sys.version) { throw new Error('Version mismatch') }
    if (!this.isArchived()) { throw new Error('Cannot unarchive a non-archived asset') }

    delete this.sys.archivedVersion
    ++this.sys.version
    return Promise.resolve(this)
  }

  archive(version: number) {
    if (version !== this.sys.version) { throw new Error('Version mismatch') }
    if (this.isPublished()) { throw new Error('Cannot archive a published asset') }

    this.sys.archivedVersion = this.sys.version
    ++this.sys.version
    return Promise.resolve(this)
  }

  update(version: number, fields: any) {
    if (version !== this.sys.version) { throw new Error('Version mismatch') }
    if (this.isArchived()) { throw new Error('Cannot update archived asset') }

    for (const file of Object.values((fields?.file ?? {}) as { [k: string]: any})) {
      if (file.details) {
        throw new Error('Cannot update the details on a file')
      }
    }

    this.fields = clone(fields)
    ++this.sys.version
    return Promise.resolve(this)
  }

  publish(version: number) {
    if (version !== this.sys.version) { throw new Error('Version mismatch') }
    if (this.isArchived()) { throw new Error('Cannot publish archived asset') }
    if (!this.isUpdated()) { throw new Error('Nothing to publish') }

    for (const file of Object.values((this.fields.file || {}) as { [k: string]: any})) {
      if (!file) { continue }
      if (file.upload || !file.url) {
        throw new Error('Cannot publish a file with non-processed assets')
      }
    }

    this.sys.publishedVersion = this.sys.version
    ++this.sys.version
    return Promise.resolve(this)
  }

  processForLocale(version: number, locale: string) {
    if (version !== this.sys.version) { throw new Error('Version mismatch') }
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
  const asset: any = makeAsset({
    file: {
      'en-US': null,
    },
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  // no update
  t.is(asset._server.sys.version, 1)
})

test('does not update assets that need no update', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset/nonce/no-cross-ref.png'
      }
    },
  })

  await processAsset({ asset, opts: { skipArchived: true, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  // no update
  t.is(asset._server.sys.version, 1)
})

test('updating but not publishing an unpublished asset', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset._server.isPublished())
})

test('publishing an updated asset with no pending changes and multiple locales', async t => {
  const asset: any = makeAsset({
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

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.is(asset._server.fields.file['en-UK'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset._server.isPublished())
  t.false(asset._server.isUpdated())
})

test('publishing an updated asset with no pending changes', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 2,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset._server.isPublished())
  t.false(asset._server.isUpdated())
})

test('updating but not publishing updated asset with pending changes', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.is(asset._server.sys.publishedVersion, 1)
  t.true(asset._server.isUpdated())
})

test('updating and publishing an asset with pending changes when forceRepublish is true', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    publishedVersion: 1
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: true, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset._server.isUpdated())
  t.true(asset._server.isPublished())
})

test('not publishing an asset if unpublished but forcePublish is true', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: true, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.false(asset._server.isPublished())
})

test('does nothing when dryRun is true', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 1,
    publishedVersion: 2,
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: true }, logger })
  t.is(asset._server.sys.version, 1)
  t.is(asset._server.sys.publishedVersion, 2)
})

test('does nothing when dryRun is true for archived assets', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    archivedVersion: 2
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: true }, logger })
  t.is(asset._server.sys.version, 3)
  t.is(asset._server.sys.archivedVersion, 2)
})

test('unarchives and rearchives if skipArchived is false', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    archivedVersion: 2
  })

  await processAsset({ asset, opts: { skipArchived: false, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset/nonce/file.png')
  t.true(asset._server.isArchived())
})

test('skips archived assets if skipArchived is true', async t => {
  const asset: any = makeAsset({
    file: {
      'en-US': {
        url: '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png'
      }
    },
    version: 3,
    archivedVersion: 2
  })

  await processAsset({ asset, opts: { skipArchived: true, processingAttempts: 3, forceRepublish: false, dryRun: false }, logger })
  t.is(asset._server.fields.file['en-US'].url, '//images.ctfassets.net/space/asset1/nonce/asset-id-cross-ref.png')
  t.true(asset._server.isArchived())
})
