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
  skipArchived: boolean
  forceRepublish: boolean
  dryRun: boolean
}

type ProcessResult = 'no-change' | 'updated-only' | 'updated-and-published'

export async function processAsset({ asset, opts, logger }: { asset: Asset, opts: AssetProcessingOpts, logger: Logger }): Promise<ProcessResult> {
  logger.trace({ asset }, 'Processing asset')
  const { dryRun, forceRepublish, skipArchived } = opts

  let result: ProcessResult = 'no-change'
  let updatedLocales = rewriteAssetUrls(asset, logger)

  if (updatedLocales.length > 0) {
    let didUnarchive = false
    if (asset.isArchived()) {
      if (skipArchived) {
        logger.info('Asset archived and skip-archived set, not updating')
        return 'no-change'
      }
      logger.debug('Unarchiving asset')
      asset = dryRun ? asset : await withTries(2, () => asset.unarchive())
      logger.trace({ asset }, 'Unarchive asset output')
      // Need to reprocess the resulting asset
      updatedLocales = rewriteAssetUrls(asset, logger)
      didUnarchive = true
    }

    if (updatedLocales.length > 0) {
      const publishAfterUpdate = asset.isPublished() && (forceRepublish || !asset.isUpdated())

      result = 'updated-only'

      logger.info({ updatedLocales, publishAfterUpdate, didUnarchive }, 'Fixing asset cross-references')

      logger.debug({ updatedLocales }, 'Updating asset with new URLs')
      asset = dryRun ? asset : await withTries(2, () => asset.update())
      logger.trace({ asset }, 'Update asset output')

      for (const locale of updatedLocales) {
        logger.debug({ locale }, 'Processing locale')
        asset = dryRun ? asset : await withTries(2, () => asset.processForLocale(locale))
        logger.trace({ asset }, 'Process locale output')
      }

      if (publishAfterUpdate) {
        result = 'updated-and-published'

        logger.debug('Publishing updated asset')
        asset = dryRun ? asset : await withTries(2, () => asset.publish())
        logger.trace({ asset }, 'Publish asset output')
      }
    } else {
      logger.warn('Unexpected: Asset needs no update after unarchiving?')
    }

    if (didUnarchive) {
      logger.debug('Rearchiving asset')
      asset = dryRun ? asset : await withTries(2, () => asset.archive())
    }
  } else {
    logger.info('Asset has no cross-references, update not required')
  }
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
      const assetLogger = logger.child({ assetId: asset.sys.id })
      try {
        const assetId = asset.sys.id
        if (n > 1) {
          // Reload the asset on retries
          asset = await environment.getAsset(assetId)
        }
        const assetResult = await processAsset({ asset, opts, logger: assetLogger })
        switch (assetResult) {
          case 'no-change':
            result.checked.push(assetId)
          case 'updated-only':
            result.updated.push(assetId)
          case 'updated-and-published':
            result.published.push(assetId)
        }
      } catch(err) {
        assetLogger.error({ err }, 'Error processing asset')
        throw err
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
