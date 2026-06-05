const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

/** Returns true if the file path has an image extension (case-insensitive). */
export function isImageFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return [...IMAGE_EXTENSIONS].some((extension) => lower.endsWith(extension));
}
