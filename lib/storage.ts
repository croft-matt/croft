// Constructs a public URL for a file in the assets bucket.
// storage_path is the path within the bucket (e.g. workspace_id/jobs/jobId/filename).
export function getAssetUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return ''
  return `${base}/storage/v1/object/public/assets/${storagePath}`
}
