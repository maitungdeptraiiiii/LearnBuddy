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
    return NextResponse.json({ error: friendlyVideoError(error, 'Không gợi ý được video phù hợp. Hãy thử nhập YouTube URL thủ công hoặc bấm lại sau.') }, { status: 400 })
  }
}

function friendlyVideoError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/video is not available|this video is not available|not available/i.test(message)) {
    return 'Một số kết quả YouTube không khả dụng. Hãy bấm gợi ý lại hoặc dán URL video khác.'
  }
  if (/yt-dlp|Command failed|youtube|ytsearch/i.test(message)) {
    return fallback
  }
  return message ? message.split('\n')[0].slice(0, 180) : fallback
}
