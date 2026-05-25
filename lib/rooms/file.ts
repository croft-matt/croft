import { createAdminClient } from '@/lib/supabase/admin'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import stringSimilarity from 'string-similarity'

// Minimum Dice coefficient for a fuzzy name match at a given tree level.
// Applied after exact match fails. The year-conflict guard overrides this
// regardless of score. Do not lower below 0.75 without testing against
// real workspace data. See brief 17 for calibration notes.
const FUZZY_MATCH_THRESHOLD = 0.82

function extractYear(s: string): string | null {
  const match = s.match(/\b(20\d{2})\b/)
  return match ? match[1] : null
}

function yearsConflict(a: string, b: string): boolean {
  const yearA = extractYear(a)
  const yearB = extractYear(b)
  return yearA !== null && yearB !== null && yearA !== yearB
}

function findFuzzyMatch(
  suggestion: string,
  siblings: Array<{ id: string; name: string }>,
): string | null {
  if (siblings.length === 0) return null

  const suggestionLower = suggestion.toLowerCase()
  const names = siblings.map((r) => r.name.toLowerCase())
  const { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(suggestionLower, names)

  if (
    bestMatch.rating >= FUZZY_MATCH_THRESHOLD &&
    !yearsConflict(suggestion, siblings[bestMatchIndex].name)
  ) {
    console.log(
      `fileEmailToRooms: fuzzy match "${suggestion}" -> "${siblings[bestMatchIndex].name}" ` +
        `(score: ${bestMatch.rating.toFixed(3)})`,
    )
    return siblings[bestMatchIndex].id
  }

  return null
}

// Files a processed email into rooms based on its room_suggestions paths.
// Each path is an ordered array of strings from root to leaf.
// For each segment in a path:
//   - If a room with that name exists under the correct parent: use it.
//   - If a fuzzy match exists under the correct parent: use it.
//   - If neither: create the room at that level.
// The email is filed into the leaf room of each path.
// Returns the IDs of all leaf rooms the email was filed into.
// Safe to call multiple times on the same email -- room_emails upsert is idempotent.
export async function fileEmailToRooms(
  emailId: string,
  workspaceId: string,
  roomPaths: string[][],
): Promise<{ matchedRoomIds: string[] }> {
  if (roomPaths.length === 0) return { matchedRoomIds: [] }

  // Normalise: guard against old-format string[] data arriving as string[][] at runtime.
  // Old extractions stored room_suggestions as flat strings before the path-based rewrite.
  const paths: string[][] = (roomPaths as unknown as Array<string | string[]>).map((p) =>
    typeof p === 'string' ? [p] : p,
  )

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Fetch all active rooms for this workspace once.
  // Kept in memory and updated as rooms are created, so subsequent path
  // segments can find just-created nodes without another DB round trip.
  const { data: existingRooms, error: roomLookupError } = await supabase
    .from('rooms')
    .select('id, name, parent_room_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)

  if (roomLookupError) {
    console.error(`fileEmailToRooms: room lookup failed for ${emailId}:`, roomLookupError.message)
    return { matchedRoomIds: [] }
  }

  const allRooms: Array<{ id: string; name: string; parent_room_id: string | null }> =
    existingRooms ?? []

  const matchedRoomIds: string[] = []

  for (const path of paths) {
    if (path.length === 0) continue

    let parentId: string | null = null
    let leafId: string | null = null
    let pathBroken = false

    for (const segment of path) {
      // Siblings: rooms at this level (same parent_room_id).
      const siblings = allRooms.filter((r) => r.parent_room_id === parentId)

      // Step 1: Exact match (case-insensitive).
      const exactMatch = siblings.find(
        (r) => r.name.toLowerCase() === segment.toLowerCase(),
      )

      if (exactMatch) {
        parentId = exactMatch.id
        leafId = exactMatch.id
        continue
      }

      // Step 2: Fuzzy match among siblings only (not the full room list).
      const fuzzyId = findFuzzyMatch(segment, siblings)

      if (fuzzyId) {
        parentId = fuzzyId
        leafId = fuzzyId
        continue
      }

      // Step 3: No match. Create a new room at this level.
      const insertResult = await supabase
        .from('rooms')
        .insert({
          workspace_id: workspaceId,
          name: segment,
          parent_room_id: parentId,
          room_data: {},
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()
      const createError = insertResult.error
      const newRoom = insertResult.data as { id: string } | null

      if (createError || !newRoom) {
        console.error(
          `fileEmailToRooms: room creation failed for "${segment}" ` +
            `(parent: ${parentId ?? 'root'}):`,
          createError?.message,
        )
        pathBroken = true
        break
      }

      // Register the new room in memory so the next segment in this path
      // (and subsequent paths in the same extraction) can find it.
      allRooms.push({ id: newRoom.id, name: segment, parent_room_id: parentId })
      parentId = newRoom.id
      leafId = newRoom.id
    }

    if (!pathBroken && leafId) {
      matchedRoomIds.push(leafId)
    }
  }

  // File the email into all matched leaf rooms.
  if (matchedRoomIds.length > 0) {
    const rows = matchedRoomIds.map((roomId) => ({
      room_id: roomId,
      email_id: emailId,
      source: 'ai' as const,
    }))

    const { error: filingError } = await supabase
      .from('room_emails')
      .upsert(rows, { onConflict: 'room_id,email_id', ignoreDuplicates: true })

    if (filingError) {
      console.error(`fileEmailToRooms: filing failed for ${emailId}:`, filingError.message)
    }

    // Broadcast absolute room count so the processing gate shows the live total.
    // Fires on every filing (new room or existing) so the client can set rather
    // than increment, avoiding drift from missed events.
    const { count: roomCount } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)

    broadcastToWorkspace(workspaceId, 'room_created', { count: roomCount ?? 0 }).catch(
      (err: unknown) => console.error(`fileEmailToRooms: room_created broadcast failed:`, err),
    )
  }

  return { matchedRoomIds }
}
