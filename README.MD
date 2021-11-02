# Npm The Fastest

## Key Features

- fast packages search
- auto install (see below)
- clipboard detection for `npm i -D esbuild`

## Before hit v0.1.0

Currently, extension is stable enough, but there some work that :

1. tests
2. algolia: increase search speed
3. yarn berry support

And even more.

**before v0.1.0 config is subject to change without any warnings**

## Auto Install

By default, whenever you change in editor and save package.json with dependencies removed or added, package manager with `install` command will be invoked.\

Also, by default whenever lockfiles are changed (usually because of git operations) `install` command also invoked.

## Future

I'm sorry for the icon, it's a just a stub to make extension distinguishable. I have plans to migrate all functionality from here.
