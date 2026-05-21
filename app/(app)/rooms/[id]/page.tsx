// Room view — to be built in the rooms UI brief.
export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-neutral-400">Room {id}</p>
    </div>
  )
}
