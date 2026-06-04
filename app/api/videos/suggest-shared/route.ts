import { NextResponse } from 'next/server'
import { suggestPlanWideYoutubeVideo } from '@/lib/video-index'
import type { LearningPlan } from '@/lib/types'

export async function POST(request: Request) {
  const body = (await request.json()) as { plan?: LearningPlan }

  if (!body.plan) {
    return NextResponse.json({ error: 'Thiếu lộ trình học để gợi ý video tổng hợp.' }, { status: 400 })
  }

  try {
    const recommendation = await suggestPlanWideYoutubeVideo(body.plan)
    return NextResponse.json({ recommendation })
  } catch (error) {
    return NextResponse.json({ error: friendlyVideoError(error, 'Không gợi ý được video tổng hợp phù hợp.') }, { status: 400 })
  }
}

function friendlyVideoError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/video is not available|this video is not available|not available/i.test(message)) {
    return 'Một số kết quả YouTube không khả dụng nên không dùng được làm video tổng hợp.'
  }
  if (/yt-dlp|Command failed|youtube|ytsearch/i.test(message)) {
    return fallback
  }
  return message ? message.split('\n')[0].slice(0, 180) : fallback
}
