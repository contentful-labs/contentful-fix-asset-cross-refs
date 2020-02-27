# fix-asset-cross-refs tool

## Purpose

This tool exists to automate the task of updating all assets in a space (or
spaces) to ensure that they are not cross-referencing other assets or other
spaces.

### Why Is This Needed?

Contentful previously allowed assets to use URLs from other assets within the
same space, or within other spaces altogether. We call these "asset
cross-references". Most spaces never had asset cross-references, and are no
longer able to create them. However, there are existing spaces that need
to reprocess their assets so that there are no longer any asset cross-references.

We're providing this tool so that users may reprocess their assets themselves
with minor effort.

## Requirements

Node 10+, please. You can check your version by running:

```sh
$ node --version
v12.14.1
```

If you have an older Node version (Node 9 or below), you will need to
[install a later version](https://nodejs.org/en/).

## Installation & Basic Setup

### Option 1: Install Globally

You can install this repository from Github:

```sh
$ npm i -g github:contentful-labs/contentful-fix-asset-cross-refs
```

This will download and build (compile from TypeScript to Javascript) the
project.  Assuming global npm binaries are in your path, you should then be
able to run:

```sh
$ contentful-fix-asset-cross-refs <options>
```

See below for a full list of options.


### Option 2: Clone And Build

You can clone this from source and run `make` to build it, and then execute:

```sh
$ git clone https://github.com/contentful-labs/contentful-fix-asset-cross-refs
$ cd contentful-fix-asset-cross-refs
$ make   # or npm install && npm run build if you don't have make installed
```

Then run:

```sh
$ bin/fix-asset-cross-refs <options>
```

See below for a full list of options.

### Option 3: Using `npx`

The easiest way if you have a relatively modern version of `npm`, but not so
fast (because npx doesn't leave a copy installed) if you'll call this multiple
times:

```sh
$ npx github:contentful-labs/contentful-fix-asset-cross-refs <options>
```

See below for a full list of options.

## Usage

Quick start:

First, fetch an existing CMA access token, or create a new one. (You can go to
[the Contentful web app](https://app.contentful.com) and go to `Settings` ->
`API Keys` -> `Content management tokens` to create a new CMA token.)

Then, run the tool:

```sh
$ contentful-fix-asset-cross-refs \
    --access-token <cma-access-token> \
    --all-spaces \
    --all-environments \
    --dry-run `# Remove after verifying output looks sane` \
    -v        `# enable verbose output if you like` \
    | tee fix-cross-refs.log
```

We **strongly recommend** redirecting or `tee`ing the tool output to a file
so you can inspect it later. If any serious errors (failure to update an
asset, failure to process an asset URL, or failure to publish an asset) are
encountered during processing, the program will immediately stop.

Once you are satisfied that the operations look sane, you can remove the
`--dry-run` flag.

**NOTE:** If other users are concurrently modifying your assets, this utility
is likely to fail with a version mismatch. Please run this tool during a quiet
period to reduce any conflicts. If this tool cannot safely update an asset
because it has been modified simultaneously by someone else, it will stop.

### Options

The tool accepts a variety of flags:

| Flag | Meaning |
| ---- | ------- |
| `--access-token <token>` | the access token to use (e.g. a CMA access token) |
| `--spaces <space1> <space2> ...` | the list of space ids to process |
| `--all-spaces` | alternately, process all spaces accessible by this access token |
| `--environments <env1> <env2> ...` | the list of environments to process |
| `--all-environments` | alternately, process all environments in the specified spaces |
| `--force-republish` | publishes assets after updating even if they've otherwise drifted from the published version |
| `--dry-run` | if set, won't actually perform any work, will merely pretend |
| `--skip-archived` | if set, archived assets with cross-references won't be processed |
| `--verbose` or `-v` | increase the logging verbosity (can be used up to two times) |

Additionally,
* `--all-spaces` or `--spaces` must be specified, but not both
* `--all-environments` or `--environments` must be specified, but not both

#### `--dry-run`

You may wish to ensure the behavior of the tool looks sane before running it
over all of your data. You may do that by running with `--dry-run`. No data
will be modified on the server, but the program will output the steps it
would perform.


#### `--verbose` (or `-v`)

For a detailed list of every operation, you may increase the verbosity by
running with `-v` or `-vv`.

#### `--force-republish`

**Be careful with this flag.**

This tool will automatically republish assets after modifying them *if and only
if* that asset has no other pending changes. If any other changes are detected,
those assets have their URLs fixed, but are left in an draft state.

If you'd like to force-republish all assets regardless of whether other changes
are pending, you can use the `--force-republish` flag. **This might publish
unintended changes, so be careful.**

Assets that have never been published will never be published by this tool.

#### `--skip-archived`

In order to process archived assets, this tool must first unarchive (which turns
them into drafts), process, and rearchive them. Some users may not want this for
compliance or performance reasons. You may set the `--skip-archived` flag to
avoid processing archived assets.

Note: This may mean that, in the future, those assets will lose access to their
image URLs. It is not recommended to set this flag without a good reason.

### Prettier Output

This tool logs using `pino`, which means you'll see log output as JSON. This
is nice for documenting each step in the process, especially if you're running
in verbose mode. If you'd like a bit prettier output, you can pipe the output
to `pino-pretty`:

```sh
$ npm i -g pino-pretty
... installs pino-pretty globally ...
$ contentful-fix-asset-cross-refs <options> | pino-pretty
... prettier log output! ...
```

### Caveats

This tool only checks the most recent versions of assets from the CMA. It does
not check currently-published from the CDA. Practically, this means that if
you have an asset that:

1. Has a cross-reference in its published version, and
2. Has had the cross-references already fixed in its most current draft state

Then this tool will not find and fix those assets. We suppose this is a fairly
uncommon edge-case, which is why the tool does not handle this case.
