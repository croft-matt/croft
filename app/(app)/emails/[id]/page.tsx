// Email detail view — to be built in the emails UI brief.
export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-neutral-400">Email {id}</p>
    </div>
  )
}
