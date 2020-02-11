import { Logger } from 'pino'

import { ClientAPI } from 'contentful-management'
import { Environment } from 'contentful-management/typings/environment'
import { Asset } from 'contentful-management/typings/asset'
import { Space } from 'contentful-management/typings/space'

import { CancellationToken } from './cancellation-token'
import { withTries, iteratePaginated, asyncMap, iterableToAsync } from './util'

const URL_PATH_REGEXP = /^(https?:)?\/\/[^/]+\/([^/]+)\/([^/]+)\/[^/]+\/[^/]+$/i
export function rewriteAssetUrls(asset: Asset, logger: Logger): string[] {
  const rewrittenLocales: string[] = []

  for (const [locale, file] of Object.entries(asset.fields.file || {})) {
    if (!file) {
      logger.trace({ locale }, 'File not set')
      continue
    }
    // Cannot be present, will result in an error
    delete file.details
    if (!file.url) {
      logger.trace({ locale }, 'URL not set for asset locale')
      continue
    }

    const match = file.url.match(URL_PATH_REGEXP)
    // This should not be possible, but better safe than sorry
    if (!match) {
      logger.warn({ locale, url: file.url }, 'Asset URL malformed for locale')
      continue
    }

    const protocol = match[1]
    const spaceId = match[2]
    const assetId = match[3]
    if (spaceId !== asset.sys.space!.sys.id || assetId !== asset.sys.id) {
      file.upload = protocol ? file.url : 'https:' + file.url
      delete file.url
      logger.trace({ locale, url: file.upload }, 'Rewrote asset URL into upload field')
      rewrittenLocales.push(locale)
    } else {
      logger.trace({ locale, url: file.url }, 'Asset URL for locale OK, leaving unmodified')
    }
  }

  return rewrittenLocales
}

interface AssetProcessingOpts {
  processingAttempts: number
  forceRepublish: boolean
  dryRun: boolean
}

type ProcessResult = 'no-change' | 'updated-only' | 'updated-and-published'

export async function processAsset({ asset, opts, logger }: { asset: Asset, opts: AssetProcessingOpts, logger: Logger }): Promise<ProcessResult> {
  const { dryRun, forceRepublish } = opts

  logger.info({ dryRun, forceRepublish, isDraft: asset.isDraft(), isPublished: asset.isPublished(), isUpdated: asset.isUpdated() }, 'Processing asset')
  logger.trace({ asset }, 'Original asset')

  const publishAfterUpdate = asset.isPublished() && (forceRepublish || !asset.isUpdated())
  const updatedLocales = rewriteAssetUrls(asset, logger)
  const needsUpdate = updatedLocales.length > 0

  let result: ProcessResult = 'no-change'
  if (needsUpdate) {
    logger.debug({ updatedLocales }, 'Updating asset')

    result = 'updated-only'
    asset = dryRun ? asset : await withTries(2, () => asset.update())
    logger.debug('Updating draft asset complete')
    logger.trace({ asset }, 'Updated asset')

    for (const locale of updatedLocales) {
      logger.debug({ locale }, 'Processing locale')
      // Grabbing the new asset is necessary for publishing later
      asset = dryRun ? asset : await withTries(2, () => asset.processForLocale(locale))
      logger.debug({ locale }, 'Processing locale complete')
      logger.trace({ asset }, 'Process locale output')
    }

    if (publishAfterUpdate) {
      result = 'updated-and-published'
      logger.debug('Publishing updated asset')
      asset = dryRun ? asset : await withTries(2, () => asset.publish())
      logger.debug('Publishing asset complete')
      logger.trace({ asset }, 'Publish asset output')
    } else {
      logger.debug('Not publishing asset that has other unpublished changes')
    }
  } else {
    logger.debug('Asset in correct state, update not required')
  }
  logger.info('Processing asset complete')
  return result
}

interface ProcessEnvironmentAssetsResult {
  checked: string[]
  updated: string[]
  published: string[]
}

