'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useNudgeModal } from '@/lib/command-palette/nudge-modal-store'

type GeneratingState = 'generating' | 'ready' | 'error'
type SendState = 'idle' | 'sending' | 'sent' | 'error'

interface NudgeResponse {
  subject: string
  body: string
}

export function NudgeModal() {
  const { open, group, roomId, roomName, workspaceId, closeNudgeModal } = useNudgeModal()

  const [generatingState, setGeneratingState] = useState<GeneratingState>('generating')
  const [sendState, setSendState] = useState<SendState>('idle')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open || !group) return

    setGeneratingState('generating')
    setSendState('idle')
    setSubject('')
    setBody('')

    fetch('/api/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personName: group.name ?? group.displayAddress ?? group.personKey,
        personEmail: group.displayAddress ?? group.personKey,
        items: group.loops.map(loop => ({
          description: loop.description,
          silenceDays: loop.age_days,
          dueDate: loop.due ?? undefined,
        })),
        roomName,
        workspaceId,
      }),
    })
      .then(r => r.json())
      .then((data: NudgeResponse) => {
        setSubject(data.subject)
        setBody(data.body)
        setGeneratingState('ready')
      })
      .catch(() => setGeneratingState('error'))
  // group.personKey ensures the effect re-runs when a different person is selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.personKey])

  async function handleSend() {
    if (!group) return
    setSendState('sending')
    try {
      const res = await fetch('/api/send-nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: group.displayAddress ?? group.personKey,
          subject,
          body,
          roomId,
          workspaceId,
        }),
      })
      if (!res.ok) throw new Error('send failed')
      setSendState('sent')
      setTimeout(() => closeNudgeModal(), 1500)
    } catch {
      setSendState('error')
    }
  }

  const recipientLabel = group?.name ?? group?.displayAddress ?? 'this person'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeNudgeModal() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {generatingState === 'generating'
              ? 'Writing your chase email...'
              : `Chase email to ${recipientLabel}`}
          </DialogTitle>
        </DialogHeader>

        {generatingState === 'generating' && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Writing your chase email...
          </div>
        )}

        {generatingState === 'error' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Could not generate a draft. Try again.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!group) return
                  setGeneratingState('generating')
                  fetch('/api/nudge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      personName: group.name ?? group.displayAddress ?? group.personKey,
                      personEmail: group.displayAddress ?? group.personKey,
                      items: group.loops.map(l => ({
                        description: l.description,
                        silenceDays: l.age_days,
                        dueDate: l.due ?? undefined,
                      })),
                      roomName,
                      workspaceId,
                    }),
                  })
                    .then(r => r.json())
                    .then((data: NudgeResponse) => { setSubject(data.subject); setBody(data.body); setGeneratingState('ready') })
                    .catch(() => setGeneratingState('error'))
                }}
              >
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={closeNudgeModal}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {generatingState === 'ready' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                disabled={sendState === 'sending' || sendState === 'sent'}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Body</label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={6}
                disabled={sendState === 'sending' || sendState === 'sent'}
                className="resize-none"
              />
            </div>
            {sendState === 'error' && (
              <p className="text-xs text-destructive">
                Could not send. Try again.
              </p>
            )}
          </div>
        )}

        {generatingState === 'ready' && (
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={closeNudgeModal} disabled={sendState === 'sending'}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sendState === 'sending' || sendState === 'sent' || !subject || !body}
            >
              {sendState === 'sending' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {sendState === 'sent' ? 'Sent.' : sendState === 'sending' ? 'Sending...' : 'Send'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
