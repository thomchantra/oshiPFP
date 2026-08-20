export interface TestImage {
  id: string
  url: string
}

// Discovers curated test images from a gitignored top-level dir (see
// .gitignore) — no manifest to maintain by hand; drop files in and reload.
// import.meta.glob sees the filesystem at dev/build time regardless of
// gitignore (that only affects git tracking, not Vite's file resolution).
// Extension list covers both cases explicitly — glob patterns don't support
// case-insensitive matching, and camera/phone exports commonly use
// uppercase (e.g. iPhone's .JPG).
const modules = import.meta.glob(
  '/lab-test-images/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

export const TEST_IMAGES: TestImage[] = Object.entries(modules)
  .map(([path, url]) => ({ id: path.replace('/lab-test-images/', ''), url }))
  .sort((a, b) => a.id.localeCompare(b.id))

export async function fetchTestImageFile(image: TestImage): Promise<File> {
  const response = await fetch(image.url)
  const blob = await response.blob()
  return new File([blob], image.id, { type: blob.type })
}
