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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không gợi ý được video tổng hợp.' }, { status: 400 })
  }
}