export async function processEnvironmentAssets({
  environment, logger, cancelToken, opts
}: {
  environment: Environment,
  logger: Logger,
  opts: AssetProcessingOpts,
  cancelToken: CancellationToken
}): Promise<ProcessEnvironmentAssetsResult> {
  logger = logger.child({ envId: environment.sys.id })
  logger.info('Processing environment assets')

  const result = {
    checked: [] as string[],
    updated: [] as string[],
    published: [] as string[],
  }

  for await (let asset of iteratePaginated(environment, 'getAssets')) {
    await withTries(opts.processingAttempts, async n => {
      const assetId = asset.sys.id
      if (n > 1) {
        // Reload the asset on retries
        asset = await environment.getAsset(assetId)
      }
      const assetLogger = logger.child({ assetId: asset.sys.id })
      const assetResult = await processAsset({ asset, opts, logger: assetLogger })
      switch (assetResult) {
        case 'no-change':
          result.checked.push(assetId)
        case 'updated-only':
          result.updated.push(assetId)
        case 'updated-and-published':
          result.published.push(assetId)
      }
    })
    cancelToken.throwIfCancelled()
  }

  logger.info('Processing environment assets complete')
  return result
}

interface ProcessSpaceAssetsResult {
  [envId: string]: ProcessEnvironmentAssetsResult
}

export async function processSpaceAssets({
  space, envIds, logger, opts, cancelToken
}: {
  space: Space,
  envIds?: string[],
  logger: Logger,
  opts: AssetProcessingOpts,
  cancelToken: CancellationToken
}): Promise<ProcessSpaceAssetsResult> {
  logger = logger.child({ spaceId: space.sys.id })
  logger.info('Processing space assets')

  let environments: AsyncIterable<Environment | void>
  if (envIds === undefined) {
    // XXX: getEnvironments in the SDK does not support pagination, even though
    // it's supported in the backend
    //environments = await arrayFromAsyncIter(iteratePaginated(client, 'getEnvironments'))
    environments = iterableToAsync((await space.getEnvironments()).items.filter(env => !('aliasedEnvironment' in env.sys)))
  } else {
    // Users with a large number of environments may get stuck here for a long time,
    // which is why we go through the trouble to make this an async iterator
    environments = asyncMap(envIds, envId => space.getEnvironment(envId).catch(err => {
      logger.warn({ err, envId }, 'Could not fetch environment, skipping')
    }))
  }

  const result: ProcessSpaceAssetsResult = {}
  for await (const environment of environments) {
    if (!environment) { continue }
    result[environment.sys.id] = await processEnvironmentAssets({ environment, logger, opts, cancelToken })
    cancelToken.throwIfCancelled()
  }

  logger.info('Processing space assets complete')
  return result
}

interface ProcessAssetsResult {
  [spaceId: string]: ProcessSpaceAssetsResult
}

export async function processAssets({
  client, spaceIds, envIds, opts, cancelToken, logger
}: {
  client: ClientAPI,
  spaceIds?: string[],
  envIds?: string[],
  opts: AssetProcessingOpts,
  cancelToken: CancellationToken,
  logger: Logger
}): Promise<ProcessAssetsResult> {
  logger.info('Processing assets')

  let spaces: AsyncIterable<Space | void>
  if (!spaceIds) { // All spaces
    logger.debug('Fetching list of spaces for user')
    spaces = iteratePaginated(client, 'getSpaces')
  } else {
    // Users with a large number of spaces may get stuck here for a long time,
    // which is why we go through the trouble to make this an async iterator
    spaces = asyncMap(spaceIds, spaceId => client.getSpace(spaceId).catch(err => {
      logger.warn({ err, spaceId }, 'Could not fetch space, skipping')
    }))
  }

  const result: ProcessAssetsResult = {}
  for await (const space of spaces) {
    if (!space) { continue }
    result[space.sys.id] = await processSpaceAssets({ space, envIds, logger, opts, cancelToken })
    cancelToken.throwIfCancelled()
  }

  logger.info('Processing assets complete')
  return result
}
