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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không gợi ý được video.' }, { status: 400 })
  }
}
