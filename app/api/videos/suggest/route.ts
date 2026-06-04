import { NextResponse } from 'next/server'
import { suggestYoutubeVideo } from '@/lib/video-index'
import type { LearningPlan, Lesson } from '@/lib/types'

export async function POST(request: Request) {
  const body = (await request.json()) as { plan?: LearningPlan; lesson?: Lesson | null; excludedUrls?: string[] }

  if (!body.plan) {
    return NextResponse.json({ error: 'Thiếu lộ trình học để gợi ý video.' }, { status: 400 })
  }

  try {
    const recommendation = await suggestYoutubeVideo(body.plan, body.lesson || null, body.excludedUrls || [])
    return NextResponse.json({ recommendation })
  } catch (error) {
    return NextResponse.json({ error: friendlyVideoError(error, 'Không gợi ý được video.') }, { status: 400 })
  }
}

function friendlyVideoError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  if (/video is not available|This video is not available|youtube/i.test(message)) {
    return 'Không gợi ý được video phù hợp hoặc video được chọn hiện không khả dụng. Hãy thử bấm gợi ý lại hoặc dán URL khác.'
  }
  return message ? message.split('\n')[0].slice(0, 220) : fallback
}
